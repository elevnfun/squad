"""Matchday Blitz: squad rules, locking, scoring, banking. Real Postgres. Fri 20 Nov 2026 (UK = UTC)."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from squad import blitz, contests
from squad.config import CFG
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
REQ = CFG["blitz"]["requirement"]
PL = 39
K1, K2, K3 = (datetime(2026, 11, 20, h, m, tzinfo=timezone.utc) for h, m in [(12, 0), (15, 0), (19, 45)])
BEFORE = K1 - timedelta(hours=3)


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db.sh start)")
    admin.execute("DROP DATABASE IF EXISTS squad_test_blitz")
    admin.execute("CREATE DATABASE squad_test_blitz")
    c = psycopg.connect(URL.format("squad_test_blitz"))
    init_schema(c)
    for club in range(1, 7):                    # clubs 1..6; players club*10 + 1..4 (position of the 4th is GK)
        c.execute("INSERT INTO clubs (id, name) VALUES (%s, %s)", (club, f"Club{club}"))
        for i in range(1, 5):
            c.execute("INSERT INTO players (id, name, position, club_id) VALUES (%s, %s, %s, %s)",
                      (club * 10 + i, f"P{club}{i}", "GK" if i == 4 else "MID", club))
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test_blitz")
    admin.close()


def fixture(conn, fid, kickoff, home, away, status="NS"):
    conn.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id)
                    VALUES (%s, %s, 2026, 'R', %s, %s, %s, %s)""", (fid, PL, kickoff, status, home, away))


def day(conn, n=3):
    """n fixtures on the day (1: club 1v2 at 12:00, 2: 3v4 at 15:00, 3: 5v6 at 19:45); returns the contest id."""
    for fid, k, h in [(1, K1, 1), (2, K2, 3), (3, K3, 5)][:n]:
        fixture(conn, fid, k, h, h + 1)
    contests.ensure(conn, now=BEFORE)
    return conn.execute("SELECT id FROM contests WHERE kind = 'blitz_matchday'").fetchone()[0]


def squad(fid):
    """Two players from the home club, one from the away club, captain the away player."""
    h = (fid * 2 - 1) * 10
    return [h + 1, h + 2, h + 11], h + 11


def put(conn, cid, slot, fid, wallet="w", balance=REQ, now=BEFORE):
    players, cap = squad(fid)
    return blitz.save(conn, wallet, cid, slot, fid, players, cap, balance, now)


def stats(conn, fid, pts, final=False):
    """player_id -> base points for a fixture (stats row, then score row)."""
    for pid, base in pts.items():
        club = pid // 10
        conn.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes)
                        VALUES (%s, %s, %s, 'MID', 90) ON CONFLICT DO NOTHING""", (fid, pid, club))
        conn.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus, involvement,
                        base, breakdown, is_final) VALUES (%s, %s, %s, 0, 0, %s, '[]', %s)
                        ON CONFLICT (fixture_id, player_id) DO UPDATE SET base = EXCLUDED.base,
                        core_plus = EXCLUDED.core_plus, is_final = EXCLUDED.is_final""", (fid, pid, base, base, final))


def status(conn, fid, s):
    conn.execute("UPDATE fixtures SET status = %s WHERE id = %s", (s, fid))


def refused(*args, **kw):
    with pytest.raises(blitz.BlitzError) as e:
        blitz.save(*args, **kw)
    return str(e.value)


# ------------------------------------------------------------------ rules ---
def test_check_valid_and_problems(conn):
    day(conn)
    assert blitz.check(conn, 1, *squad(1)) == []
    assert blitz.check(conn, 1, [11, 12, 13], 11)                        # one club only
    assert blitz.check(conn, 1, [11, 12, 21], 22)                        # captain not in squad
    assert blitz.check(conn, 1, [11, 12], 11)                            # too few
    assert blitz.check(conn, 1, [11, 11, 21], 11)                        # duplicate
    assert blitz.check(conn, 1, [11, 12, 31], 11)                        # player from another fixture
    assert blitz.check(conn, 99, [11, 12, 21], 11) == ["That fixture does not exist."]


def test_goalkeepers_allowed(conn):
    day(conn)
    assert blitz.check(conn, 1, [14, 12, 24], 14) == []


def test_save_and_mine(conn):
    cid = day(conn)
    eid = put(conn, cid, 1, 1)
    assert conn.execute("SELECT count(*) FROM entry_players WHERE entry_id = %s", (eid,)).fetchone()[0] == 3
    m = blitz.mine(conn, "w", cid, BEFORE)
    assert [s["slot"] for s in m["squads"]] == [1] and m["squads"][0]["state"] == "open" and m["total"] == 0


