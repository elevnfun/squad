"""elevn 2.0 API: today, boards, winnings (Collect and Withdraw on LiteSVM), admin release, the job and the watcher.
Own database (squad_test_api2) so it can run next to the other test files."""

import base64
from datetime import date, datetime, timedelta, timezone

import psycopg
import pytest
from fastapi.testclient import TestClient
from solders.keypair import Keypair
from solders.transaction import Transaction

from squad import api, auth, contests, holdings, jobs, payouts, watcher, winnings
from squad.config import CFG
from squad.db import init_schema
from tests.test_payouts import LocalChain

URL = "postgresql://localhost:5433/{}"
DB = "squad_test_api2"
SOL = 1_000_000_000
PL = 39


def t(day, hm, month=11):
    h, m = hm.split(":")
    return datetime(2026, month, day, int(h), int(m), tzinfo=timezone.utc)


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
    c.execute("INSERT INTO clubs (id, name) VALUES (1, 'Reds'), (2, 'Blues')")
    c.execute("INSERT INTO players (id, name, position, club_id) VALUES (1, 'P', 'MID', 1)")
    c.commit()
    yield c
    c.close()
    admin.execute(f"DROP DATABASE {DB}")
    admin.close()


@pytest.fixture
def world(conn, monkeypatch):
    """The API on the test database, a LiteSVM chain, a funded payout wallet, an admin (fee wallet) and a player."""
    local = LocalChain()
    payout, player, adm = Keypair(), Keypair(), Keypair()
    local.svm.airdrop(payout.pubkey(), 100 * SOL)
    local.svm.airdrop(player.pubkey(), 1 * SOL)
    monkeypatch.setenv("PAYOUT_WALLET", str(payout.pubkey()))
    monkeypatch.setenv("PAYOUT_WALLET_KEY", str(payout))
    monkeypatch.setenv("FEE_WALLET", str(adm.pubkey()))
    monkeypatch.setenv("DATABASE_URL", URL.format(DB))
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", "150000")
    monkeypatch.setattr(api, "rpc", lambda: local)
    monkeypatch.setitem(CFG["boards"], "manual_review", True)
    api._pool = None
    with TestClient(api.app) as client:
        yield client, local, player, adm
    if api._pool is not None:
        api._pool.close()
    api._pool = None


def hdr(kp):
    return {"Authorization": f"Bearer {auth.token_for(str(kp.pubkey()))}"}


