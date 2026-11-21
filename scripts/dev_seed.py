"""Seed a LOCAL dev database so Today, Ranks, Winnings and the admin release block have real data.

    DATABASE_URL=postgresql://localhost:5433/squad_dev uv run python scripts/dev_seed.py

Today's matchday has 3 fixtures (900003, 900005, 900006) with full squads of players and stored scores. Pick its
state with `--phase pre|live|ft|banked|closed` (default pre): kick-offs and statuses move, stats are written, other
wallets' squads are saved, and the once-a-minute job (the API with RUN_JOBS=1) locks and scores whatever has kicked off.
A phase first rewinds today's matchday, so phases can be run in any order; add `--clean` to drop the "me" wallet's squads too. `--finish-today` is the older one-fixture shortcut.

Idempotent: ids are fixed, rows are upserted, fee money is topped up to a target (not added again).
Wallets are derived from fixed names (sha256 of "elevn-dev-<name>" as an ed25519 seed), so the browser
test can rebuild the same keys. Dev only: these keys are public in this file's scheme.
"""

import hashlib
import os
import sys
from datetime import datetime, timedelta, timezone

import base58
from nacl.signing import SigningKey
from psycopg.types.json import Jsonb

from squad import blitz, contests, payouts
from squad.db import connect, init_schema

NAMES = ["me", "admin", "ann", "ben", "cat", "dan"]      # "me" plays and wins; "admin" is the FEE_WALLET (admin page)
PLAYING = ["me", "ann", "ben", "cat", "dan", "admin"]     # best first
POINTS = [(31.5, 9.0), (28.0, 6.0), (24.5, 4.0), (24.5, 2.0), (17.0, 0.0), (9.5, 0.0)]
SOL = 1_000_000_000
BLITZ_POT, DRAFT_POT = round(1.2 * SOL), round(0.6 * SOL)


def key(name):
    return SigningKey(hashlib.sha256(f"elevn-dev-{name}".encode()).digest())


def wallet(name):
    return base58.b58encode(bytes(key(name).verify_key)).decode()


