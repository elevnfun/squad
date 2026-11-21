"""Penalty Shootout routes. Own database (squad_test_api_shootout)."""

import psycopg
import pytest
from fastapi.testclient import TestClient
from solders.keypair import Keypair

from squad import api, auth
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
DB = "squad_test_api_shootout"


@pytest.fixture
def client(monkeypatch):
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db-container.sh)")
    admin.execute(f"DROP DATABASE IF EXISTS {DB}")
    admin.execute(f"CREATE DATABASE {DB}")
    c = psycopg.connect(URL.format(DB))
    init_schema(c)
    c.commit()
    c.close()
    monkeypatch.setenv("DATABASE_URL", URL.format(DB))
    api._pool = None
    with TestClient(api.app) as tc:
        yield tc
    if api._pool is not None:
        api._pool.close()
    api._pool = None
    admin.execute(f"DROP DATABASE {DB}")
    admin.close()


def hdr(w):
    return {"Authorization": f"Bearer {auth.token_for(w)}"}


WALLET, OTHER = str(Keypair().pubkey()), str(Keypair().pubkey())


def test_guest_practice_game(client):
    g = client.post("/api/shootout/start", json={"mode": "practice"}).json()
    t = g["token"]
    assert g["turn"] == "shoot" and g["state"] == "playing" and "opp" not in g
    for _ in range(5):
        k = client.post(f"/api/shootout/{t}/shoot", json={"side": "left", "power": "medium"}).json()
        assert k["kick"]["result"] in ("goal", "saved", "missed") and k["turn"] == "keep"
        assert "opp" not in k and "dives" not in str(k)
        k = client.post(f"/api/shootout/{t}/keep", json={"side": "right"}).json()
    assert k["state"] == "done" and k["result"] in ("win", "draw", "loss")
    assert client.get(f"/api/shootout/{t}").json()["score"] == k["score"]


def test_errors_are_400_and_ranked_needs_wallet(client):
    r = client.post("/api/shootout/start", json={"mode": "ranked"})
    assert r.status_code == 400 and "wallet" in r.json()["detail"]
    t = client.post("/api/shootout/start", json={"mode": "practice"}).json()["token"]
    r = client.post(f"/api/shootout/{t}/keep", json={"side": "left"})
    assert r.status_code == 400 and "shot first" in r.json()["detail"]
    assert client.get("/api/shootout/missing").status_code == 400


def test_ranked_only_for_its_wallet_and_home(client):
    home = client.get("/api/shootout").json()
    assert home["board"] == [] and "ranked_left" not in home
    assert home["rules"]["rounds"] == 5 and home["rules"]["ranked_games_per_day"] == 10
    t = client.post("/api/shootout/start", json={"mode": "ranked"}, headers=hdr(WALLET)).json()["token"]
    body = {"side": "left", "power": "low"}
    assert client.post(f"/api/shootout/{t}/shoot", json=body).status_code == 400
    assert client.post(f"/api/shootout/{t}/shoot", json=body, headers=hdr(OTHER)).status_code == 400
    assert client.get(f"/api/shootout/{t}", headers=hdr(OTHER)).status_code == 400
    assert client.post(f"/api/shootout/{t}/shoot", json=body, headers=hdr(WALLET)).status_code == 200
    assert client.get("/api/shootout", headers=hdr(WALLET)).json()["ranked_left"] == 9
    for _ in range(4):
        client.post(f"/api/shootout/{t}/keep", json={"side": "left"}, headers=hdr(WALLET))
        client.post(f"/api/shootout/{t}/shoot", json=body, headers=hdr(WALLET))
    done = client.post(f"/api/shootout/{t}/keep", json={"side": "left"}, headers=hdr(WALLET)).json()
    assert done["state"] == "done"
    rows = client.get("/api/shootout").json()["board"]
    assert len(rows) == 1 and rows[0]["wallet"] == WALLET and rows[0]["games"] == 1
