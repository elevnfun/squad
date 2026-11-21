"""Seed a LOCAL dev database so Today, Ranks, Winnings and the admin release block have real data.

    DATABASE_URL=postgresql://localhost:5433/squad_dev uv run python scripts/dev_seed.py

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

from squad import contests, payouts
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
    # (id, league, kickoff, status, home, away, goals)
    fixtures = [(900001, 39, yday, "FT", 101, 102, (2, 1)), (900002, 140, yday + timedelta(hours=1), "FT", 103, 104, (0, 0)),
                (900003, 78, soon, "NS", 105, 106, (None, None)), (900004, 39, tomorrow, "NS", 107, 108, (None, None))]
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
        conn.execute("""INSERT INTO entry_scores (entry_id, points, captain_points, banked_at, is_final)
                        VALUES (%s, %s, %s, %s, true) ON CONFLICT (entry_id) DO UPDATE
                        SET points = EXCLUDED.points, captain_points = EXCLUDED.captain_points, is_final = true""",
                     (eid, pts, cap, locked + timedelta(hours=2)))


if __name__ == "__main__":
    main()
