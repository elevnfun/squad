"""Contest calendar: which contests exist, when they go live, when a result is final, and the owner's release.

Contests (rows of `contests`): one 'blitz_matchday' per UK date with a launch-league kickoff, one 'blitz_week'
and one 'draft_week' per week. A week runs Tuesday to Monday, UK time. Draft locks at the first kickoff from
Friday to Monday and scores the matches of those four days; the Blitz week adds up a wallet's best 3 matchday totals.

States: open -> live (first kickoff) -> review (15 minutes after the last match ends) -> final (released).
A contest with under 3 entrants becomes 'rolled' when released, and one whose every match was called off
becomes 'rolled' without a release. With `[boards].manual_review` on, the owner calls `release`; with it off,
`tick` releases at once. Releasing only credits winners (see winnings.credit); each winner collects later.

Callers pass `conn` (they commit) and `now`.
"""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from psycopg.rows import dict_row

from . import pots
from .config import CFG, launch_leagues

UK = ZoneInfo("Europe/London")
ENDED = ("FT", "AET", "PEN")                        # the match was played to the end
CALLED_OFF = ("PST", "CANC", "ABD", "AWD", "WO")    # it will not be played (or not now): no longer holds a contest open
KIND_ORDER = {"blitz_matchday": 0, "draft_week": 1, "blitz_week": 2}   # a week is judged after its matchdays
LAMPORTS = 1_000_000_000


def _now(now):
    return now or datetime.now(timezone.utc)


# --------------------------------------------------------------- calendar ---
def uk_date(dt):
    """The Europe/London calendar date of a timestamp."""
    return dt.astimezone(UK).date()


def week_start(d):
    """The Tuesday on or before date d."""
    return d - timedelta(days=(d.weekday() - 1) % 7)


def ended_at(fixture):
    """When a match ended: kickoff + match_hours. An estimate, because fixtures hold no full-time time.
    `fixture` is any row with a `kickoff`. Replace the body when real full-time timestamps are stored."""
    return fixture["kickoff"] + timedelta(hours=CFG["gameweeks"]["match_hours"])


def _get(conn, contest):
    if isinstance(contest, dict):
        return contest
    return conn.cursor(row_factory=dict_row).execute("SELECT * FROM contests WHERE id = %s", (contest,)).fetchone()


def _span(c):
    """The UK dates (first, last) a contest covers."""
    if c["kind"] == "blitz_matchday":
        return c["day"], c["day"]
    ws = c["week_start"]
    return (ws, ws + timedelta(days=6)) if c["kind"] == "blitz_week" else (ws + timedelta(days=3), ws + timedelta(days=6))


def fixtures_of(conn, contest):
    """The launch-league fixtures a contest covers (id, league_id, kickoff, status), earliest first.
    `contest` is a contests row as a dict, or its id."""
    lo, hi = _span(_get(conn, contest))
    return conn.cursor(row_factory=dict_row).execute(
        """SELECT id, league_id, kickoff, status FROM fixtures
           WHERE league_id = ANY(%s) AND (kickoff AT TIME ZONE 'Europe/London')::date BETWEEN %s AND %s
           ORDER BY kickoff, id""", (list(launch_leagues().values()), lo, hi)).fetchall()


# ----------------------------------------------------------------- ensure ---
def ensure(conn, now=None, days_ahead=14):
    """Create the contests missing for fixtures from the start of the current Blitz week to now + days_ahead.
    Safe to repeat. Also moves a still-open Draft's lock if its fixtures moved. Returns how many were created."""
    now = _now(now)
    first = week_start(uk_date(now))
    last = uk_date(now + timedelta(days=days_ahead))
    stop = week_start(last) + timedelta(days=7)         # whole weeks, so a Draft lock is never judged on half a week
    kickoffs = [r[0] for r in conn.execute(
        """SELECT kickoff FROM fixtures WHERE league_id = ANY(%s)
           AND (kickoff AT TIME ZONE 'Europe/London')::date >= %s AND (kickoff AT TIME ZONE 'Europe/London')::date < %s
           ORDER BY kickoff""", (list(launch_leagues().values()), first, stop))]
    made = 0
    days = sorted({uk_date(k) for k in kickoffs if uk_date(k) <= last})
    for d in days:
        made += conn.execute("""INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, %s)
                                ON CONFLICT (day) WHERE kind = 'blitz_matchday' DO NOTHING""",
                             (d, week_start(d))).rowcount
    for ws in sorted({week_start(d) for d in days}):
        made += conn.execute("""INSERT INTO contests (kind, week_start) VALUES ('blitz_week', %s)
                                ON CONFLICT (week_start) WHERE kind = 'blitz_week' DO NOTHING""", (ws,)).rowcount
        lock = [k for k in kickoffs if ws + timedelta(days=3) <= uk_date(k) <= ws + timedelta(days=6)]
        if not lock:
            continue                                    # no fixtures from Friday to Monday: no Draft this week
        opens = datetime.combine(ws, time(0), tzinfo=UK)
        made += conn.execute("""INSERT INTO contests (kind, week_start, opens_at, locks_at) VALUES ('draft_week', %s, %s, %s)
                                ON CONFLICT (week_start) WHERE kind = 'draft_week' DO NOTHING""",
                             (ws, opens, min(lock))).rowcount
        conn.execute("""UPDATE contests SET locks_at = %s WHERE kind = 'draft_week' AND week_start = %s
                        AND state = 'open' AND locks_at IS DISTINCT FROM %s""", (min(lock), ws, min(lock)))
    return made


