"""Matchday Blitz: squads, locking, scoring and a wallet's view (rules: docs/blueprint/BLITZ.md, config [blitz]).

A matchday is a 'blitz_matchday' contest. A squad is one `entries` row (slot, fixture_id, captain_id) with
`squad_size` rows in `entry_players`. A wallet may have min(squads_per_matchday, fixtures that day) squads,
one per fixture. A squad can change until its fixture kicks off; then `lock` sets `locked_at` for good.
A postponed or cancelled fixture never locks, and a squad left on it scores 0.

Points: each player's `player_match_scores.base` in the squad's fixture (core + involvement; the match
bonus is deferred in config, so it is not counted), the captain times `captain_multiplier`.
States: open -> live (kicked off) -> full_time (ended) -> banked (ended + final_after_minutes and every
score of the fixture is final). A banked `entry_scores` row (is_final) is never written again.

No network calls: the caller passes the wallet's $ELEVN balance. Callers pass `conn` (they commit) and `now`.
"""

from datetime import datetime, timedelta, timezone

from psycopg.json import Jsonb
from psycopg.rows import dict_row

from . import contests
from .config import CFG

BLITZ = CFG["blitz"]
NOT_PLAYED = ("PST", "CANC", "AWD", "WO")       # never kicks off here: its squads never lock and score 0
DONE = contests.ENDED + ("ABD",)                # over; an abandoned match keeps the points earned


class BlitzError(Exception):
    """A refusal, with a message a player can read."""


def _now(now):
    return now or datetime.now(timezone.utc)


def _rows(conn, sql, args=()):
    return conn.cursor(row_factory=dict_row).execute(sql, args).fetchall()


def _fixture(conn, fixture_id):
    rows = _rows(conn, "SELECT id, kickoff, status, home_club_id, away_club_id FROM fixtures WHERE id = %s",
                 (fixture_id,))
    return rows[0] if rows else None


def kicked_off(f, now):
    """True once a fixture has started (and was not called off)."""
    return f["status"] not in NOT_PLAYED and (now >= f["kickoff"] or f["status"] != "NS")


def _state(f, locked, now):
    if not (locked or kicked_off(f, now)):
        return "open"
    if f["status"] in NOT_PLAYED:
        return "open"
    return "full_time" if f["status"] in DONE else "live"


def _squad_ok(conn, f, player_ids, captain_id):
    """Problems with a squad on fixture row f (not the kickoff time)."""
    size, per_club = BLITZ["squad_size"], BLITZ["min_per_club"]
    problems = []
    ids = list(player_ids)
    if len(ids) != size or len(set(ids)) != len(ids):
        problems.append(f"A squad needs exactly {size} different players.")
    clubs = {r[0]: r[1] for r in conn.execute("SELECT id, club_id FROM players WHERE id = ANY(%s)", (ids,))}
    mine = [clubs.get(p) for p in set(ids)]
    if any(c not in (f["home_club_id"], f["away_club_id"]) for c in mine):
        problems.append("Every player must play for one of the two clubs in this fixture.")
    elif len(set(ids)) == size:
        for club in (f["home_club_id"], f["away_club_id"]):
            if mine.count(club) < per_club:
                name = conn.execute("SELECT name FROM clubs WHERE id = %s", (club,)).fetchone()[0]
                problems.append(f"Pick at least {per_club} player from {name}.")
    if captain_id not in ids:
        problems.append("The captain must be one of the squad's players.")
    return problems


def check(conn, fixture_id, player_ids, captain_id):
    """Plain-English problems with a squad (empty list = valid). Saves nothing."""
    f = _fixture(conn, fixture_id)
    if f is None:
        return ["That fixture does not exist."]
    return _squad_ok(conn, f, player_ids, captain_id)


def _contest(conn, contest_id):
    rows = _rows(conn, "SELECT * FROM contests WHERE id = %s AND kind = 'blitz_matchday' FOR UPDATE", (contest_id,))
    if not rows:
        raise BlitzError("That matchday does not exist.")
    return rows[0]


def _allowed(conn, contest):
    """(fixture ids of the matchday, squads a wallet may have on it)."""
    ids = [f["id"] for f in contests.fixtures_of(conn, contest)]
    return ids, min(BLITZ["squads_per_matchday"], len(ids))


def _existing(conn, contest_id, wallet, slot):
    rows = _rows(conn, "SELECT id, fixture_id, locked_at FROM entries WHERE contest_id = %s AND wallet = %s AND slot = %s",
                 (contest_id, wallet, slot))
    return rows[0] if rows else None


