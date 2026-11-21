"""Weekly Draft routes and the minute job's draft step. Own database (squad_test_api_draft).
The week is next week's (Tuesday on), so its lock is in the future; tests move the lock or fixture states when needed."""

from datetime import datetime, time, timedelta, timezone

import psycopg
import pytest
from fastapi.testclient import TestClient
from solders.keypair import Keypair

from squad import api, auth, contests, jobs
from squad.config import CFG
from squad.db import init_schema
from tests.test_payouts import LocalChain

URL = "postgresql://localhost:5433/{}"
DB = "squad_test_api_draft"
PL = 39
REQ = CFG["draft"]["requirement"]
NOW = datetime.now(timezone.utc)
WS = contests.week_start(contests.uk_date(NOW)) + timedelta(days=7)      # next week's Tuesday
WEEK = WS.isoformat()


def at(day, h, m=0):
    """day 0 = the Tuesday; Friday is 3."""
    return datetime.combine(WS + timedelta(days=day), time(h, m), tzinfo=timezone.utc)


# (id, kickoff, home, away): Fri to Mon. Clubs 1 and 3 play twice (fixture 7).
FIXTURES = [(1, at(3, 12), 1, 2), (2, at(4, 15), 3, 4), (3, at(4, 17, 30), 5, 6), (4, at(5, 14), 7, 8),
            (7, at(5, 16, 30), 1, 3), (5, at(6, 19), 9, 10), (6, at(6, 20), 11, 12)]
LOCK = at(3, 12)
# Hand-made 15 (tier, player, value). Players are club*10 + i: i 1-2 DEF, 3-4 MID, 5 FWD, 6 GK.
POOL = [("top", 11, 9.0), ("top", 33, 8.9), ("top", 55, 8.8), ("top", 71, 8.7), ("top", 93, 8.6),
        ("mid", 22, 6.0), ("mid", 44, 5.9), ("mid", 65, 5.8), ("mid", 82, 5.7), ("mid", 104, 5.6),
        ("budget", 12, 4.0), ("budget", 34, 3.9), ("budget", 45, 3.8), ("budget", 72, 3.7), ("budget", 115, 3.6)]
TEAM = [71, 33, 65, 22, 12]         # 2 top, 2 mid, 1 budget; clubs 7, 3, 6, 2, 1
CAPTAIN = 33
BODY = {"team_ids": TEAM, "captain_id": CAPTAIN}


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db-container.sh)")
    admin.execute(f"DROP DATABASE IF EXISTS {DB}")
    admin.execute(f"CREATE DATABASE {DB}")
    c = psycopg.connect(URL.format(DB))
    init_schema(c)
    gw = c.execute("INSERT INTO gameweeks (league_id, season, round) VALUES (%s, 2026, 'R') RETURNING id", (PL,)).fetchone()[0]
    pos = {1: "DEF", 2: "DEF", 3: "MID", 4: "MID", 5: "FWD", 6: "GK"}
    n = 0
    for club in range(1, 15):
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
    contests.ensure(c, now=NOW)
    c.commit()
    yield c
    c.close()
    admin.execute(f"DROP DATABASE {DB}")
    admin.close()


@pytest.fixture
def client(conn, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL.format(DB))
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", str(REQ))
    api._pool = None
    with TestClient(api.app) as c:
        yield c
    if api._pool is not None:
        api._pool.close()
    api._pool = None


WALLET = str(Keypair().pubkey())
H = {"Authorization": f"Bearer {auth.token_for(WALLET)}"}
OTHER = str(Keypair().pubkey())


def cid(conn):
    return conn.execute("SELECT id FROM contests WHERE kind = 'draft_week' AND week_start = %s", (WS,)).fetchone()[0]


def give_pool(conn, wallet=WALLET):
    """Store the hand-made 15 (instead of a random deal)."""
    seen = {}
    for tier, pid, value in POOL:
        seen[tier] = seen.get(tier, 0) + 1
        conn.execute("INSERT INTO draft_packs (contest_id, wallet, pack, tier, player_id, value) VALUES (%s, %s, %s, %s, %s, %s)",
                     (cid(conn), wallet, seen[tier], tier, pid, value))
    conn.commit()


