"""Matchday Blitz routes and the minute job's lock and score step. Own database (squad_test_api_blitz)."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest
from fastapi.testclient import TestClient
from solders.keypair import Keypair

from squad import api, auth, contests, jobs
from squad.config import CFG
from squad.db import init_schema
from tests.test_payouts import LocalChain

URL = "postgresql://localhost:5433/{}"
DB = "squad_test_api_blitz"
PL = 39
NOW = datetime.now(timezone.utc)
K1 = (NOW + timedelta(days=2)).replace(hour=15, minute=0, second=0, microsecond=0)   # a future matchday
K2 = K1 + timedelta(hours=3)
DAY = contests.uk_date(K1).isoformat()
SQUAD = {"fixture_id": 1, "player_ids": [11, 12, 21], "captain_id": 21}


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
    for club in range(1, 5):
        c.execute("INSERT INTO clubs (id, name) VALUES (%s, %s)", (club, f"Club{club}"))
        for i in range(1, 4):
            c.execute("INSERT INTO players (id, name, position, club_id) VALUES (%s, %s, 'MID', %s)",
                      (club * 10 + i, f"P{club}{i}", club))
    for fid, k, h in [(1, K1, 1), (2, K2, 3)]:
        c.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id)
                     VALUES (%s, %s, 2026, 'R', %s, 'NS', %s, %s)""", (fid, PL, k, h, h + 1))
    contests.ensure(c, now=NOW)
    c.commit()
    yield c
    c.close()
    admin.execute(f"DROP DATABASE {DB}")
    admin.close()


@pytest.fixture
def client(conn, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL.format(DB))
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", str(CFG["blitz"]["requirement"]))
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
    return conn.execute("SELECT id FROM contests WHERE kind = 'blitz_matchday'").fetchone()[0]


def test_day_and_next(client, conn):
    for day in (DAY, "next"):
        r = client.get(f"/api/blitz/{day}")
        assert r.status_code == 200
        b = r.json()
        assert b["contest"]["id"] == cid(conn) and b["squads_allowed"] == 2 and len(b["fixtures"]) == 2
        assert b["fixtures"][0]["home"]["players"] and "mine" not in b
    assert client.get(f"/api/blitz/{DAY}", headers=H).json()["mine"]["squads"] == []
    assert client.get("/api/blitz/2020-01-01").status_code == 404
    assert client.get("/api/blitz/nonsense").status_code == 404
    conn.execute("UPDATE contests SET state = 'final'")
    conn.commit()
    assert client.get("/api/blitz/next").status_code == 404


def test_guest_check_saves_nothing(client, conn):
    r = client.post("/api/blitz/check", json=SQUAD)
    assert r.json() == {"ok": True, "problems": []}
    bad = client.post("/api/blitz/check", json={**SQUAD, "player_ids": [11, 12, 13]}).json()
    assert bad["ok"] is False and bad["problems"]
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0


def test_save_replace_delete_mine(client, conn):
    url = f"/api/blitz/{DAY}/squads/1"
    r = client.put(url, json=SQUAD, headers=H)
    assert r.status_code == 200
    assert r.json()["squads"][0]["captain_id"] == 21 and len(r.json()["squads"][0]["players"]) == 3
    r = client.put(url, json={**SQUAD, "player_ids": [11, 21, 22], "captain_id": 11}, headers=H)
    assert [p["id"] for p in r.json()["squads"][0]["players"]] == [11, 21, 22]
    m = client.get(f"/api/blitz/{DAY}/mine", headers=H).json()
    assert m["place"] == 1 and m["entrants"] == 1 and m["prize_lamports"] == 0 and m["prize_sol"] == 0
    assert client.delete(url, headers=H).json()["squads"] == []
    assert client.delete(url, headers=H).status_code == 400          # nothing left in the slot


def test_sign_in_required(client):
    assert client.put(f"/api/blitz/{DAY}/squads/1", json=SQUAD).status_code == 401
    assert client.delete(f"/api/blitz/{DAY}/squads/1").status_code == 401
    assert client.get(f"/api/blitz/{DAY}/mine").status_code == 401


def test_save_refused_below_requirement(client, conn, monkeypatch):
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", str(CFG["blitz"]["requirement"] - 1))
    r = client.put(f"/api/blitz/{DAY}/squads/1", json=SQUAD, headers=H)
    assert r.status_code == 400 and "150,000 $ELEVN" in r.json()["detail"]
    assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 0


def test_save_refused_after_kickoff(client, conn):
    assert client.put(f"/api/blitz/{DAY}/squads/1", json=SQUAD, headers=H).status_code == 200
    conn.execute("UPDATE fixtures SET status = '1H' WHERE id = 1")   # in play, so kicked off
    conn.commit()
    r = client.put(f"/api/blitz/{DAY}/squads/1", json={**SQUAD, "captain_id": 11}, headers=H)
    assert r.status_code == 400 and "kicked off" in r.json()["detail"]
    assert client.delete(f"/api/blitz/{DAY}/squads/1", headers=H).status_code == 400


def test_job_locks_scores_and_boards_show_points(client, conn):
    assert client.put(f"/api/blitz/{DAY}/squads/1", json=SQUAD, headers=H).status_code == 200
    # a second wallet, saved straight in the database, so the board has two lines
    conn.execute("INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id) VALUES (%s, %s, 1, 1, 11)",
                 (cid(conn), OTHER))
    eid = conn.execute("SELECT id FROM entries WHERE wallet = %s", (OTHER,)).fetchone()[0]
    for p in (11, 12, 21):
        conn.execute("INSERT INTO entry_players (entry_id, player_id) VALUES (%s, %s)", (eid, p))
    conn.commit()
    after = K1 + timedelta(hours=1)
    conn.execute("UPDATE fixtures SET status = 'FT' WHERE id = 1")
    for pid, base in {11: 3.0, 12: 1.0, 21: 5.0}.items():
        conn.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes)
                        VALUES (1, %s, %s, 'MID', 90)""", (pid, pid // 10))
        conn.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus, involvement, base,
                        breakdown, is_final) VALUES (1, %s, %s, 0, 0, %s, '[]', false)""", (pid, base, base))
    conn.commit()
    out = jobs.run_once(conn, LocalChain(), now=after)
    assert out["blitz"] == {"locked": 2, "scored": 2}
    mult = CFG["blitz"]["captain_multiplier"]
    mine = client.get(f"/api/blitz/{DAY}/mine", headers=H).json()
    assert mine["total"] == 3 + 1 + 5 * mult and mine["squads"][0]["locked"] is True
    assert mine["place"] == 1 and mine["entrants"] == 2                  # 14 beats the other wallet's 3*2+1+5=12
    day = client.get(f"/api/blitz/{DAY}", headers=H).json()
    assert day["mine"]["total"] == mine["total"]
    board = client.get(f"/api/contests/{cid(conn)}/board", headers=H).json()
    assert board["you"]["points"] == mine["total"] and board["you"]["place"] == 1
    assert [r["points"] for r in board["rows"]] == [14.0, 12.0]
