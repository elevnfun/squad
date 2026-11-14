"""The public test season's faucet: free test $ELEVN once per wallet, on a local Solana chain (LiteSVM)."""

from datetime import datetime, timedelta, timezone

import pytest
from solders.keypair import Keypair

from squad import chain, faucet, payouts
from tests.test_game_db import conn  # noqa: F401
from tests.test_payouts import SOL, LocalChain, make_mint

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
RAW = 10 ** 6   # the test mint has 6 decimals


@pytest.fixture
def tap(conn, monkeypatch):
    local, authority = LocalChain(), Keypair()
    local.svm.airdrop(authority.pubkey(), 1 * SOL)
    mint = make_mint(local, authority)
    monkeypatch.setenv("SQUAD_TOKEN_MINT", str(mint))
    monkeypatch.setitem(faucet.FEES, "cluster", "devnet")
    return {"conn": conn, "local": local, "authority": authority, "mint": mint}


def claim(tap, wallet=None, ip="203.0.113.7", now=NOW, authority=None):
    wallet = wallet or str(Keypair().pubkey())
    out = faucet.claim(tap["conn"], tap["local"], authority or tap["authority"], wallet, ip, now)
    return wallet, out


def test_a_wallet_gets_its_test_tokens_once(tap):
    wallet, out = claim(tap)
    assert out["amount"] == faucet.F["amount"]
    assert tap["local"].token_balance_raw(wallet, tap["mint"]) == faucet.F["amount"] * RAW
    assert faucet.claimed(tap["conn"], wallet)
    with pytest.raises(faucet.FaucetError, match="already"):
        claim(tap, wallet, ip="198.51.100.9")
    assert tap["local"].token_balance_raw(wallet, tap["mint"]) == faucet.F["amount"] * RAW


def test_one_connection_claims_only_a_few_wallets_a_day(tap):
    for _ in range(faucet.F["per_ip_per_day"]):
        claim(tap)
    with pytest.raises(faucet.FaucetError, match="This connection"):
        claim(tap)
    claim(tap, now=NOW + timedelta(hours=25))   # a day later it works again


def test_the_faucet_has_a_daily_limit(tap, monkeypatch):
    monkeypatch.setitem(faucet.F, "per_day", 2)
    claim(tap, ip="203.0.113.1")
    claim(tap, ip="203.0.113.2")
    with pytest.raises(faucet.FaucetError, match="today"):
        claim(tap, ip="203.0.113.3")


def test_a_failed_send_leaves_the_wallet_free_to_try_again(tap, monkeypatch):
    wallet = str(Keypair().pubkey())

    def refuse(raw):
        raise RuntimeError("Blockhash not found")
    monkeypatch.setattr(tap["local"], "send", refuse)
    with pytest.raises(faucet.FaucetError, match="try again"):
        claim(tap, wallet)
    assert not faucet.claimed(tap["conn"], wallet)
    monkeypatch.setattr(tap["local"], "send", LocalChain.send.__get__(tap["local"]))
    claim(tap, wallet)
    assert faucet.claimed(tap["conn"], wallet)


def test_the_faucet_stops_before_its_payer_runs_dry(tap):
    poor = Keypair()
    tap["local"].svm.airdrop(poor.pubkey(), SOL // 1000)   # 0.001 SOL: not enough to open a token account
    with pytest.raises(faucet.FaucetError, match="empty"):
        claim(tap, authority=poor)


def test_the_faucet_never_runs_off_devnet(tap, monkeypatch):
    monkeypatch.setenv("FAUCET_KEYPAIR", "/nonexistent/key.json")
    monkeypatch.setitem(faucet.FEES, "cluster", "mainnet")
    assert not faucet.enabled()
    with pytest.raises(faucet.FaucetError, match="devnet"):
        claim(tap)


def test_the_faucet_needs_its_key_to_be_on(tap, monkeypatch):
    monkeypatch.delenv("FAUCET_KEYPAIR", raising=False)
    assert not faucet.enabled()
    monkeypatch.setenv("FAUCET_KEYPAIR", "/nonexistent/key.json")
    assert faucet.enabled()


def test_the_faucet_never_runs_against_a_mainnet_node(tap, monkeypatch):
    monkeypatch.setenv("FAUCET_KEYPAIR", "/nonexistent/key.json")
    monkeypatch.setenv("SOLANA_RPC", "https://api.mainnet-beta.solana.com")
    assert not faucet.enabled()
    with pytest.raises(faucet.FaucetError, match="devnet"):
        claim(tap)


def test_ipv6_addresses_count_by_their_block(tap):
    for n in range(faucet.F["per_ip_per_day"]):
        claim(tap, ip=f"2001:db8:1:2::{n + 1}")
    with pytest.raises(faucet.FaucetError, match="This connection"):
        claim(tap, ip="2001:db8:1:2:ffff::9")
    claim(tap, ip="2001:db8:1:3::1")   # another network


def test_a_claim_cut_off_mid_send_can_be_tried_again_later(tap):
    wallet = str(Keypair().pubkey())
    tap["conn"].execute("INSERT INTO faucet_claims (wallet, ip, amount, claimed_at) VALUES (%s, 'x', 1, %s)",
                        (wallet, NOW - timedelta(minutes=10)))
    tap["conn"].commit()
    claim(tap, wallet)
    assert tap["local"].token_balance_raw(wallet, tap["mint"]) == faucet.F["amount"] * RAW


def test_a_wallet_address_must_be_real(tap):
    with pytest.raises(faucet.FaucetError, match="address"):
        claim(tap, wallet="not-a-wallet")


def test_devnet_pots_are_topped_up_to_a_smaller_minimum(monkeypatch):
    monkeypatch.setitem(payouts.FEES, "cluster", "devnet")
    assert payouts.minimum_pot() == round(payouts.PZ["minimum_per_area_sol_devnet"] * chain.LAMPORTS)
    monkeypatch.setitem(payouts.FEES, "cluster", "mainnet")
    assert payouts.minimum_pot() == round(payouts.PZ["minimum_per_area_sol"] * chain.LAMPORTS)
