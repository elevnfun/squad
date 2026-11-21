"""Web API end to end: wallet sign-in with a real ed25519 key, usernames, the faucet, the chat, the gate."""

import base58
import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from squad import api
from tests.conftest import URL


@pytest.fixture
def client(conn, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL.format("squad_test"))
    monkeypatch.setenv("HOLDINGS_DEV_BALANCE", "150000")
    api._pool = None
    with TestClient(api.app) as c:
        yield c
    if api._pool is not None:
        api._pool.close()
    api._pool = None


def sign_in(client, key=None):
    key = key or SigningKey.generate()
    wallet = base58.b58encode(bytes(key.verify_key)).decode()
    msg = client.post("/api/auth/message", json={"wallet": wallet, "origin": "http://localhost:3000"}).json()["message"]
    sig = base58.b58encode(key.sign(msg.encode()).signature).decode()
    r = client.post("/api/auth/verify", json={"wallet": wallet, "message": msg, "signature": sig})
    assert r.status_code == 200, r.text
    return wallet, {"Authorization": f"Bearer {r.json()['token']}"}, msg, sig


def test_sign_in_needs_the_wallets_own_signature(client):
    wallet, headers, msg, sig = sign_in(client)
    assert client.get("/api/me", headers=headers).json()["requirement"] == 150000
    # the same signed message cannot be replayed
    r = client.post("/api/auth/verify", json={"wallet": wallet, "message": msg, "signature": sig})
    assert r.status_code == 401
    # another key cannot sign for this wallet
    other = SigningKey.generate()
    msg = client.post("/api/auth/message", json={"wallet": wallet}).json()["message"]
    forged = base58.b58encode(other.sign(msg.encode()).signature).decode()
    assert client.post("/api/auth/verify", json={"wallet": wallet, "message": msg,
                                                 "signature": forged}).status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer nonsense.token"}).status_code == 401
    assert client.post("/api/auth/message", json={"wallet": "not-a-wallet"}).status_code == 400
    # only our own sites can ask for a sign-in message
    assert client.post("/api/auth/message", json={"wallet": wallet, "origin": "https://evil.example"}).status_code == 400


def test_sign_in_message_follows_the_standard_format(client):
    """Phantom refuses Sign In With Solana messages that break the format."""
    import re
    wallet = base58.b58encode(bytes(SigningKey.generate().verify_key)).decode()
    msg = client.post("/api/auth/message", json={"wallet": wallet, "origin": "http://localhost:3000"}).json()["message"]
    lines = msg.split("\n")
    assert lines[0] == "localhost:3000 wants you to sign in with your Solana account:"
    assert lines[1] == wallet and lines[2] == "" and lines[4] == ""
    fields = dict(line.split(": ", 1) for line in lines[5:])
    assert fields["URI"] == "http://localhost:3000" and fields["Version"] == "1"
    assert re.fullmatch(r"[A-Za-z0-9]{8,}", fields["Nonce"])
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", fields["Issued At"])
    assert list(fields) == ["URI", "Version", "Nonce", "Issued At", "Expiration Time"]




def test_demo_sign_in_is_off_unless_enabled(client, monkeypatch):
    monkeypatch.delenv("DEV_LOGIN", raising=False)
    assert client.post("/api/auth/dev", json={"wallet": "x"}).status_code == 404


def test_one_step_sign_in(client):
    """Connect-and-sign wallets build the message themselves from our fields; any extra lines
    they add are fine, but the site, nonce and wallet must match."""
    key = SigningKey.generate()
    wallet = base58.b58encode(bytes(key.verify_key)).decode()

    def signed(f, domain=None, address=None):
        msg = (f"{domain or f['domain']} wants you to sign in with your Solana account:\n{address or wallet}\n\n"
               f"{f['statement']}\n\nURI: {f['uri']}\nVersion: {f['version']}\nChain ID: mainnet\n"
               f"Nonce: {f['nonce']}\nIssued At: {f['issuedAt']}\nExpiration Time: {f['expirationTime']}")
        return {"wallet": wallet, "message": msg, "signature": base58.b58encode(key.sign(msg.encode()).signature).decode()}

    fields = client.post("/api/auth/sign-in", json={"origin": "http://localhost:3000"}).json()
    r = client.post("/api/auth/verify", json=signed(fields))
    assert r.status_code == 200
    assert client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200
    # a message naming another site is refused
    fields = client.post("/api/auth/sign-in", json={"origin": "http://localhost:3000"}).json()
    assert client.post("/api/auth/verify", json=signed(fields, domain="evil.example")).status_code == 401
    assert client.post("/api/auth/sign-in", json={"origin": "https://evil.example"}).status_code == 400