# ------------------------------------------------------------------- tick ---
def tick(conn, now=None, sol_usd=None):
    """Advance every contest that is not yet final or rolled. Returns [(contest_id, from_state, to_state)].
    sol_usd (dollars per SOL) is only needed to release a Blitz week automatically."""
    now = _now(now)
    out = []
    rows = conn.cursor(row_factory=dict_row).execute(
        "SELECT * FROM contests WHERE state NOT IN ('final', 'rolled') ORDER BY id").fetchall()
    for c in sorted(rows, key=lambda c: (KIND_ORDER[c["kind"]], c["id"])):
        cid, state = c["id"], c["state"]
        fixtures = fixtures_of(conn, c)
        if not fixtures:
            continue
        if state == "review":                           # waiting for release: only an automatic one can still happen
            if not CFG["boards"]["manual_review"] and not (c["kind"] == "blitz_week" and not sol_usd):
                release(conn, cid, "auto", now, sol_usd)
                out.append((cid, "review", "final"))
            continue
        if state == "open":
            opens = c["locks_at"] if c["kind"] == "draft_week" and c["locks_at"] else fixtures[0]["kickoff"]
            if now < opens:
                continue
            conn.execute("UPDATE contests SET state = 'live' WHERE id = %s", (cid,))
            out.append((cid, "open", "live"))
        if any(f["status"] not in ENDED + CALLED_OFF for f in fixtures):
            continue                                    # a match is still to play or in play
        if c["kind"] == "blitz_week" and conn.execute(
                """SELECT 1 FROM contests WHERE kind = 'blitz_matchday' AND week_start = %s
                   AND state NOT IN ('final', 'rolled')""", (c["week_start"],)).fetchone():
            continue                                    # the week waits for its matchdays
        played = [f for f in fixtures if f["status"] in ENDED]
        if not played:
            conn.execute("UPDATE contests SET state = 'rolled' WHERE id = %s", (cid,))
            out.append((cid, "live", "rolled"))
            continue
        last_end = max(ended_at(f) for f in played)
        final_at = last_end + timedelta(minutes=CFG["boards"]["final_after_minutes"])
        conn.execute("UPDATE contests SET last_match_ends_at = %s, final_at = %s WHERE id = %s", (last_end, final_at, cid))
        if now < final_at:
            continue
        conn.execute("UPDATE contests SET state = 'review' WHERE id = %s", (cid,))
        out.append((cid, "live", "review"))
        if not CFG["boards"]["manual_review"] and not (c["kind"] == "blitz_week" and not sol_usd):
            release(conn, cid, "auto", now, sol_usd)
            out.append((cid, "review", "final"))
    return out


