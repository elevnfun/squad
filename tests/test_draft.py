"""Weekly Draft: tiers, packs, team rules, lock, swap, scoring. Real Postgres. Week of Tue 17 Nov 2026 (UK = UTC)."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from squad import contests, draft
from squad.config import CFG
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
REQ = CFG["draft"]["requirement"]
PL = 39
BEFORE = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)


def t(day, h, m=0):
    return datetime(2026, 11, day, h, m, tzinfo=timezone.utc)


# (id, kickoff, home, away): Fri 20 .. Mon 23. Clubs 1 and 3 play twice (fixture 7).
FIXTURES = [(1, t(20, 12), 1, 2), (2, t(21, 15), 3, 4), (3, t(21, 17, 30), 5, 6), (4, t(22, 14), 7, 8),
            (7, t(22, 16, 30), 1, 3), (5, t(23, 19), 9, 10), (6, t(23, 20), 11, 12)]
LOCK = t(20, 12)
LIVE = t(20, 13)                    # Friday's first match is on, the rest not
LATE = t(25, 12)                    # long after the window

# Hand-made 15 (tier, player, value). Players are club*10 + i: i 1-2 DEF, 3-4 MID, 5 FWD, 6 GK.
POOL = [("top", 11, 9.0), ("top", 33, 8.9), ("top", 55, 8.8), ("top", 71, 8.7), ("top", 93, 8.6),
        ("mid", 22, 6.0), ("mid", 44, 5.9), ("mid", 65, 5.8), ("mid", 82, 5.7), ("mid", 104, 5.6),
        ("budget", 12, 4.0), ("budget", 34, 3.9), ("budget", 45, 3.8), ("budget", 72, 3.7), ("budget", 115, 3.6)]
TEAM = [71, 33, 65, 22, 12]         # 2 top, 2 mid, 1 budget; clubs 7, 3, 6, 2, 1
CAPTAIN = 33


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db.sh start)")
    admin.execute("DROP DATABASE IF EXISTS squad_test_draft")
    admin.execute("CREATE DATABASE squad_test_draft")
    c = psycopg.connect(URL.format("squad_test_draft"))
    init_schema(c)
    gw = c.execute("INSERT INTO gameweeks (league_id, season, round) VALUES (%s, 2026, 'R') RETURNING id", (PL,)).fetchone()[0]
    pos = {1: "DEF", 2: "DEF", 3: "MID", 4: "MID", 5: "FWD", 6: "GK"}
    n = 0
    for club in range(1, 15):                   # clubs 13 and 14 play no match in the window
        c.execute("INSERT INTO clubs (id, name) VALUES (%s, %s)", (club, f"Club{club}"))
        for i in range(1, 7):
            pid = club * 10 + i
            c.execute("INSERT INTO players (id, name, position, club_id) VALUES (%s, %s, %s, %s)", (pid, f"P{pid}", pos[i], club))
            n += 1
            c.execute("INSERT INTO player_prices (player_id, gameweek_id, price, source) VALUES (%s, %s, %s, 'model')",
                      (pid, gw, 3 + n / 12))
    for fid, k, h, a in FIXTURES:
        c.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id)
                     VALUES (%s, %s, 2026, 'R', %s, 'NS', %s, %s)""", (fid, PL, k, h, a))
    contests.ensure(c, now=BEFORE)
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test_draft")
    admin.close()


@pytest.fixture
def cid(conn):
    return conn.execute("SELECT id FROM contests WHERE kind = 'draft_week'").fetchone()[0]


def give_pool(conn, cid, wallet="w"):
    """Store the hand-made 15 for a wallet (instead of a random deal)."""
    seen = {}
    for tier, pid, value in POOL:
        seen[tier] = seen.get(tier, 0) + 1
        conn.execute("INSERT INTO draft_packs (contest_id, wallet, pack, tier, player_id, value) VALUES (%s, %s, %s, %s, %s, %s)",
                     (cid, wallet, seen[tier], tier, pid, value))


