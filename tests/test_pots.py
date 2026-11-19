"""Prize pots: the split, ties, rounding, allocation, funding and settling. Numbers worked out in comments."""

from datetime import date

import psycopg
import pytest

from squad import payouts, pots
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
SOL = 1_000_000_000


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db.sh start)")
    admin.execute("DROP DATABASE IF EXISTS squad_test_pots")
    admin.execute("CREATE DATABASE squad_test_pots")
    c = psycopg.connect(URL.format("squad_test_pots"))
    init_schema(c)
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test_pots")
    admin.close()


def board(n, points=None):
    """n wallets w1..wn, points descending 100, 90, ... with 0 captain points."""
    return [(f"w{i}", points[i - 1] if points else 100 - 10 * i, 0) for i in range(1, n + 1)]


def amounts(prizes):
    return {w: (place, lam) for w, place, lam in prizes}


# ------------------------------------------------------------------ split ---
def test_five_winners_one_sol():
    # 1 SOL: 50% 25% 12% 8% 5% = 0.5 / 0.25 / 0.12 / 0.08 / 0.05
    got = pots.split(SOL, board(5))
    assert [(p, lam) for _, p, lam in got] == [(1, 500_000_000), (2, 250_000_000), (3, 120_000_000),
                                              (4, 80_000_000), (5, 50_000_000)]


def test_only_five_paid():
    got = pots.split(SOL, board(9))
    assert [w for w, _, _ in got] == ["w1", "w2", "w3", "w4", "w5"]


def test_three_entrants_leave_13_percent():
    # 50 + 25 + 12 = 87% paid; 13% (0.13 SOL) stays unpaid
    got = pots.split(SOL, board(3))
    assert [lam for _, _, lam in got] == [500_000_000, 250_000_000, 120_000_000]
    assert SOL - sum(lam for _, _, lam in got) == 130_000_000


def test_two_entrants_pay_nothing():
    assert pots.split(SOL, board(2)) == []


# ------------------------------------------------------------------- ties ---
def test_captain_points_break_a_tie():
    # w2 and w3 level on points; w3 has more captain points so is 2nd. No split: 25% and 12%
    ranked = [("w1", 100, 0), ("w2", 80, 10), ("w3", 80, 20), ("w4", 50, 0)]
    got = amounts(pots.split(SOL, ranked))
    assert got["w3"] == (2, 250_000_000)
    assert got["w2"] == (3, 120_000_000)
    assert got["w4"] == (4, 80_000_000)


def test_tie_for_second_splits_and_next_is_fourth():
    # 2nd and 3rd covered: (25 + 12) / 2 = 18.5% = 185,000,000 each; next wallet is 4th: 8%
    ranked = [("w1", 100, 0), ("w2", 80, 5), ("w3", 80, 5), ("w4", 50, 0)]
    got = amounts(pots.split(SOL, ranked))
    assert got["w2"] == (2, 185_000_000) and got["w3"] == (2, 185_000_000)
    assert got["w4"] == (4, 80_000_000)


def test_tie_for_fifth():
    # two wallets on 5th: only place 5 (5%) is left to cover; 2.5% each
    ranked = board(4) + [("w5", 10, 0), ("w6", 10, 0)]
    got = amounts(pots.split(SOL, ranked))
    assert got["w5"] == (5, 25_000_000) and got["w6"] == (5, 25_000_000)


def test_three_way_tie_for_first():
    # (50 + 25 + 12) / 3 = 29% = 290,000,000 each; the next wallet is 4th: 8%
    ranked = [("a", 90, 0), ("b", 90, 0), ("c", 90, 0), ("d", 10, 0)]
    got = amounts(pots.split(SOL, ranked))
    assert [got[w] for w in "abc"] == [(1, 290_000_000)] * 3
    assert got["d"] == (4, 80_000_000)


def test_rounding_never_overpays():
    # 1,000,000,007: 50% -> 500,000,003 (floor of ...003.5), 25% -> 250,000,001, 12% -> 120,000,000,
    # 8% -> 80,000,000, 5% -> 50,000,000
    pot = 1_000_000_007
    got = pots.split(pot, board(5))
    assert [lam for _, _, lam in got] == [500_000_003, 250_000_001, 120_000_000, 80_000_000, 50_000_000]
    assert sum(lam for _, _, lam in got) <= pot