def main():
    url = os.environ.get("DATABASE_URL", "postgresql://localhost:5433/squad_dev")
    conn = connect(url)
    init_schema(conn)
    now = datetime.now(timezone.utc)
    today = contests.uk_date(now)
    yday = datetime.combine(today - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).replace(hour=14)
    soon = min(now + timedelta(hours=2), datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=22))
    tomorrow = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).replace(hour=15)

    clubs = [(101, "Redford"), (102, "Bluebridge"), (103, "Madrid Whites"), (104, "Catalan Reds"),
             (105, "Munich Reds"), (106, "Dortmund Yellows"), (107, "Northgate"), (108, "Southport")]
    for cid, name in clubs:
        conn.execute("INSERT INTO clubs (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING", (cid, name))
    lg = {101: 39, 102: 39, 103: 140, 104: 140, 105: 78, 106: 78, 107: 39, 108: 39}
    pid = 9000
    players = {}
    for cid, _ in clubs:
        for pos in ("DEF", "MID", "FWD"):
            pid += 1
            players.setdefault(cid, []).append(pid)
            conn.execute("""INSERT INTO players (id, name, position, club_id, league_id) VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO NOTHING""", (pid, f"Dev {pos} {pid}", pos, cid, lg[cid]))
    for cid, _ in clubs:                              # a full matchday squad of 11 per club for the pick page
        pid = 9100 + (cid - 101) * 20
        for pos in ("GK", "DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"):
            pid += 1
            conn.execute("""INSERT INTO players (id, name, position, club_id, league_id) VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO NOTHING""", (pid, f"Dev {pos} {pid}", pos, cid, lg[cid]))
    # (id, league, kickoff, status, home, away, goals)
    fixtures = [(900001, 39, yday, "FT", 101, 102, (2, 1)), (900002, 140, yday + timedelta(hours=1), "FT", 103, 104, (0, 0)),
                (900003, 78, soon, "NS", 105, 106, (None, None)), (900004, 39, tomorrow, "NS", 107, 108, (None, None)),
                (900005, 39, soon + timedelta(hours=1), "NS", 101, 107, (None, None)),
                (900006, 140, soon + timedelta(hours=2), "NS", 103, 104, (None, None))]
    for fid, league, ko, status, h, a, (hg, ag) in fixtures:
        conn.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id,
                                              home_goals, away_goals)
                        VALUES (%s, %s, 2026, 'Dev round', %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET kickoff = EXCLUDED.kickoff
                        WHERE fixtures.status = 'NS' OR fixtures.id IN (900001, 900002)""",
                     (fid, league, ko, status, h, a, hg, ag))
    contests.ensure(conn, now)
    # yesterday may fall before the current Blitz week (on a Tuesday): make its contests by hand then
    yd = today - timedelta(days=1)
    conn.execute("INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, %s) ON CONFLICT DO NOTHING",
                 (yd, contests.week_start(yd)))
    conn.execute("INSERT INTO contests (kind, week_start) VALUES ('blitz_week', %s) ON CONFLICT DO NOTHING",
                 (contests.week_start(yd),))
    cid = conn.execute("SELECT id FROM contests WHERE kind = 'blitz_matchday' AND day = %s", (yd,)).fetchone()[0]

    score_board(conn, cid, 900001, yday, players[101], POINTS, PLAYING)
    if "--finish-today" in sys.argv:        # a second finished matchday on TODAY's date, so Ranks can show a final board
        early = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(minute=5)
        conn.execute("UPDATE fixtures SET kickoff = %s, status = 'FT', home_goals = 1, away_goals = 1 WHERE id = 900003", (early,))
        tid = conn.execute("SELECT id FROM contests WHERE kind = 'blitz_matchday' AND day = %s", (today,)).fetchone()[0]
        score_board(conn, tid, 900003, early, players[105], [(20.0, 3.0), (26.0, 5.0), (30.0, 8.0), (14.0, 1.0), (11.0, 0.0), (5.0, 0.0)], PLAYING)
        cid = tid
    if "--finish-today" not in sys.argv:
        phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "pre"
        set_phase(conn, now, today, phase)
    contests.build_results(conn, cid)
    for bucket, target in (("pot:blitz", BLITZ_POT), ("pot:draft", DRAFT_POT)):
        short = target - payouts.bucket(conn, bucket)
        if short > 0:
            payouts.add(conn, bucket, short, "dev-seed")
    conn.commit()
    moved = contests.tick(conn, now)
    conn.commit()
    state = conn.execute("SELECT state FROM contests WHERE id = %s", (cid,)).fetchone()[0]
    print(f"database {url}\nmatchday contest {cid}: state {state} (tick moved {moved})")
    for n in NAMES:
        print(f"  {n:6} {wallet(n)}" + ("   <- FEE_WALLET / admin" if n == "admin" else ""))
    print(f"export FEE_WALLET={wallet('admin')}")


TODAY_FX = (900003, 900005, 900006)        # Munich v Dortmund, Redford v Northgate, Madrid v Catalan
OTHERS = {                                  # wallet -> squads (fixture, picks as (club side, index in club list), captain index)
    "ann": [(900003, [0, 1, 8], 2), (900005, [1, 2, 9], 1)],
    "ben": [(900003, [2, 4, 9], 0), (900006, [1, 5, 8], 1)],
    "cat": [(900005, [3, 5, 8], 0), (900006, [2, 4, 9], 2)],
    "dan": [(900003, [1, 2, 10], 1)],
    "admin": [(900006, [0, 3, 10], 1)],
}
# phase -> per fixture: (minutes after now the match kicked off (negative = in the past), status, stats final)
PHASES = {
    "pre":    [(60, "NS", False), (180, "NS", False), (300, "NS", False)],
    "live":   [(-40, "1H", False), (120, "NS", False), (240, "NS", False)],
    "ft":     [(-125, "FT", False), (-40, "2H", False), (180, "NS", False)],
    "banked": [(-260, "FT", True), (-140, "FT", True), (120, "NS", False)],
    "closed": [(-300, "FT", True), (-260, "FT", True), (-180, "FT", True)],
}


def base_points(pid):
    return round(2 + (pid * 7 % 23) / 2, 2)


def club_players(conn, club):
    return [r[0] for r in conn.execute("SELECT id FROM players WHERE club_id = %s ORDER BY id", (club,))]


def set_phase(conn, now, today, phase):
    """Rewind today's matchday, save the other wallets' squads, then move the three fixtures to `phase`."""
    if phase not in PHASES:
        sys.exit(f"--phase must be one of {', '.join(PHASES)}")
    cid = conn.execute("SELECT id FROM contests WHERE kind = 'blitz_matchday' AND day = %s", (today,)).fetchone()[0]
    start = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    late = start + timedelta(hours=23)
    # rewind: every fixture open and in the future, no stats, no locks, no scores, no board lines
    for i, fid in enumerate(TODAY_FX):
        conn.execute("UPDATE fixtures SET kickoff = %s, status = 'NS', home_goals = NULL, away_goals = NULL WHERE id = %s",
                     (min(now + timedelta(hours=1 + i), late), fid))
        conn.execute("DELETE FROM player_match_scores WHERE fixture_id = %s", (fid,))
        conn.execute("DELETE FROM player_match_stats WHERE fixture_id = %s", (fid,))
    conn.execute("DELETE FROM entry_scores WHERE entry_id IN (SELECT id FROM entries WHERE contest_id = %s)", (cid,))
    conn.execute("UPDATE entries SET locked_at = NULL WHERE contest_id = %s", (cid,))
    conn.execute("DELETE FROM results WHERE contest_id = %s", (cid,))
    if "--clean" in sys.argv:                # also forget the "me" wallet's squads, to start a browser run from nothing
        mine = "SELECT id FROM entries WHERE contest_id = %s AND wallet = %s"
        conn.execute(f"DELETE FROM entry_players WHERE entry_id IN ({mine})", (cid, wallet("me")))
        conn.execute("DELETE FROM entries WHERE contest_id = %s AND wallet = %s", (cid, wallet("me")))
    conn.execute("UPDATE contests SET state = 'open', last_match_ends_at = NULL, final_at = NULL WHERE id = %s", (cid,))
    # the other wallets' squads, saved the normal way (they check the rules) while the fixtures are still open
    for name, squads in OTHERS.items():
        have = {r[0] for r in conn.execute("SELECT slot FROM entries WHERE contest_id = %s AND wallet = %s", (cid, wallet(name)))}
        for slot, (fid, idx, cap) in enumerate(squads, 1):
            if slot in have:
                continue
            h, a = conn.execute("SELECT home_club_id, away_club_id FROM fixtures WHERE id = %s", (fid,)).fetchone()
            pool = club_players(conn, h)[:5] + club_players(conn, a)[:6]       # 5 + 6 players: indexes 0-4 home, 5-10 away
            picks = [pool[i] for i in idx]
            blitz.save(conn, wallet(name), cid, slot, fid, picks, picks[cap], 300_000)
    # move to the phase and write the stats of any match that has started
    for fid, (mins, status, final) in zip(TODAY_FX, PHASES[phase]):
        ko = max(now + timedelta(minutes=mins), start + timedelta(minutes=5)) if mins < 0 else min(now + timedelta(minutes=mins), late)
        goals = (1, 0) if status == "FT" else (None, None) if status == "NS" else (0, 0)
        conn.execute("UPDATE fixtures SET kickoff = %s, status = %s, home_goals = %s, away_goals = %s WHERE id = %s",
                     (ko, status, goals[0], goals[1], fid))
        if status == "NS":
            continue
        for p in conn.execute("SELECT id, club_id, position FROM players WHERE club_id IN (SELECT home_club_id FROM fixtures WHERE id = %s UNION SELECT away_club_id FROM fixtures WHERE id = %s)", (fid, fid)).fetchall():
            conn.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes) VALUES (%s, %s, %s, %s, 90)
                            ON CONFLICT DO NOTHING""", (fid, p[0], p[1], p[2]))
            b = base_points(p[0])
            conn.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus, involvement, base, breakdown, is_final)
                            VALUES (%s, %s, %s, 0, 0, %s, '[]', %s) ON CONFLICT (fixture_id, player_id) DO UPDATE
                            SET base = EXCLUDED.base, is_final = EXCLUDED.is_final""", (fid, p[0], b, b, final))
    conn.commit()
    print(f"today's matchday ({cid}) is in phase '{phase}'; the job locks and scores within a minute")


def score_board(conn, cid, fixture, locked, club_players, points, names):
    for i, name in enumerate(names):
        w = wallet(name)
        row = conn.execute("""INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id, locked_at)
                              VALUES (%s, %s, 1, %s, %s, %s) ON CONFLICT (contest_id, wallet, slot) DO UPDATE
                              SET locked_at = EXCLUDED.locked_at RETURNING id""",
                           (cid, w, fixture, club_players[2], locked)).fetchone()
        eid = row[0]
        for p in club_players:
            conn.execute("INSERT INTO entry_players (entry_id, player_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (eid, p))
        pts, cap = points[i]
        each = {str(club_players[0]): round((pts - cap) / 2, 2), str(club_players[1]): round((pts - cap) / 2, 2), str(club_players[2]): cap}
        conn.execute("""INSERT INTO entry_scores (entry_id, points, captain_points, players, banked_at, is_final)
                        VALUES (%s, %s, %s, %s, %s, true) ON CONFLICT (entry_id) DO UPDATE
                        SET points = EXCLUDED.points, captain_points = EXCLUDED.captain_points, players = EXCLUDED.players,
                            is_final = true""",
                     (eid, pts, cap, Jsonb(each), locked + timedelta(hours=2)))


if __name__ == "__main__":
    main()