# ---------------------------------------------------------------- results ---
def build_results(conn, contest_id):
    """(Re)write the results rows of a contest from the scores. Rows already final are left alone."""
    kind, week = conn.execute("SELECT kind, week_start FROM contests WHERE id = %s", (contest_id,)).fetchone()
    if kind == "blitz_week":        # the sum of a wallet's best 3 matchday totals that week (all of them, if fewer)
        select, args = ("""SELECT %s, t.wallet, SUM(t.points), SUM(t.captain_points) FROM (
                               SELECT r.wallet, r.points, r.captain_points, ROW_NUMBER() OVER (
                                   PARTITION BY r.wallet ORDER BY r.points DESC, r.captain_points DESC, r.contest_id) AS n
                               FROM results r JOIN contests c ON c.id = r.contest_id
                               WHERE c.kind = 'blitz_matchday' AND c.week_start = %s) t
                           WHERE t.n <= %s GROUP BY t.wallet""",
                        (contest_id, week, CFG["blitz"]["weekly_best_matchdays"]))
    else:                           # the sum over a wallet's entries; no score yet counts as 0
        select, args = ("""SELECT e.contest_id, e.wallet, COALESCE(SUM(s.points), 0), COALESCE(SUM(s.captain_points), 0)
                           FROM entries e LEFT JOIN entry_scores s ON s.entry_id = e.id
                           WHERE e.contest_id = %s GROUP BY e.contest_id, e.wallet""", (contest_id,))
    conn.execute(f"""INSERT INTO results (contest_id, wallet, points, captain_points) {select}
                     ON CONFLICT (contest_id, wallet) DO UPDATE
                     SET points = EXCLUDED.points, captain_points = EXCLUDED.captain_points
                     WHERE NOT results.is_final""", args)


def release(conn, contest_id, by, now=None, sol_usd=None):
    """The owner's release (or the automatic one): rank, split the pot and credit the winners. Nothing is sent.
    Only from state 'review'. Returns [(wallet, place, lamports)]."""
    from . import winnings
    now = _now(now)
    kind, state = conn.execute("SELECT kind, state FROM contests WHERE id = %s FOR UPDATE", (contest_id,)).fetchone()
    if state != "review":
        raise ValueError(f"Contest {contest_id} is {state}; only a contest in review can be released.")
    if kind == "blitz_week" and not (sol_usd and sol_usd > 0):
        raise ValueError("The SOL price in dollars is needed to release the weekly Blitz prize.")
    build_results(conn, contest_id)
    if kind == "blitz_week":
        pot = round(CFG["blitz"]["weekly_prize_usd"] / sol_usd * LAMPORTS)
        conn.execute("UPDATE contests SET pot_lamports = %s WHERE id = %s", (pot, contest_id))
    else:
        pots.fund(conn, contest_id)
    prizes = pots.settle(conn, contest_id)
    for wallet, _, lamports in prizes:
        if lamports > 0:
            winnings.credit(conn, wallet, lamports, contest_id, now)
    conn.execute("""UPDATE contests SET state = 'final', released_at = %s, released_by = %s
                    WHERE id = %s AND state = 'review'""", (now, by, contest_id))
    return prizes


# ------------------------------------------------------------------ reads ---
def board(conn, contest_id, limit=50):
    """A contest's board for the Ranks page: place (NULL until released), wallet, points, captain_points,
    prize_lamports. Reads the results rows, so run build_results after scoring to keep a live board fresh."""
    return conn.cursor(row_factory=dict_row).execute(
        """SELECT place, wallet, points, captain_points, prize_lamports FROM results WHERE contest_id = %s
           ORDER BY place NULLS LAST, points DESC, captain_points DESC, wallet LIMIT %s""",
        (contest_id, limit)).fetchall()


def current(conn, now=None):
    """What a player sees today: today's matchday (else the next one), this week's Blitz week, and this
    week's Draft (else the next). Each is a dict; a missing contest is left out."""
    today = uk_date(_now(now))
    ws = week_start(today)
    cur = conn.cursor(row_factory=dict_row)
    found = [
        cur.execute("""SELECT * FROM contests WHERE kind = 'blitz_matchday' AND day >= %s
                       ORDER BY day LIMIT 1""", (today,)).fetchone(),
        cur.execute("SELECT * FROM contests WHERE kind = 'blitz_week' AND week_start = %s", (ws,)).fetchone(),
        cur.execute("""SELECT * FROM contests WHERE kind = 'draft_week' AND week_start >= %s
                       ORDER BY week_start LIMIT 1""", (ws,)).fetchone(),
    ]
    out = []
    for c in filter(None, found):
        fx = fixtures_of(conn, c)
        out.append({"id": c["id"], "kind": c["kind"], "day": c["day"], "week_start": c["week_start"],
                    "state": c["state"], "locks_at": c["locks_at"], "pot_lamports": c["pot_lamports"],
                    "first_kickoff": fx[0]["kickoff"] if fx else None, "fixtures": len(fx)})
    return out