# ---------------------------------------------------------------- buckets ---
def total(conn):
    return conn.execute("SELECT coalesce(sum(lamports), 0) FROM fee_buckets").fetchone()[0]


def contest(conn, kind="blitz_matchday", day=date(2026, 12, 1), week=date(2026, 12, 1)):
    return conn.execute("""INSERT INTO contests (kind, day, week_start) VALUES (%s, %s, %s) RETURNING id""",
                        (kind, day if kind == "blitz_matchday" else None, week)).fetchone()[0]


def results(conn, cid, rows):
    for w, pts, cap in rows:
        conn.execute("INSERT INTO results (contest_id, wallet, points, captain_points) VALUES (%s, %s, %s, %s)",
                     (cid, w, pts, cap))


def test_allocate(conn):
    payouts.add(conn, "pot:unassigned", SOL, "income")
    before = total(conn)
    assert pots.allocate(conn) == (600_000_000, 400_000_000)   # 60% / 40% of 1 SOL
    assert payouts.bucket(conn, "pot:blitz") == 600_000_000
    assert payouts.bucket(conn, "pot:draft") == 400_000_000
    assert payouts.bucket(conn, "pot:unassigned") == 0
    assert pots.allocate(conn) == (0, 0)
    assert payouts.bucket(conn, "pot:blitz") == 600_000_000
    assert total(conn) == before


def test_allocate_leaves_season_pots(conn):
    payouts.add(conn, "pot:39", SOL, "income")
    assert pots.allocate(conn) == (0, 0)
    assert payouts.bucket(conn, "pot:39") == SOL


def test_fund_tops_up_from_reserve(conn):
    # devnet minimum for a Blitz matchday is 0.05 SOL
    payouts.add(conn, "reserve", SOL, "income")
    cid = contest(conn)
    assert pots.fund(conn, cid) == 50_000_000
    assert payouts.bucket(conn, "reserve") == 950_000_000          # 1 - 0.05
    assert conn.execute("SELECT pot_lamports FROM contests WHERE id = %s", (cid,)).fetchone()[0] == 50_000_000
    assert total(conn) == SOL


def test_fund_uses_what_reserve_has(conn):
    payouts.add(conn, "reserve", 20_000_000, "income")
    assert pots.fund(conn, contest(conn)) == 20_000_000            # only 0.02 SOL available
    assert payouts.bucket(conn, "reserve") == 0


def test_fund_above_minimum_takes_nothing(conn):
    payouts.add(conn, "reserve", SOL, "income")
    payouts.add(conn, "pot:blitz", 200_000_000, "income")          # 0.2 > 0.05
    assert pots.fund(conn, contest(conn)) == 200_000_000
    assert payouts.bucket(conn, "reserve") == SOL


def test_fund_draft_and_allocates(conn):
    # 1 SOL unassigned -> draft 0.4 SOL, above the 0.1 devnet minimum
    payouts.add(conn, "pot:unassigned", SOL, "income")
    cid = contest(conn, "draft_week")
    assert pots.fund(conn, cid) == 400_000_000
    assert pots.fund(conn, cid) == 400_000_000                     # funded already: unchanged


def test_fund_weekly_blitz_unchanged(conn):
    cid = contest(conn, "blitz_week")
    conn.execute("UPDATE contests SET pot_lamports = 7 WHERE id = %s", (cid,))
    assert pots.fund(conn, cid) == 7