def test_week_next_and_rules(client, conn):
    for week in (WEEK, "next"):
        r = client.get(f"/api/draft/{week}")
        assert r.status_code == 200
        b = r.json()
        assert b["contest"]["id"] == cid(conn) and b["locks_at"] is not None and len(b["fixtures"]) == 7
        assert b["fixtures"][0]["home"] == "Club1" and b["fixtures"][0]["away"] == "Club2"
        assert b["rules"]["team_size"] == 5 and b["rules"]["requirement"] == REQ and b["rules"]["max_per_club"] == 2
        assert b["rules"]["captain_multiplier"] == 2.0 and b["rules"]["max_per_tier"] == {"top": 2, "mid": 2}
        assert "mine" not in b and len(b["sample"]) == 15
    assert client.get("/api/draft/2020-01-01").status_code == 404
    assert client.get("/api/draft/nonsense").status_code == 404
    conn.execute("UPDATE contests SET state = 'final' WHERE kind = 'draft_week' AND week_start = %s", (WS,))
    conn.commit()
    r = client.get("/api/draft/next")
    assert r.status_code == 404 or r.json()["contest"]["week_start"] != WEEK


def test_guest_sample_stores_nothing(client, conn):
    s = client.get(f"/api/draft/{WEEK}").json()["sample"]
    assert {p["tier"] for p in s} == {"top", "mid", "budget"} and all(p["opened_at"] is None for p in s)
    pool = [p["player_id"] for p in s]
    assert conn.execute("SELECT count(*) FROM draft_packs").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0
    assert pool and client.post(f"/api/draft/{WEEK}/packs/1/open").status_code == 401


def test_check_works_for_a_guest(client, conn):
    pool = [p for _, p, _ in POOL]
    ok = client.post(f"/api/draft/{WEEK}/check", json={"pool_player_ids": pool, **BODY})
    assert ok.json() == {"ok": True, "problems": []}
    bad = client.post(f"/api/draft/{WEEK}/check", json={"pool_player_ids": pool, "team_ids": [11, 12, 22, 33, 34],
                                                         "captain_id": 11}).json()
    assert bad["ok"] is False and bad["problems"]
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0


def test_signed_in_deal_open_save_swap_mine(client, conn):
    b = client.get(f"/api/draft/{WEEK}", headers=H).json()
    assert "sample" not in b and len(b["mine"]["packs"]) == 15 and b["mine"]["state"] == "open"
    assert conn.execute("SELECT count(*) FROM draft_packs WHERE wallet = %s", (WALLET,)).fetchone()[0] == 15
    r = client.post(f"/api/draft/{WEEK}/packs/1/open", headers=H)
    assert r.status_code == 200
    assert {p["opened_at"] is not None for p in r.json()["packs"] if p["pack"] == 1} == {True}
    assert client.post(f"/api/draft/{WEEK}/packs/9/open", headers=H).status_code == 400
    # a stored hand-made 15 so the team is known
    conn.execute("DELETE FROM draft_packs")
    give_pool(conn)
    r = client.put(f"/api/draft/{WEEK}/team", json=BODY, headers=H)
    assert r.status_code == 200
    assert sorted(p["id"] for p in r.json()["team"]) == sorted(TEAM) and r.json()["captain_id"] == CAPTAIN
    assert client.put(f"/api/draft/{WEEK}/team", json={**BODY, "captain_id": 71}, headers=H).json()["captain_id"] == 71
    m = client.get(f"/api/draft/{WEEK}/mine", headers=H).json()
    assert m["place"] == 1 and m["entrants"] == 1 and m["prize_lamports"] == 0 and m["prize_sol"] == 0
    assert len(m["packs"]) == 15 and sum(p["in_team"] for p in m["packs"]) == 5
    # swap: refused before the lock, then after the lock for a player whose club's matches are off
    assert client.post(f"/api/draft/{WEEK}/swap", json={"out_id": 71, "in_id": 82}, headers=H).status_code == 400
    conn.execute("UPDATE contests SET locks_at = %s WHERE id = %s", (NOW - timedelta(hours=1), cid(conn)))
    conn.execute("UPDATE fixtures SET status = 'PST' WHERE id = 4")      # club 7's only match
    conn.commit()
    r = client.post(f"/api/draft/{WEEK}/swap", json={"out_id": 71, "in_id": 11}, headers=H)
    assert r.status_code == 200 and 11 in [p["id"] for p in r.json()["team"]] and 71 not in [p["id"] for p in r.json()["team"]]