def team(conn, cid, wallet="w", ids=TEAM, captain=CAPTAIN):
    give_pool(conn, cid, wallet)
    return draft.save(conn, wallet, cid, ids, captain, REQ, BEFORE)


def stats(conn, fid, pts, final=False):
    for pid, base in pts.items():
        conn.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes)
                        VALUES (%s, %s, %s, 'MID', 90) ON CONFLICT DO NOTHING""", (fid, pid, pid // 10))
        conn.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus, involvement,
                        base, breakdown, is_final) VALUES (%s, %s, %s, 0, 0, %s, '[]', %s)
                        ON CONFLICT (fixture_id, player_id) DO UPDATE SET base = EXCLUDED.base,
                        core_plus = EXCLUDED.core_plus, is_final = EXCLUDED.is_final""", (fid, pid, base, base, final))


def status(conn, *fids, s="PST"):
    conn.execute("UPDATE fixtures SET status = %s WHERE id = ANY(%s)", (s, list(fids)))


def refused(fn, *args, **kw):
    with pytest.raises(draft.DraftError) as e:
        fn(*args, **kw)
    return str(e.value)


def on_team(conn, wallet="w"):
    return sorted(r[0] for r in conn.execute(
        "SELECT player_id FROM entry_players p JOIN entries e ON e.id = p.entry_id WHERE e.wallet = %s", (wallet,)))


# ------------------------------------------------------------------ tiers ---
def test_tier_split(conn, cid):
    rows = draft._eligible(conn, draft._rows(conn, "SELECT * FROM contests WHERE id = %s", (cid,))[0])
    assert len(rows) == 60                                         # 12 clubs x 5 outfield; no GK, no clubs 13-14
    tiers = {k: [r["value"] for r in rows if r["tier"] == k] for k in ("top", "mid", "budget")}
    assert [len(tiers[k]) for k in ("top", "mid", "budget")] == [12, 18, 30]
    assert min(tiers["top"]) >= max(tiers["mid"]) and min(tiers["mid"]) >= max(tiers["budget"])