def test_save_refusals(conn):
    cid = day(conn)
    assert "least 1 player from Club2" in refused(conn, "w", cid, 1, 1, [11, 12, 13], 11, REQ, BEFORE)
    assert "captain" in refused(conn, "w", cid, 1, 1, [11, 12, 21], 22, REQ, BEFORE)
    assert "holding" in refused(conn, "w", cid, 1, 1, *squad(1), REQ - 1, BEFORE).lower()
    assert "allows" in refused(conn, "w", cid, 4, 1, *squad(1), REQ, BEFORE)
    assert "not part" in refused(conn, "w", cid, 1, 77, *squad(1), REQ, BEFORE)
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0


def test_same_fixture_twice_refused(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    assert "already" in refused(conn, "w", cid, 2, 1, *squad(1), REQ, BEFORE)
    put(conn, cid, 2, 2)                                                 # a different fixture is fine


def test_one_fixture_allows_one_squad(conn):
    cid = day(conn, 1)
    put(conn, cid, 1, 1)
    assert "allows 1 squad" in refused(conn, "w", cid, 2, 1, *squad(1), REQ, BEFORE)


def test_edit_replaces_and_remove(conn):
    cid = day(conn)
    eid = put(conn, cid, 1, 1)
    assert blitz.save(conn, "w", cid, 1, 1, [11, 12, 21], 12, REQ, BEFORE) == eid
    m = blitz.mine(conn, "w", cid, BEFORE)["squads"][0]
    assert sorted(p["id"] for p in m["players"]) == [11, 12, 21] and m["captain_id"] == 12
    blitz.remove(conn, "w", cid, 1, BEFORE)
    assert blitz.mine(conn, "w", cid, BEFORE)["squads"] == []
    with pytest.raises(blitz.BlitzError):
        blitz.remove(conn, "w", cid, 1, BEFORE)


def test_one_squad_per_wallet_slot_but_wallets_independent(conn):
    cid = day(conn)
    put(conn, cid, 1, 1, wallet="a")
    put(conn, cid, 1, 1, wallet="b")
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 2


# ---------------------------------------------------------------- locking ---
def test_three_kickoffs_lock_separately(conn):
    cid = day(conn)
    for slot in (1, 2, 3):
        put(conn, cid, slot, slot)
    assert blitz.lock(conn, K1 - timedelta(minutes=1)) == 0
    assert blitz.lock(conn, K1) == 1
    assert blitz.lock(conn, K1 + timedelta(minutes=30)) == 0             # already locked: not counted again
    assert blitz.lock(conn, K2) == 1
    assert blitz.lock(conn, K3 + timedelta(hours=1)) == 1
    locked = [r[0] for r in conn.execute("SELECT locked_at FROM entries ORDER BY slot")]
    assert locked == [K1, K2, K3 + timedelta(hours=1)]


def test_edit_after_kickoff_refused(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    late = K1 + timedelta(minutes=1)                                     # kicked off, `lock` not yet run
    assert "locked" in refused(conn, "w", cid, 1, 1, [11, 12, 21], 12, REQ, late)
    with pytest.raises(blitz.BlitzError):
        blitz.remove(conn, "w", cid, 1, late)
    blitz.lock(conn, late)
    assert "locked" in refused(conn, "w", cid, 1, 1, [11, 12, 21], 12, REQ, BEFORE)   # even with an odd clock
    assert "kicked off" in refused(conn, "w", cid, 2, 1, *squad(1), REQ, late)         # new squad on a started match


def test_move_to_unstarted_fixture_after_another_locked(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    put(conn, cid, 2, 2)
    now = K1 + timedelta(minutes=5)
    blitz.lock(conn, now)
    blitz.save(conn, "w", cid, 2, 3, *squad(3), REQ, now)                # slot 2 moves from fixture 2 to 3
    assert conn.execute("SELECT fixture_id FROM entries WHERE slot = 2").fetchone()[0] == 3
    assert "kicked off" in refused(conn, "w", cid, 2, 1, *squad(1), REQ, now)   # cannot move onto the started one


def test_postponed_never_locks_and_scores_zero(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    status(conn, 1, "PST")
    stats(conn, 1, {11: 9, 12: 9, 21: 9}, final=True)                    # stray data must not count
    late = K1 + timedelta(hours=1)
    assert blitz.lock(conn, late) == 0
    blitz.score(conn, cid, late)
    assert conn.execute("SELECT count(*) FROM entry_scores").fetchone()[0] == 0
    m = blitz.mine(conn, "w", cid, late)
    assert m["squads"][0]["points"] == 0 and m["squads"][0]["state"] == "open" and m["total"] == 0
    blitz.save(conn, "w", cid, 1, 2, *squad(2), REQ, late)               # still movable to a fixture that is on


# ---------------------------------------------------------------- scoring ---
def test_points_captain_double_and_states(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)                                                 # players 11, 12, 21; captain 21
    blitz.lock(conn, K1)
    status(conn, 1, "2H")
    stats(conn, 1, {11: 4, 12: 1.5, 21: 5})
    now = K1 + timedelta(hours=1)
    blitz.score(conn, cid, now)
    s = blitz.mine(conn, "w", cid, now)["squads"][0]
    assert s["state"] == "live" and s["points"] == 15.5 and s["captain_points"] == 10
    assert {p["id"]: p["points"] for p in s["players"]} == {11: 4, 12: 1.5, 21: 10}
    status(conn, 1, "FT")
    end = contests.ended_at({"kickoff": K1})
    blitz.score(conn, cid, end + timedelta(minutes=1))
    assert blitz.mine(conn, "w", cid, end + timedelta(minutes=1))["squads"][0]["state"] == "full_time"
    assert conn.execute("SELECT is_final FROM entry_scores").fetchone()[0] is False


def test_banking_needs_time_and_final_stats_then_never_changes(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    blitz.lock(conn, K1)
    status(conn, 1, "FT")
    stats(conn, 1, {11: 4, 12: 1, 21: 5})
    end = contests.ended_at({"kickoff": K1})
    wait = end + timedelta(minutes=CFG["boards"]["final_after_minutes"])
    blitz.score(conn, cid, wait - timedelta(minutes=1))                  # too early
    assert conn.execute("SELECT is_final FROM entry_scores").fetchone()[0] is False
    blitz.score(conn, cid, wait)                                         # on time, but stats not final
    assert conn.execute("SELECT is_final FROM entry_scores").fetchone()[0] is False
    stats(conn, 1, {11: 4, 12: 1, 21: 5}, final=True)
    blitz.score(conn, cid, wait)
    pts, final, banked = conn.execute("SELECT points, is_final, banked_at FROM entry_scores").fetchone()
    assert (float(pts), final, banked) == (15, True, wait)
    assert blitz.mine(conn, "w", cid, wait)["squads"][0]["state"] == "banked"
    stats(conn, 1, {11: 40, 12: 10, 21: 50}, final=True)                 # a late correction is ignored
    blitz.score(conn, cid, wait + timedelta(days=1))
    assert float(conn.execute("SELECT points FROM entry_scores").fetchone()[0]) == 15
    m = blitz.mine(conn, "w", cid, wait + timedelta(days=1))
    assert m["total"] == 15 and m["captain_points"] == 10 and m["squads"][0]["players"][2]["points"] == 10


def test_total_adds_squads(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    put(conn, cid, 2, 2)
    stats(conn, 1, {11: 1, 12: 1, 21: 1})
    stats(conn, 2, {31: 2, 32: 2, 41: 2})
    blitz.lock(conn, K3)
    blitz.score(conn, cid, K3)
    m = blitz.mine(conn, "w", cid, K3)
    assert m["total"] == 4 + 8 and m["captain_points"] == 2 + 4


def test_missing_score_is_zero(conn):
    cid = day(conn)
    put(conn, cid, 1, 1)
    blitz.lock(conn, K1)
    blitz.score(conn, cid, K1)
    assert blitz.mine(conn, "w", cid, K1)["total"] == 0


# ------------------------------------------------------------------ reads ---
def test_matchday_lists_fixtures_and_full_squads(conn):
    cid = day(conn)
    status(conn, 1, "1H")
    md = blitz.matchday(conn, cid, K1 + timedelta(minutes=10))
    assert [f["id"] for f in md] == [1, 2, 3]
    assert [f["state"] for f in md] == ["live", "open", "open"] and [f["can_pick"] for f in md] == [False, True, True]
    assert md[0]["home"]["name"] == "Club1" and len(md[0]["home"]["players"]) == 4
    assert {p["id"] for p in md[0]["away"]["players"]} == {21, 22, 23, 24}
    assert set(md[0]["away"]["players"][0]) == {"id", "name", "position", "club_id"}