def test_the_test_season_faucet_fills_a_signed_in_wallet_once(client, monkeypatch):
    from solders.keypair import Keypair
    from squad import chain, faucet
    from tests.helpers import SOL, LocalChain, make_mint
    local, authority = LocalChain(), Keypair()
    local.svm.airdrop(authority.pubkey(), SOL)
    mint = make_mint(local, authority)
    monkeypatch.setenv("SQUAD_TOKEN_MINT", str(mint))
    monkeypatch.setenv("FAUCET_KEYPAIR", "read-through-the-stub-below")
    monkeypatch.setitem(faucet.FEES, "cluster", "devnet")
    monkeypatch.setattr(faucet, "authority", lambda: authority)
    monkeypatch.setattr(chain, "Rpc", lambda *a, **k: local)

    assert client.post("/api/faucet").status_code == 401
    wallet, headers, _, _ = sign_in(client)
    assert client.get("/api/me", headers=headers).json()["faucet"] == {"amount": faucet.F["amount"], "claimed": False}
    r = client.post("/api/faucet", headers={**headers, "x-elevn-ip": "203.0.113.5"})
    assert r.status_code == 200, r.text
    assert local.token_balance_raw(wallet, mint) == faucet.F["amount"] * 10 ** 6
    assert client.get("/api/me", headers=headers).json()["faucet"]["claimed"] is True
    again = client.post("/api/faucet", headers=headers)
    assert again.status_code == 400 and "already" in again.json()["detail"]


def test_the_faucet_is_hidden_when_it_is_off(client, monkeypatch):
    monkeypatch.delenv("FAUCET_KEYPAIR", raising=False)
    _, headers, _, _ = sign_in(client)
    assert client.get("/api/me", headers=headers).json()["faucet"] is None
    assert client.post("/api/faucet", headers=headers).status_code == 404




def test_a_signed_in_player_picks_a_unique_username(client):
    _, headers, _, _ = sign_in(client)
    me = client.get("/api/me", headers=headers).json()
    assert me["username"] is None and me["chat"] == {"can_post": False, "reason": "username"}
    assert client.get("/api/usernames/Sammy").json() == {"available": True, "reason": None}
    assert client.put("/api/me/username", json={"username": "ab"}, headers=headers).status_code == 400
    r = client.put("/api/me/username", json={"username": "Sammy"}, headers=headers)
    assert r.status_code == 200 and r.json()["username"] == "Sammy"
    me = client.get("/api/me", headers=headers).json()
    assert me["username"] == "Sammy" and me["username_next_change"]
    _, other, _, _ = sign_in(client)
    r = client.put("/api/me/username", json={"username": "sammy"}, headers=other)
    assert r.status_code == 409 and "taken" in r.json()["detail"]
    assert client.get("/api/usernames/SAMMY").json()["available"] is False
    assert client.put("/api/me/username", json={"username": "Sammy2"}).status_code == 401




def test_the_chat_end_to_end(client):
    assert client.get("/api/chat").json() == {"messages": [], "hidden": []}
    assert client.post("/api/chat", json={"body": "hi"}).status_code == 401
    _, headers, _, _ = sign_in(client)
    r = client.post("/api/chat", json={"body": "hi"}, headers=headers)
    assert r.status_code == 403 and "username" in r.json()["detail"]
    client.put("/api/me/username", json={"username": "Sammy"}, headers=headers)
    assert client.get("/api/me", headers=headers).json()["chat"] == {"can_post": True, "reason": None}
    m = client.post("/api/chat", json={"body": "Haaland or Salah?"}, headers=headers).json()
    assert m["username"] == "Sammy" and m["admin"] is False
    assert [x["body"] for x in client.get("/api/chat").json()["messages"]] == ["Haaland or Salah?"]
    assert client.get(f"/api/chat?after={m['id']}").json()["messages"] == []
    r = client.post("/api/chat", json={"body": "see www.scam.io"}, headers=headers)
    assert r.status_code == 400 and "Links" in r.json()["detail"]
    assert client.delete(f"/api/chat/{m['id']}", headers=headers).status_code == 200
    assert client.get(f"/api/chat?after={m['id']}").json()["hidden"] == [m["id"]]


def test_chat_paging_values_are_checked(client):
    assert client.get("/api/chat?after=99999999999999999999").status_code == 422
    assert client.get("/api/chat?after=-1").status_code == 422
    assert client.get("/api/chat?after=1&before=5").status_code == 400
    assert client.get("/api/chat?before=5").status_code == 200


def test_only_the_admin_moderates_the_chat(client, monkeypatch):
    admin_key = SigningKey.generate()
    admin = base58.b58encode(bytes(admin_key.verify_key)).decode()
    monkeypatch.setenv("FEE_WALLET", admin)
    _, admin_headers, _, _ = sign_in(client, admin_key)
    troll, troll_headers, _, _ = sign_in(client)
    client.put("/api/me/username", json={"username": "Trolly"}, headers=troll_headers)
    client.post("/api/chat", json={"body": "rude but no slurs"}, headers=troll_headers)
    assert client.post(f"/api/admin/chat/{admin}", json={"action": "ban"}, headers=troll_headers).status_code == 403
    r = client.post(f"/api/admin/chat/{troll}", json={"action": "ban"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert client.get("/api/chat").json()["messages"] == []
    r = client.post("/api/chat", json={"body": "let me back"}, headers=troll_headers)
    assert r.status_code == 403 and "banned" in r.json()["detail"]
    assert client.post(f"/api/admin/chat/{troll}", json={"action": "nuke"}, headers=admin_headers).status_code == 422


def test_api_answers_only_with_the_gate_key(client, monkeypatch):
    monkeypatch.setattr(api, "_GATE", b"test-key")
    assert client.get("/api/health").status_code == 404
    assert client.get("/api/health", headers={"x-elevn-gate": "wrong"}).status_code == 404
    assert client.get("/api/health", headers={"x-elevn-gate": "test-key"}).status_code == 200