# ------------------------------------------------------------------ packs ---
def test_deal_shape_and_rules(conn, cid):
    d = draft.deal(conn, cid, "wa")
    assert len(d) == 15 and len({r["player_id"] for r in d}) == 15
    for n in range(1, 6):
        assert [r["tier"] for r in d if r["pack"] == n] == ["top", "mid", "budget"]
    for pos in ("DEF", "MID", "FWD"):
        assert sum(r["position"] == pos for r in d) >= 2
    assert all(r["position"] != "GK" and r["player_id"] // 10 <= 12 for r in d)
    assert conn.execute("SELECT count(*) FROM draft_packs WHERE wallet = 'wa'").fetchone()[0] == 15


def test_deal_repeatable_and_per_wallet(conn, cid):
    a1, a2, b = draft.deal(conn, cid, "wa"), draft.deal(conn, cid, "wa"), draft.deal(conn, cid, "wb")
    assert a1 == a2
    assert {r["player_id"] for r in a1} != {r["player_id"] for r in b}
    conn.execute("DELETE FROM draft_packs WHERE wallet = 'wa'")      # same seed: the same deal again
    assert draft.deal(conn, cid, "wa") == a1


def test_sample_stores_nothing(conn, cid):
    s = draft.sample(conn, cid)
    assert len(s) == 15 and len({r["player_id"] for r in s}) == 15
    assert conn.execute("SELECT count(*) FROM draft_packs").fetchone()[0] == 0
    assert draft.sample(conn, cid, seed="x") == draft.sample(conn, cid, seed="x")


def test_open_pack(conn, cid):
    got = draft.open_pack(conn, cid, "wa", 2, now=BEFORE)
    assert [r["tier"] for r in got] == ["top", "mid", "budget"] and all(r["opened_at"] == BEFORE for r in got)
    assert "no such pack" in refused(draft.open_pack, conn, cid, "wa", 9)
    assert sum(p["opened_at"] is not None for p in draft.mine(conn, "wa", cid, BEFORE)["packs"]) == 3


# ------------------------------------------------------------------ rules ---
def test_check_rules(conn, cid):
    ids = [p for _, p, _ in POOL]

    def problems(team_ids, captain=71, pool=ids):
        return " ".join(draft.check(conn, cid, pool, team_ids, captain))

    assert draft.check(conn, cid, ids, TEAM, CAPTAIN) == []
    assert "exactly 5 different" in problems(TEAM[:4])
    assert "exactly 5 different" in problems([71, 71, 33, 65, 22])
    assert "own 15" in problems([71, 33, 65, 22, 13])
    assert "at least 1 FWD" in problems([71, 33, 22, 12, 82], 71)                 # no forward
    assert "at least 1 DEF" in problems([33, 93, 44, 104, 65], 33)                # no defender
    assert "at most 2 players from Club1" in " ".join(draft.check(conn, cid, [11, 12, 13, 33, 65], [11, 12, 13, 33, 65], 11))
    ranked = draft._eligible(conn, draft._rows(conn, "SELECT * FROM contests WHERE id = %s", (cid,))[0])
    pool = [r["id"] for r in ranked]
    tops = [r["id"] for r in ranked if r["tier"] == "top"]
    mids = [r["id"] for r in ranked if r["tier"] == "mid"]
    assert "at most 2 top" in problems(tops[:3] + mids[:2], tops[0], pool)
    assert "at most 2 mid" in problems(tops[:2] + mids[:3], tops[0], pool)
    assert "captain" in problems(TEAM, 99)
    assert "not available" in problems(TEAM, 71, pool=ids + [16])                 # a goalkeeper is no option


def test_save_and_replace(conn, cid):
    eid = team(conn, cid)
    assert on_team(conn) == sorted(TEAM)
    assert conn.execute("SELECT slot, fixture_id, captain_id FROM entries WHERE id = %s", (eid,)).fetchone() == (1, None, CAPTAIN)
    assert draft.save(conn, "w", cid, [11, 33, 65, 22, 12], 11, REQ, BEFORE) == eid
    assert on_team(conn) == [11, 12, 22, 33, 65]


def test_save_refusals(conn, cid):
    give_pool(conn, cid)
    assert "300,000" in refused(draft.save, conn, "w", cid, TEAM, CAPTAIN, REQ - 1, BEFORE)
    assert "at most 2 top" in refused(draft.save, conn, "w", cid, [11, 33, 55, 22, 12], 11, REQ, BEFORE)
    assert "own 15" in refused(draft.save, conn, "w", cid, [71, 33, 65, 22, 13], 33, REQ, BEFORE)
    assert "packs first" in refused(draft.save, conn, "nobody", cid, TEAM, CAPTAIN, REQ, BEFORE)
    assert "locked" in refused(draft.save, conn, "w", cid, TEAM, CAPTAIN, REQ, LOCK)
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0


def test_lock_sets_locked_at(conn, cid):
    team(conn, cid)
    assert draft.lock(conn, BEFORE) == 0
    assert draft.lock(conn, LOCK) == 1
    assert "locked" in refused(draft.save, conn, "w", cid, [11, 33, 65, 22, 12], 11, REQ, BEFORE)   # locked_at is final
    assert draft.lock(conn, LIVE) == 0


# ------------------------------------------------------------------- swap ---
def test_auto_swap_picks_best_unused_and_keeps_captain(conn, cid):
    team(conn, cid, captain=71)
    draft.lock(conn, LOCK)
    status(conn, 4)                                    # club 7 (player 71) is called off
    assert draft.swap_auto(conn, cid, LIVE) == 1
    assert on_team(conn) == sorted([11, 33, 65, 22, 12])                    # 11 beats 82 and 72 (club 1 still has fixture 7)
    assert conn.execute("SELECT captain_id FROM entries").fetchone()[0] == 11
    assert draft.swap_auto(conn, cid, LIVE) == 0


def test_auto_swap_leaves_slot_when_none(conn, cid):
    team(conn, cid)
    draft.lock(conn, LOCK)
    status(conn, 2, 7)                                 # club 3 (player 33, captain) off entirely
    status(conn, 5, s="FT")                            # the other midfielders (clubs 4, 9, 10): off or already played
    assert draft.swap_auto(conn, cid, LIVE) == 0
    assert on_team(conn) == sorted(TEAM)
    draft.score(conn, cid, LIVE)
    assert float(conn.execute("SELECT points FROM entry_scores").fetchone()[0]) == 0


def test_manual_swap(conn, cid):
    team(conn, cid)
    draft.lock(conn, LOCK)
    assert "not been postponed" in refused(draft.swap, conn, "w", cid, 22, 82, LIVE)
    status(conn, 1)                                    # club 2 (player 22) off; club 1's other match is fixture 7
    assert "own 15" in refused(draft.swap, conn, "w", cid, 22, 21, LIVE)
    assert "must be a DEF" in refused(draft.swap, conn, "w", cid, 22, 34, LIVE)
    assert "unused" in refused(draft.swap, conn, "w", cid, 22, 12, LIVE)
    assert "at most 2 top" in refused(draft.swap, conn, "w", cid, 22, 11, LIVE)    # 11 would make a third top
    assert "open once" in refused(draft.swap, conn, "w", cid, 22, 82, BEFORE)
    draft.swap(conn, "w", cid, 22, 82, LIVE)
    assert on_team(conn) == sorted([71, 33, 65, 82, 12])


# ---------------------------------------------------------------- scoring ---
def test_two_matches_count_and_captain_doubled(conn, cid):
    team(conn, cid)
    draft.lock(conn, LOCK)
    stats(conn, 1, {12: 3, 22: 1})
    stats(conn, 7, {12: 4})                            # player 12's club plays twice: both count
    stats(conn, 2, {33: 5})                            # captain
    stats(conn, 3, {65: 2})
    stats(conn, 6, {111: 50})                          # not on the team
    assert draft.score(conn, cid, LIVE) == 1
    pts, cap, per, final = conn.execute("SELECT points, captain_points, players, is_final FROM entry_scores").fetchone()
    assert float(pts) == 20 and float(cap) == 10 and not final
    assert per["12"] == 7 and per["33"] == 10
    m = draft.mine(conn, "w", cid, LIVE)
    assert m["state"] == "live" and m["total"] == 20 and m["captain_id"] == 33
    assert {p["id"]: p["points"] for p in m["team"]}[33] == 10


def test_final_row_is_frozen(conn, cid):
    team(conn, cid)
    draft.lock(conn, LOCK)
    for fid, _, h, a in FIXTURES:
        status(conn, fid, s="FT")
        stats(conn, fid, {h * 10 + 5: 1, a * 10 + 5: 1})
    stats(conn, 2, {33: 5})
    assert draft.score(conn, cid, t(23, 21)) == 1                          # over, but not 15 minutes on
    assert not conn.execute("SELECT is_final FROM entry_scores").fetchone()[0]
    assert draft.score(conn, cid, LATE) == 1 and not conn.execute("SELECT is_final FROM entry_scores").fetchone()[0]
    conn.execute("UPDATE player_match_scores SET is_final = true")
    assert draft.score(conn, cid, LATE) == 1
    pts, final = conn.execute("SELECT points, is_final FROM entry_scores").fetchone()
    assert final and float(pts) == 10 + 1                                  # captain 33 x2, plus 65 (club 6, fixture 3)
    stats(conn, 2, {33: 50}, final=True)                                   # a later correction
    assert draft.score(conn, cid, LATE + timedelta(days=1)) == 0
    assert float(conn.execute("SELECT points FROM entry_scores").fetchone()[0]) == 11
    m = draft.mine(conn, "w", cid, LATE)
    assert m["state"] == "final" and m["total"] == 11