def test_save_and_mine_need_sign_in(client):
    assert client.put(f"/api/draft/{WEEK}/team", json=BODY).status_code == 401
    assert client.post(f"/api/draft/{WEEK}/swap", json={"out_id": 1, "in_id": 2}).status_code == 401
    assert client.get(f"/api/draft/{WEEK}/mine").status_code == 401


def test_save_refused_below_requirement(client, conn, monkeypatch):
    give_pool(conn)
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", str(REQ - 1))
    r = client.put(f"/api/draft/{WEEK}/team", json=BODY, headers=H)
    assert r.status_code == 400 and "300,000 $ELEVN" in r.json()["detail"]
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0


def test_save_refused_after_lock(client, conn):
    give_pool(conn)
    assert client.put(f"/api/draft/{WEEK}/team", json=BODY, headers=H).status_code == 200
    conn.execute("UPDATE contests SET locks_at = %s WHERE id = %s", (NOW - timedelta(minutes=1), cid(conn)))
    conn.commit()
    r = client.put(f"/api/draft/{WEEK}/team", json={**BODY, "captain_id": 71}, headers=H)
    assert r.status_code == 400 and "locked" in r.json()["detail"]


def test_job_locks_scores_and_boards_show_points(client, conn):
    give_pool(conn)
    assert client.put(f"/api/draft/{WEEK}/team", json=BODY, headers=H).status_code == 200
    give_pool(conn, OTHER)          # a second wallet, saved straight in the database, so the board has two lines
    eid = conn.execute("INSERT INTO entries (contest_id, wallet, slot, captain_id) VALUES (%s, %s, 1, 71) RETURNING id",
                       (cid(conn), OTHER)).fetchone()[0]
    for p in TEAM:
        conn.execute("INSERT INTO entry_players (entry_id, player_id) VALUES (%s, %s)", (eid, p))
    conn.execute("UPDATE fixtures SET status = 'FT' WHERE id = 1")      # clubs 1 and 2 have played
    for pid, base in {12: 1.0, 22: 4.0, 33: 5.0, 71: 2.0}.items():
        conn.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes)
                        VALUES (1, %s, %s, 'MID', 90)""", (pid, pid // 10))
        conn.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus, involvement, base,
                        breakdown, is_final) VALUES (1, %s, %s, 0, 0, %s, '[]', false)""", (pid, base, base))
    conn.commit()
    out = jobs.run_once(conn, LocalChain(), now=LOCK + timedelta(hours=2))
    assert out["draft"] == {"locked": 2, "swapped": 0, "scored": 2}
    mult = CFG["draft"]["captain_multiplier"]
    mine = client.get(f"/api/draft/{WEEK}/mine", headers=H).json()
    assert mine["total"] == 1 + 4 + 5 * mult + 2 and mine["state"] in ("live", "locked")      # 17: captain 33 doubled
    assert mine["place"] == 1 and mine["entrants"] == 2                  # the other wallet: 1 + 4 + 5 + 2 * 2 = 14
    assert client.get(f"/api/draft/{WEEK}", headers=H).json()["mine"]["total"] == mine["total"]
    board = client.get(f"/api/contests/{cid(conn)}/board", headers=H).json()
    assert board["you"]["points"] == mine["total"] and board["you"]["place"] == 1
    assert [r["points"] for r in board["rows"]] == [17.0, 14.0]