def _assert_editable(conn, entry, now):
    f = _fixture(conn, entry["fixture_id"])
    if entry["locked_at"] or (f and kicked_off(f, now)):
        raise BlitzError("That squad is locked because its match has kicked off.")


# ------------------------------------------------------------------ write ---
def save(conn, wallet, contest_id, slot, fixture_id, player_ids, captain_id, balance, now=None):
    """Create or replace the squad in a slot. Returns the entry id. Raises BlitzError on any refusal."""
    now = _now(now)
    contest = _contest(conn, contest_id)
    if balance < BLITZ["requirement"]:
        raise BlitzError(f"Holding {BLITZ['requirement']:,} $ELEVN is needed to save a squad.")
    fixtures, allowed = _allowed(conn, contest)
    if not 1 <= slot <= allowed:
        raise BlitzError(f"This matchday allows {allowed} squad{'s' if allowed != 1 else ''}.")
    if fixture_id not in fixtures:
        raise BlitzError("That fixture is not part of this matchday.")
    f = _fixture(conn, fixture_id)
    if kicked_off(f, now):
        raise BlitzError("That match has already kicked off.")
    problems = _squad_ok(conn, f, player_ids, captain_id)
    if problems:
        raise BlitzError(" ".join(problems))
    old = _existing(conn, contest_id, wallet, slot)
    if old:
        _assert_editable(conn, old, now)
    if conn.execute("SELECT 1 FROM entries WHERE contest_id = %s AND wallet = %s AND fixture_id = %s AND slot <> %s",
                    (contest_id, wallet, fixture_id, slot)).fetchone():
        raise BlitzError("You already have a squad on that fixture.")
    if old:
        conn.execute("UPDATE entries SET fixture_id = %s, captain_id = %s, updated_at = %s WHERE id = %s",
                     (fixture_id, captain_id, now, old["id"]))
        conn.execute("DELETE FROM entry_players WHERE entry_id = %s", (old["id"],))
        entry_id = old["id"]
    else:
        entry_id = conn.execute("""INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id, created_at, updated_at)
                                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                                (contest_id, wallet, slot, fixture_id, captain_id, now, now)).fetchone()[0]
    for p in player_ids:
        conn.execute("INSERT INTO entry_players (entry_id, player_id) VALUES (%s, %s)", (entry_id, p))
    return entry_id


def remove(conn, wallet, contest_id, slot, now=None):
    """Delete a squad that has not locked. Raises BlitzError if it is locked or missing."""
    now = _now(now)
    _contest(conn, contest_id)
    old = _existing(conn, contest_id, wallet, slot)
    if not old:
        raise BlitzError("There is no squad in that slot.")
    _assert_editable(conn, old, now)
    conn.execute("DELETE FROM entries WHERE id = %s", (old["id"],))


def lock(conn, now=None):
    """Lock every unlocked squad whose fixture has kicked off. Returns how many were locked."""
    now = _now(now)
    return conn.execute(
        """UPDATE entries e SET locked_at = %s FROM fixtures f
           WHERE f.id = e.fixture_id AND e.locked_at IS NULL AND f.status <> ALL(%s)
             AND (f.kickoff <= %s OR f.status <> 'NS')""", (now, list(NOT_PLAYED), now)).rowcount


# ---------------------------------------------------------------- scoring ---
def _is_banked(conn, f, now):
    """Ended, final_after_minutes passed, and the fixture's stats are final."""
    if f["status"] not in DONE:
        return False
    if now < contests.ended_at(f) + timedelta(minutes=CFG["boards"]["final_after_minutes"]):
        return False
    final = conn.execute("SELECT count(*) FILTER (WHERE is_final), count(*) FROM player_match_scores WHERE fixture_id = %s",
                         (f["id"],)).fetchone()
    return final[1] > 0 and final[0] == final[1]


def _points(conn, f, player_ids, captain_id):
    """({player_id: points counted}, captain_points) from the scores stored now."""
    if f["status"] in NOT_PLAYED:
        return {p: 0.0 for p in player_ids}, 0.0
    base = {r[0]: float(r[1]) for r in conn.execute(
        "SELECT player_id, base FROM player_match_scores WHERE fixture_id = %s AND player_id = ANY(%s)",
        (f["id"], list(player_ids)))}
    per = {p: round(base.get(p, 0.0) * (BLITZ["captain_multiplier"] if p == captain_id else 1), 2) for p in player_ids}
    return per, per.get(captain_id, 0.0)


def _squads(conn, contest_id, wallet=None):
    """Entries of a matchday (one wallet, or all) with their player ids."""
    rows = _rows(conn, """SELECT e.id, e.wallet, e.slot, e.fixture_id, e.captain_id, e.locked_at,
                                 COALESCE(array_agg(p.player_id ORDER BY p.player_id)
                                          FILTER (WHERE p.player_id IS NOT NULL), '{}') AS players
                          FROM entries e LEFT JOIN entry_players p ON p.entry_id = e.id
                          WHERE e.contest_id = %s AND e.fixture_id IS NOT NULL AND (%s::text IS NULL OR e.wallet = %s)
                          GROUP BY e.id ORDER BY e.wallet, e.slot""", (contest_id, wallet, wallet))
    return rows


def score(conn, contest_id, now=None):
    """Write entry_scores for the matchday's locked squads and bank those that qualify.
    A banked row is never touched. Returns how many rows were written."""
    now = _now(now)
    banked = {r[0] for r in conn.execute(
        "SELECT s.entry_id FROM entry_scores s JOIN entries e ON e.id = s.entry_id WHERE e.contest_id = %s AND s.is_final",
        (contest_id,))}
    fixtures, written = {}, 0
    for sq in _squads(conn, contest_id):
        if not sq["locked_at"] or sq["id"] in banked:
            continue
        f = fixtures.setdefault(sq["fixture_id"], _fixture(conn, sq["fixture_id"]))
        per, cap = _points(conn, f, sq["players"], sq["captain_id"])
        final = _is_banked(conn, f, now)
        conn.execute("""INSERT INTO entry_scores (entry_id, points, captain_points, players, banked_at, is_final, scored_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (entry_id) DO UPDATE SET points = EXCLUDED.points,
                          captain_points = EXCLUDED.captain_points, players = EXCLUDED.players,
                          banked_at = EXCLUDED.banked_at, is_final = EXCLUDED.is_final, scored_at = EXCLUDED.scored_at
                        WHERE NOT entry_scores.is_final""",
                     (sq["id"], round(sum(per.values()), 2), cap, Jsonb({str(p): v for p, v in per.items()}),
                      now if final else None, final, now))
        written += 1
    return written


# ------------------------------------------------------------------ reads ---
def mine(conn, wallet, contest_id, now=None):
    """A wallet's squads on a matchday: slot, fixture, players with points, captain, state, points; plus total."""
    now = _now(now)
    out = []
    for sq in _squads(conn, contest_id, wallet):
        f = _fixture(conn, sq["fixture_id"])
        locked = bool(sq["locked_at"])
        stored = conn.execute("SELECT players, captain_points, is_final FROM entry_scores WHERE entry_id = %s",
                              (sq["id"],)).fetchone()
        if stored and stored[2]:                                 # banked: the stored points are the truth
            per, cap, state = {int(k): float(v) for k, v in stored[0].items()}, float(stored[1]), "banked"
        else:
            state = _state(f, locked, now)
            per, cap = _points(conn, f, sq["players"], sq["captain_id"]) if state != "open" else ({}, 0.0)
            if state == "full_time" and _is_banked(conn, f, now):
                state = "banked"                                 # qualifies; `score` will write it
        names = {r[0]: r for r in conn.execute("SELECT id, name, position FROM players WHERE id = ANY(%s)", (sq["players"],))}
        out.append({"slot": sq["slot"], "fixture_id": sq["fixture_id"], "kickoff": f["kickoff"], "captain_id": sq["captain_id"],
                    "locked": locked, "state": state, "points": round(sum(per.values()), 2), "captain_points": cap,
                    "players": [{"id": p, "name": names[p][1], "position": names[p][2], "points": per.get(p, 0.0),
                                 "is_captain": p == sq["captain_id"]} for p in sq["players"]]})
    return {"squads": out, "total": round(sum(s["points"] for s in out), 2),
            "captain_points": round(sum(s["captain_points"] for s in out), 2)}


def matchday(conn, contest_id, now=None):
    """The day's fixtures for the pick screen: kickoff, status, state, and each club's full list of players."""
    now = _now(now)
    out = []
    for f in contests.fixtures_of(conn, contest_id):
        full = _fixture(conn, f["id"])
        item = {"id": f["id"], "kickoff": f["kickoff"], "status": f["status"],
                "state": _state(full, False, now), "can_pick": not kicked_off(full, now)}
        for side, key in (("home", "home_club_id"), ("away", "away_club_id")):
            club = _rows(conn, "SELECT id, name FROM clubs WHERE id = %s", (full[key],))[0]
            club["players"] = _rows(conn, """SELECT id, name, position, club_id FROM players WHERE club_id = %s
                                             ORDER BY position, name, id""", (club["id"],))
            item[side] = club
        out.append(item)
    return out
