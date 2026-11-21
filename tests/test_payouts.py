"""The fee ledger and the fee wallet's own payouts (buyback, burn, operations), on a local Solana chain (LiteSVM)
and the throwaway Postgres database. Every amount is worked out by hand in the comments."""

import base64
from datetime import datetime, timezone

from solders.keypair import Keypair

from squad import chain, payouts, pots
from tests.helpers import SOL, LocalChain, give_tokens, make_mint, sign_all

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)


def funded_fee_wallet(monkeypatch):
    local, fee = LocalChain(), Keypair()
    local.svm.airdrop(fee.pubkey(), 10 * SOL)
    mint = make_mint(local, fee)
    give_tokens(local, fee, mint, fee.pubkey(), 5_000)              # bought-back tokens waiting to burn
    monkeypatch.setenv("FEE_WALLET", str(fee.pubkey()))
    monkeypatch.setenv("SQUAD_TOKEN_MINT", str(mint))
    return local, fee, mint


def test_all_prize_money_goes_to_unassigned_and_pots_split_it_60_40(conn):
    c = conn
    assert payouts.record_income(c, 10 * SOL) == 10 * SOL
    # 60% prizes, 20% buyback, 10% reserve, the rest (10%) operations
    assert payouts.bucket(c, "pot:unassigned") == 6 * SOL
    assert (payouts.bucket(c, "buyback"), payouts.bucket(c, "reserve"), payouts.bucket(c, "operations")) == (2 * SOL, SOL, SOL)
    assert payouts.record_income(c, 10 * SOL) == 0                   # the books match the wallet: nothing new
    assert pots.allocate(c) == (6 * SOL * 60 // 100, 6 * SOL - 6 * SOL * 60 // 100)
    assert (payouts.bucket(c, "pot:blitz"), payouts.bucket(c, "pot:draft"), payouts.bucket(c, "pot:unassigned")) == (
        3_600_000_000, 2_400_000_000, 0)


def test_old_season_squads_no_longer_steer_fee_income(conn):
    """A live database still holds Season squads and picks; they must not send prize money to a league pot."""
    c = conn
    gw = c.execute("INSERT INTO gameweeks (league_id, season, round, number) VALUES (39, 2026, 'Regular Season - 1', 1) "
                   "RETURNING id").fetchone()[0]
    c.execute("INSERT INTO clubs (id, name) VALUES (1, 'Club 1')")
    c.execute("INSERT INTO players (id, name, position, club_id, league_id) VALUES (101, 'P101', 'GK', 1, 39)")
    sid = c.execute("INSERT INTO squads (wallet, league_id, season, slot) VALUES ('w', 39, 2026, 1) RETURNING id").fetchone()[0]
    c.execute("INSERT INTO squad_picks (squad_id, gameweek_id, player_id, slot, price) VALUES (%s, %s, 101, 1, 5.0)", (sid, gw))
    c.commit()
    payouts.record_income(c, 5 * SOL)
    assert payouts.bucket(c, "pot:unassigned") == 3 * SOL
    assert payouts.bucket(c, "pot:39") == 0
    # income booked while the pot was already unassigned keeps adding to it
    payouts.record_income(c, 6 * SOL)
    assert payouts.bucket(c, "pot:unassigned") == 3 * SOL + SOL * 60 // 100
    assert c.execute("SELECT count(*) FROM fee_buckets WHERE bucket ~ '^pot:[0-9]'").fetchone()[0] == 0


def test_batch_pays_operations_burns_tokens_and_refuses_a_tampered_transaction(conn, monkeypatch):
    c = conn
    local, fee, mint = funded_fee_wallet(monkeypatch)
    ops_wallet = Keypair()
    monkeypatch.setitem(payouts.FEES, "operations_wallet", str(ops_wallet.pubkey()))
    start = local.sol_balance(fee.pubkey())
    bid = payouts.prepare_batch(c, local, NOW)
    kinds = sorted(k for (k,) in c.execute("SELECT kind FROM payout_items WHERE batch_id = %s AND status <> 'skipped'", (bid,)))
    assert kinds == ["burn", "operations"]                           # no prize items any more
    assert payouts.bucket(c, "pot:unassigned") == start * 60 // 100
    txs = payouts.build_transactions(c, local, bid)
    ops_before = local.sol_balance(ops_wallet.pubkey())
    results = payouts.submit(c, local, bid, sign_all(txs, fee, local.latest_blockhash()), NOW)
    assert all(not r.startswith(("failed", "unknown")) for _, r in results)
    assert local.sol_balance(ops_wallet.pubkey()) - ops_before == start - start * 60 // 100 - start * 20 // 100 - start * 10 // 100
    assert local.token_balance_raw(fee.pubkey(), mint) == 0          # burned
    assert payouts.bucket(c, "operations") == 0
    # the books match the wallet again: new income only when new SOL arrives
    assert payouts.record_income(c, local.sol_balance(fee.pubkey())) == 0
    local.svm.airdrop(fee.pubkey(), 1 * SOL)
    assert payouts.record_income(c, local.sol_balance(fee.pubkey())) == 1 * SOL

    bid = payouts.prepare_batch(c, local, NOW)
    payouts.build_transactions(c, local, bid)
    evil = chain.sol_transfers_tx(fee.pubkey(), [(Keypair().pubkey(), 1 * SOL)], local.latest_blockhash())
    evil.sign([fee], local.latest_blockhash())
    assert "differs" in payouts.submit(c, local, bid, [{"idx": 0, "tx": base64.b64encode(bytes(evil)).decode()}])[0][1]