def fx(conn, fid, kickoff, status="NS"):
    conn.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id,
                                          home_goals, away_goals)
                    VALUES (%s, %s, 2026, 'R', %s, %s, 1, 2, 2, 1)""", (fid, PL, kickoff, status))


def matchday(conn, state="live"):
    fx(conn, 1, t(20, "15:00"), "FT")
    conn.execute("""INSERT INTO contests (kind, day, week_start, state, final_at)
                    VALUES ('blitz_matchday', %s, %s, %s, %s) RETURNING id""",
                 (date(2026, 11, 20), date(2026, 11, 17), state, t(20, "17:15")))
    cid = conn.execute("SELECT id FROM contests").fetchone()[0]
    conn.commit()
    return cid


def enter(conn, cid, wallet, pts, cap=0, slot=1):
    e = conn.execute("""INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id)
                        VALUES (%s, %s, %s, 1, 1) RETURNING id""", (cid, wallet, slot)).fetchone()[0]
    conn.execute("INSERT INTO entry_scores (entry_id, points, captain_points) VALUES (%s, %s, %s)", (e, pts, cap))
    conn.commit()


def sign(prep, kp):
    tx = Transaction.from_bytes(base64.b64decode(prep["transaction"]))
    tx.partial_sign([kp], tx.message.recent_blockhash)
    return base64.b64encode(bytes(tx)).decode()


def no_dollars(response):
    text = response.text.lower()
    assert "usd" not in text and "dollar" not in text


# ------------------------------------------------------------------ guests ---
def test_guest_reads_everything(world, conn):
    client = world[0]
    cid = matchday(conn)
    enter(conn, cid, "w1", 10)
    for url in ("/api/today", f"/api/contests/{cid}", f"/api/contests/{cid}/board"):
        r = client.get(url)
        assert r.status_code == 200, url
        no_dollars(r)
    today = client.get("/api/today").json()
    assert today["access"] is None and today["winnings"] is None
    c = client.get(f"/api/contests/{cid}").json()
    assert c["fixtures"][0]["home"] == "Reds" and c["fixtures"][0]["away_goals"] == 1
    board = client.get(f"/api/contests/{cid}/board").json()
    assert board["you"] is None and board["entrants"] == 1
    assert client.get("/api/contests/9999/board").status_code == 404
    assert client.get("/api/contests/9999").status_code == 404


def test_access_follows_balance(world, monkeypatch):
    client, _, player, _ = world
    a = client.get("/api/today", headers=hdr(player)).json()
    assert a["access"]["blitz"] and not a["access"]["draft"] and a["access"]["balance"] == 150000
    assert a["winnings"] == {"ready_lamports": 0, "ready_sol": 0.0, "locked_lamports": 0, "locked_sol": 0.0,
                             "frozen": False}
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", "300000")
    assert client.get("/api/today", headers=hdr(player)).json()["access"]["draft"] is True
    assert client.get("/api/me", headers=hdr(player)).json()["access"] == {"blitz": True, "draft": True}
    monkeypatch.setattr(api, "shown_balance", lambda w: 1 / 0)
    a = client.get("/api/today", headers=hdr(player)).json()["access"]
    assert a["balance"] is None and a["blitz"] is False and a["draft"] is False


def test_me_keeps_its_keys_and_adds_two(world):
    client, _, player, _ = world
    me = client.get("/api/me", headers=hdr(player)).json()
    for key in ("wallet", "balance", "requirement", "squads_allowed", "is_admin", "faucet", "username",
                "username_next_change", "chat", "squads"):
        assert key in me
    assert me["access"] == {"blitz": True, "draft": False}
    assert me["winnings"] == {"ready_sol": 0.0, "locked_sol": 0.0, "frozen": False}


# ------------------------------------------------------------------- board ---
def test_board_ties_you_and_usernames(world, conn):
    client, _, player, _ = world
    me = str(player.pubkey())
    cid = matchday(conn)
    enter(conn, cid, "wA", 50)
    enter(conn, cid, "wB", 50)
    enter(conn, cid, "wC", 40)
    enter(conn, cid, "wD", 30, cap=5)
    enter(conn, cid, me, 10)
    from squad import profiles
    profiles.claim(conn, "wA", "Ayla")
    conn.commit()
    board = client.get(f"/api/contests/{cid}/board", headers=hdr(player)).json()
    assert [r["place"] for r in board["rows"]] == [1, 1, 3, 4, 5]
    assert board["rows"][0]["username"] == "Ayla" and board["rows"][1]["username"] is None
    assert board["entrants"] == 5 and board["you"]["place"] == 5 and board["you"]["you"] is True
    small = client.get(f"/api/contests/{cid}/board?limit=2", headers=hdr(player)).json()
    assert len(small["rows"]) == 2 and small["you"]["place"] == 5       # outside the limit, still returned
    # the places were not written: the board is live
    assert conn.execute("SELECT count(*) FROM results WHERE place IS NOT NULL").fetchone()[0] == 0


# --------------------------------------------------------------- the prize path ---
def test_prize_path_through_the_api(world, conn):
    client, local, player, adm = world
    me = str(player.pubkey())
    cid = matchday(conn, state="review")
    enter(conn, cid, me, 60)
    enter(conn, cid, "wB", 50)
    enter(conn, cid, "wC", 40)
    payouts.add(conn, "pot:blitz", SOL, "test")
    conn.commit()

    # guests and ordinary players cannot use the admin routes
    assert client.get("/api/admin/contests").status_code == 401
    assert client.get("/api/admin/contests", headers=hdr(player)).status_code == 403
    assert client.post(f"/api/admin/contests/{cid}/release", json={}, headers=hdr(player)).status_code == 403

    listing = client.get("/api/admin/contests", headers=hdr(adm)).json()
    [item] = listing["review"]
    assert item["id"] == cid and item["entrants"] == 3 and item["board"][0]["wallet"] == me
    assert item["preview_prizes"][0] == {"wallet": me, "place": 1, "lamports": SOL // 2, "sol": 0.5}
    assert conn.execute("SELECT count(*) FROM winnings").fetchone()[0] == 0     # a preview writes no prize

    r = client.post(f"/api/admin/contests/{cid}/release", json={}, headers=hdr(adm))
    assert r.status_code == 200, r.text
    assert r.json()["prizes"][0]["lamports"] == SOL // 2 and r.json()["contest"]["state"] == "final"
    assert client.post(f"/api/admin/contests/{cid}/release", json={}, headers=hdr(adm)).status_code == 400

    assert client.get("/api/winnings").status_code == 401
    w = client.get("/api/winnings", headers=hdr(player)).json()
    assert (w["ready_lamports"], w["locked_lamports"]) == (SOL // 4, SOL // 4)
    assert w["history"][0]["contest"] == {"kind": "blitz_matchday", "day": "2026-11-20", "week_start": "2026-11-17"}
    assert w["requirement"] == 150_000 and w["can_collect"] and not w["can_withdraw"]
    board = client.get(f"/api/contests/{cid}/board", headers=hdr(player)).json()
    assert board["rows"][0]["prize_lamports"] == SOL // 2 and board["you"]["place"] == 1

    # Collect: prepare, sign as the player, submit
    before = local.sol_balance(player.pubkey())
    local.svm.expire_blockhash()
    prep = client.post("/api/winnings/collect/prepare", headers=hdr(player)).json()
    assert prep["lamports"] == SOL // 4
    res = client.post("/api/winnings/submit", headers=hdr(player),
                      json={"event_id": prep["event_id"], "transaction": sign(prep, player)})
    assert res.status_code == 200 and res.json()["status"] == "confirmed", res.text
    assert local.sol_balance(player.pubkey()) == before + SOL // 4 - 10_000

    # Withdraw is refused until 24 hours pass
    r = client.post("/api/winnings/withdraw/prepare", headers=hdr(player))
    assert r.status_code == 400 and r.json()["detail"] == "The next withdrawal is not open yet."
    conn.execute("UPDATE winnings SET next_withdraw_at = now() - interval '1 minute' WHERE wallet = %s", (me,))
    conn.commit()
    before = local.sol_balance(player.pubkey())
    local.svm.expire_blockhash()
    prep = client.post("/api/winnings/withdraw/prepare", headers=hdr(player)).json()
    assert prep["lamports"] == SOL // 4 // 5
    assert client.post("/api/winnings/submit", headers=hdr(player),
                       json={"event_id": prep["event_id"], "transaction": sign(prep, player)}).status_code == 200
    assert local.sol_balance(player.pubkey()) == before + SOL // 20 - 10_000


def test_pot_is_estimated_until_release(world, conn):
    client, _, _, adm = world
    cid = matchday(conn, state="review")
    for i, w in enumerate(("wA", "wB", "wC")):
        enter(conn, cid, w, 60 - i)
    payouts.add(conn, "pot:blitz", SOL, "test")
    conn.commit()
    c = client.get(f"/api/contests/{cid}").json()
    assert (c["pot_lamports"], c["pot_sol"], c["pot_estimated"]) == (SOL, 1.0, True)
    assert client.get("/api/admin/contests", headers=hdr(adm)).json()["review"][0]["preview_pot_lamports"] == SOL
    assert client.post(f"/api/admin/contests/{cid}/release", json={}, headers=hdr(adm)).status_code == 200
    c = client.get(f"/api/contests/{cid}").json()
    assert (c["pot_lamports"], c["pot_estimated"]) == (SOL, False)


def test_release_errors(world, conn):
    client, _, _, adm = world
    fx(conn, 1, t(20, "15:00"), "FT")
    conn.execute("""INSERT INTO contests (kind, week_start, state) VALUES ('blitz_week', %s, 'review')""",
                 (date(2026, 11, 17),))
    conn.commit()
    wid = conn.execute("SELECT id FROM contests").fetchone()[0]
    r = client.post(f"/api/admin/contests/{wid}/release", json={}, headers=hdr(adm))
    assert r.status_code == 400 and "SOL price" in r.json()["detail"]
    assert client.post("/api/admin/contests/9999/release", json={}, headers=hdr(adm)).status_code == 404
    # the listing shows no prizes for a week until a price is given
    assert client.get("/api/admin/contests", headers=hdr(adm)).json()["review"][0]["preview_prizes"] is None
    given = client.get("/api/admin/contests?sol_usd=250", headers=hdr(adm)).json()["review"][0]
    assert given["preview_pot_lamports"] == 2 * SOL and given["preview_prizes"] == []   # no entrants: no prizes


def test_claim_error_is_a_400(world):
    client, _, player, _ = world
    r = client.post("/api/winnings/collect/prepare", headers=hdr(player))
    assert r.status_code == 400 and r.json()["detail"] == "Nothing to collect yet."
    r = client.post("/api/winnings/submit", headers=hdr(player), json={"event_id": 1, "transaction": "x"})
    assert r.status_code == 400 and r.json()["detail"] == "This claim is not waiting for a signature."
    assert client.post("/api/winnings/collect/prepare").status_code == 401
    assert client.post("/api/winnings/steal/prepare", headers=hdr(player)).status_code == 422


# -------------------------------------------------------------------- jobs ---
def test_jobs_run_once(world, conn):
    _, local, player, _ = world
    me = str(player.pubkey())
    fx(conn, 1, t(20, "15:00"), "FT")
    old = conn.execute("INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, %s) RETURNING id",
                       (date(2026, 11, 1), date(2026, 10, 27))).fetchone()[0]
    winnings.credit(conn, me, 2 * SOL, old, t(20, "10:00"))
    winnings.prepare(conn, local, me, "collect", t(20, "10:00"))     # a claim that is never signed
    conn.commit()
    out = jobs.run_once(conn, local, t(20, "17:15"))
    assert out["ensure"] >= 2 and out["expire"] == 1
    state = conn.execute("SELECT state FROM contests WHERE kind = 'blitz_matchday' AND day = %s",
                         (date(2026, 11, 20),)).fetchone()[0]
    assert state == "review"                                          # manual review on: waits for the owner
    assert winnings.status(conn, me, t(20, "17:15"))["ready"] == SOL  # the claim's amount came back


def test_one_failing_step_does_not_stop_the_rest(conn, monkeypatch):
    monkeypatch.setattr(contests, "tick", lambda *a, **k: 1 / 0)
    out = jobs.run_once(conn, LocalChain(), t(20, "12:00"))
    assert out["tick"] is None and out["ensure"] == 0 and out["expire"] == 0 and out["reconcile"] == (0, 0)


# ----------------------------------------------------------------- watcher ---
def test_watcher_freezes_and_unfreezes_a_locked_balance(conn, monkeypatch):
    wallet = str(Keypair().pubkey())
    cid = conn.execute("INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, %s) RETURNING id",
                       (date(2026, 11, 1), date(2026, 10, 27))).fetchone()[0]
    winnings.credit(conn, wallet, 2 * SOL, cid, t(20, "10:00"))
    nxt = t(21, "10:00")
    conn.execute("UPDATE winnings SET first_collect_at = %s, next_withdraw_at = %s WHERE wallet = %s",
                 (t(20, "10:00"), nxt, wallet))
    conn.commit()
    assert wallet in watcher.players(conn)                           # tracked for its locked balance alone
    balance = {"v": 100_000.0}
    monkeypatch.setattr(holdings, "balance", lambda w, rpc=None: balance["v"])
    row = lambda: conn.execute("SELECT frozen_at, next_withdraw_at FROM winnings WHERE wallet = %s", (wallet,)).fetchone()

    watcher.check(conn, None, wallet, t(20, "12:00"))
    assert row() == (t(20, "12:00"), nxt)
    watcher.check(conn, None, wallet, t(20, "13:00"))                # still low: nothing moves
    assert row() == (t(20, "12:00"), nxt)
    balance["v"] = 150_000.0
    watcher.check(conn, None, wallet, t(20, "15:00"))                # frozen for 3 hours: timer pushed back 3 hours
    assert row() == (None, nxt + timedelta(hours=3))
    conn.execute("UPDATE winnings SET locked_lamports = 0 WHERE wallet = %s", (wallet,))
    conn.commit()
    assert wallet not in watcher.players(conn)