def test_settle_pays_five(conn):
    payouts.add(conn, "pot:blitz", SOL, "income")
    cid = contest(conn)
    assert pots.fund(conn, cid) == SOL                              # above minimum, pot = 1 SOL
    results(conn, cid, [(f"w{i}", 100 - 10 * i, 0) for i in range(1, 8)])
    before = total(conn)
    paid = pots.settle(conn, cid)
    assert [lam for _, _, lam in paid] == [500_000_000, 250_000_000, 120_000_000, 80_000_000, 50_000_000]
    assert payouts.bucket(conn, "owed2") == SOL                     # 0.5+0.25+0.12+0.08+0.05 = 1 SOL
    assert payouts.bucket(conn, "pot:blitz") == 0
    places = dict(conn.execute("SELECT wallet, place FROM results WHERE contest_id = %s", (cid,)).fetchall())
    assert places == {f"w{i}": i for i in range(1, 8)}              # everyone ranked, 6th and 7th unpaid
    assert conn.execute("SELECT bool_and(is_final) FROM results WHERE contest_id = %s", (cid,)).fetchone()[0]
    assert total(conn) == before
    # second call changes nothing
    assert pots.settle(conn, cid) == paid
    assert payouts.bucket(conn, "owed2") == SOL
    n = conn.execute("SELECT count(*) FROM fee_events").fetchone()[0]
    pots.settle(conn, cid)
    assert conn.execute("SELECT count(*) FROM fee_events").fetchone()[0] == n


def test_settle_with_three_leaves_unpaid_in_bucket(conn):
    payouts.add(conn, "pot:draft", SOL, "income")
    cid = contest(conn, "draft_week")
    pots.fund(conn, cid)
    results(conn, cid, [("a", 50, 0), ("b", 40, 0), ("c", 30, 0)])
    pots.settle(conn, cid)
    assert payouts.bucket(conn, "owed2") == 870_000_000            # 87%
    assert payouts.bucket(conn, "pot:draft") == 130_000_000        # 13% rolls on


def test_rolled_money_goes_to_next_contest(conn):
    payouts.add(conn, "pot:blitz", 300_000_000, "income")
    day1 = contest(conn, day=date(2026, 12, 1))
    pots.fund(conn, day1)
    results(conn, day1, [("a", 50, 0), ("b", 40, 0)])               # 2 entrants
    assert pots.settle(conn, day1) == []
    assert conn.execute("SELECT state FROM contests WHERE id = %s", (day1,)).fetchone()[0] == "rolled"
    assert conn.execute("SELECT place FROM results WHERE contest_id = %s AND wallet = 'b'", (day1,)).fetchone()[0] == 2
    assert payouts.bucket(conn, "pot:blitz") == 300_000_000
    payouts.add(conn, "pot:blitz", 100_000_000, "income")           # next day's fees
    day2 = contest(conn, day=date(2026, 12, 2))
    assert pots.fund(conn, day2) == 400_000_000                    # 0.3 rolled + 0.1 new


def test_weekly_blitz_settle_moves_no_buckets(conn):
    cid = contest(conn, "blitz_week")
    conn.execute("UPDATE contests SET pot_lamports = %s WHERE id = %s", (SOL, cid))
    results(conn, cid, [(f"w{i}", 100 - i, 0) for i in range(1, 6)])
    paid = pots.settle(conn, cid)
    assert sum(lam for _, _, lam in paid) == SOL
    assert conn.execute("SELECT count(*) FROM fee_events").fetchone()[0] == 0


def test_collected(conn):
    payouts.add(conn, "owed2", SOL, "prize")
    pots.collected(conn, 400_000_000, "collect:1")
    assert payouts.bucket(conn, "owed2") == 600_000_000


def test_settle_never_pays_more_than_the_bucket_holds(conn):
    """Two matchdays funded before either settles both record the whole bucket as their pot.
    Bucket 1 SOL. The first settles and pays 1 SOL x 100% = 1 SOL. The second finds an empty
    bucket, so it pays 0 and the bucket never goes negative."""
    from squad import payouts
    payouts.add(conn, "pot:blitz", 1_000_000_000, "test")
    ids = []
    for d in ("2026-11-21", "2026-11-22"):
        cid = conn.execute("""INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, '2026-11-17')
                              RETURNING id""", (d,)).fetchone()[0]
        for i in range(5):
            conn.execute("INSERT INTO results (contest_id, wallet, points) VALUES (%s, %s, %s)", (cid, f"w{i}", 50 - i))
        ids.append(cid)
    assert pots.fund(conn, ids[0]) == pots.fund(conn, ids[1]) == 1_000_000_000
    assert sum(p[2] for p in pots.settle(conn, ids[0])) == 1_000_000_000
    assert sum(p[2] for p in pots.settle(conn, ids[1])) == 0
    assert payouts.bucket(conn, "pot:blitz") == 0
