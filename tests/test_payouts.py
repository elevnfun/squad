"""Fees, prizes, daily payouts and freezes, end to end on a local Solana chain (LiteSVM) and
the throwaway Postgres database. Every amount is worked out by hand in the comments."""

import base64
from datetime import date, datetime, timedelta, timezone

import pytest
from solders.keypair import Keypair
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.system_program import CreateAccountParams, create_account
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.instructions import create_associated_token_account, get_associated_token_address, initialize_mint2, mint_to
from spl.token.models import InitializeMint2Params, MintToParams

from squad import chain, game, holdings, payouts, watcher
from tests.test_game_db import A_BENCH, A_XI, B_BENCH, B_XI, LEAGUE, SEASON, conn, play, setup_world  # noqa: F401

SOL = chain.LAMPORTS
D1 = datetime(2026, 8, 22, 14, 0, tzinfo=timezone.utc)


class LocalChain:
    """The chain.Rpc interface over LiteSVM, an in-process Solana chain."""

    def __init__(self):
        self.svm = LiteSVM()

    def sol_balance(self, pubkey):
        return self.svm.get_balance(chain.Pubkey.from_string(str(pubkey))) or 0

    def token_balance_raw(self, owner, mint):
        ata = get_associated_token_address(chain.Pubkey.from_string(str(owner)), chain.Pubkey.from_string(str(mint)))
        acc = self.svm.get_account(ata)
        return chain.parse_token_account(bytes(acc.data))[2] if acc else 0

    def decimals(self, mint):
        return bytes(self.svm.get_account(chain.Pubkey.from_string(str(mint))).data)[44]

    def token_program_of(self, mint):
        return TOKEN_PROGRAM_ID

    def latest_blockhash(self):
        return self.svm.latest_blockhash()

    def send(self, raw):
        tx = Transaction.from_bytes(raw)
        res = self.svm.send_transaction(tx)
        if isinstance(res, FailedTransactionMetadata):
            raise RuntimeError(str(res.err()))
        return str(tx.signatures[0])

    def confirm(self, signature, timeout=60):
        return 5000

    def run(self, ixs, payer, *signers):
        tx = Transaction.new_unsigned(Message.new_with_blockhash(ixs, payer.pubkey(), self.svm.latest_blockhash()))
        tx.sign([payer, *signers], self.svm.latest_blockhash())
        assert not isinstance(self.svm.send_transaction(tx), FailedTransactionMetadata)


def make_mint(local, authority, decimals=6):
    mint = Keypair()
    rent = local.svm.minimum_balance_for_rent_exemption(82)
    local.run([create_account(CreateAccountParams(from_pubkey=authority.pubkey(), to_pubkey=mint.pubkey(), lamports=rent,
                                                  space=82, owner=TOKEN_PROGRAM_ID)),
               initialize_mint2(InitializeMint2Params(decimals=decimals, program_id=TOKEN_PROGRAM_ID, mint=mint.pubkey(),
                                                      mint_authority=authority.pubkey()))], authority, mint)
    return mint.pubkey()


def give_tokens(local, authority, mint, owner, whole):
    local.run([create_associated_token_account(authority.pubkey(), owner, mint),
               mint_to(MintToParams(program_id=TOKEN_PROGRAM_ID, mint=mint, mint_authority=authority.pubkey(),
                                    dest=get_associated_token_address(owner, mint), amount=whole * 10 ** 6))], authority)


def sign_all(txs, keypair, blockhash):
    out = []
    for t in txs:
        tx = Transaction.from_bytes(base64.b64decode(t["tx"]))
        tx.sign([keypair], blockhash)
        out.append({"idx": t["idx"], "tx": base64.b64encode(bytes(tx)).decode()})
    return out


@pytest.fixture
def world(conn, monkeypatch):
    local, fee = LocalChain(), Keypair()
    a, b = Keypair(), Keypair()
    local.svm.airdrop(fee.pubkey(), 10 * SOL)
    mint = make_mint(local, fee)
    give_tokens(local, fee, mint, fee.pubkey(), 5_000)              # bought-back tokens waiting to burn
    give_tokens(local, fee, mint, a.pubkey(), 150_000)
    give_tokens(local, fee, mint, b.pubkey(), 100_000)
    monkeypatch.setenv("FEE_WALLET", str(fee.pubkey()))
    monkeypatch.setenv("SQUAD_TOKEN_MINT", str(mint))
    monkeypatch.delenv("HOLDINGS_DEV_BALANCE", raising=False)
    setup_world(conn)
    return {"conn": conn, "local": local, "fee": fee, "a": a, "b": b, "mint": mint}


def play_round_one(c, local, a, b):
    """Round 1 as in test_game_db: A scores 49.2, B 24.0. Holdings checked at lock on the local chain."""
    sa = game.create_squad(c, str(a.pubkey()), LEAGUE, name="A")
    sb = game.create_squad(c, str(b.pubkey()), LEAGUE, name="B")
    before = D1 - timedelta(days=1)
    assert game.save_squad(c, sa, A_XI, A_BENCH, 107, 307, before).ok
    assert game.save_squad(c, sb, B_XI, B_BENCH, 108, 208, before).ok
    gw = game.gameweek_by_round(c, LEAGUE, 1)
    holdings_rpc = local
    game.tick(c, LEAGUE, now=D1)
    holdings.enforce_at_lock(c, game.gameweek(c, gw.id), holdings_rpc)
    play(c, 1, {107: (90, 10, -2), 103: (0, 0, 0)})
    game.tick(c, LEAGUE, now=D1 + timedelta(hours=8))
    return sa, sb


def test_split_and_vesting_parts():
    assert payouts.split_by(1000, {39: 2, 140: 1}) == {39: 667, 140: 333}
    parts = [payouts.vest_part(700_000_001, k) for k in range(14)]
    assert sum(parts) == 700_000_001 and parts[0] == 50_000_000


def test_fees_prizes_and_daily_payouts(world, monkeypatch):
    c, local, fee, a, b, mint = (world[k] for k in ("conn", "local", "fee", "a", "b", "mint"))
    monkeypatch.setattr(holdings, "balance", lambda w, rpc=None: local.token_balance_raw(w, mint) / 1e6)
    sa, sb = play_round_one(c, local, a, b)
    # B holds only 100k: below 150k, but B's single squad was saved... and is unpaid -> frozen at lock
    assert c.execute("SELECT squad_id FROM squad_freezes").fetchall() == [(sb,)]

    # fees: the wallet holds 10 SOL minus what setup spent; that is all new income
    start = local.sol_balance(fee.pubkey())
    assert payouts.record_income(c, start) == start
    assert payouts.bucket(c, "pot:39") == start * 60 // 100
    assert payouts.bucket(c, "buyback") == start * 20 // 100
    c.commit()

    game.tick(c, LEAGUE, now=D1 + timedelta(hours=30))           # settle round 1 -> prizes
    pot = start * 60 // 100
    prizes = c.execute("SELECT wallet, place, lamports, instant, vest FROM prizes ORDER BY place").fetchall()
    # B is frozen, so A is the only winner: 50% of the pot; 30% now, 70% over 14 days
    assert prizes == [(str(a.pubkey()), 1, pot // 2, pot // 2 * 30 // 100, pot // 2 - pot // 2 * 30 // 100)]
    assert payouts.bucket(c, "pot:39") == pot - pot // 2

    # day 1 batch: A's 30% plus the first daily part; burn the 5,000 bought-back tokens
    now = D1 + timedelta(days=3)                                  # a day after settlement (hour 30)
    bid = payouts.prepare_batch(c, local, now)
    kinds = sorted(k for (k,) in c.execute("SELECT kind FROM payout_items WHERE batch_id = %s AND status = 'pending'", (bid,)))
    assert kinds == ["burn", "instant", "vest"]
    txs = payouts.build_transactions(c, local, bid)
    a_before = local.sol_balance(a.pubkey())
    results = payouts.submit(c, local, bid, sign_all(txs, fee, local.latest_blockhash()), now)
    assert all(not r.startswith(("failed", "unknown")) for _, r in results)
    instant, vest = prizes[0][3], prizes[0][4]
    assert local.sol_balance(a.pubkey()) - a_before == instant + vest // 14
    assert local.token_balance_raw(fee.pubkey(), mint) == 0                   # burned
    # the books match the wallet again: new income only when new SOL arrives
    assert payouts.record_income(c, local.sol_balance(fee.pubkey())) == 0
    local.svm.airdrop(fee.pubkey(), 1 * SOL)
    assert payouts.record_income(c, local.sol_balance(fee.pubkey())) == 1 * SOL

    # a batch the next day pays the second part; a tampered transaction is refused
    bid = payouts.prepare_batch(c, local, now + timedelta(days=1))
    txs = payouts.build_transactions(c, local, bid)
    evil = chain.sol_transfers_tx(fee.pubkey(), [(Keypair().pubkey(), 1 * SOL)], local.latest_blockhash())
    evil.sign([fee], local.latest_blockhash())
    assert "differs" in payouts.submit(c, local, bid, [{"idx": 0, "tx": base64.b64encode(bytes(evil)).decode()}])[0][1]

    # A sells below 150k: no part that day, the schedule waits
    give_back = local.token_balance_raw(a.pubkey(), mint)
    monkeypatch.setattr(holdings, "balance", lambda w, rpc=None: 0.0 if w == str(a.pubkey()) else 1e9)
    holdings.store(c, str(a.pubkey()), 0)
    bid = payouts.prepare_batch(c, local, now + timedelta(days=2))
    assert c.execute("SELECT count(*) FROM payout_items WHERE batch_id = %s AND kind = 'vest'", (bid,)).fetchone()[0] == 0
    assert c.execute("SELECT below_since FROM prizes").fetchone()[0] is not None
    assert give_back == 150_000 * 10 ** 6


def test_freeze_mid_gameweek_and_watcher(world):
    """Two squads, 300k held; selling to 200k freezes the newest at once: points stop, no prize."""
    c, local, fee, a, mint = (world[k] for k in ("conn", "local", "fee", "a", "mint"))
    w = str(a.pubkey())
    s1 = game.create_squad(c, w, LEAGUE, name="first")
    s2 = game.create_squad(c, w, LEAGUE, slot=2, name="second")
    before = D1 - timedelta(days=1)
    assert game.save_squad(c, s1, A_XI, A_BENCH, 107, 307, before).ok
    assert game.save_squad(c, s2, B_XI, B_BENCH, 108, 208, before).ok
    holdings.store(c, w, 300_000)
    game.tick(c, LEAGUE, now=D1)                                    # locks; 300k pays for both
    assert c.execute("SELECT count(*) FROM squad_freezes").fetchone()[0] == 0

    # matches 10 and 11 are over (kickoffs D1, D1+2h), match 12 (D1+4h) still to come; then the sale
    play(c, 1, status="FT")
    sale = D1 + timedelta(hours=4, minutes=30)
    tracked = {w}

    class Fake:
        def token_balance_raw(self, owner, m):
            return 200_000 * 10 ** 6

        def decimals(self, m):
            return 6
    data = bytes(chain.Pubkey.from_string(str(mint))) + bytes(a.pubkey()) + (200_000 * 10 ** 6).to_bytes(8, "little") + bytes(93)
    note = {"params": {"result": {"value": {"account": {"data": [base64.b64encode(data).decode(), "base64"]}}}}}
    frozen = watcher.handle(c, Fake(), note, tracked, str(mint))
    assert frozen == [(s2, game.gameweek_by_round(c, LEAGUE, 1).id)]
    c.execute("UPDATE squad_freezes SET frozen_at = %s", (sale,))   # the sale's moment, for exact counting
    game.tick(c, LEAGUE, now=D1 + timedelta(hours=8))
    pts = dict(c.execute("SELECT squad_id, points FROM squad_gameweek_scores").fetchall())
    # first squad: captain 4 + 10 x 2 = 24. Second squad keeps only matches 10 and 11 (clubs 1-4):
    # captain 108 = 4, starters 102 104 204 304 404 208 308 = 7 x 2 = 14, the club 5-6 starters score
    # nothing, bench attacker 412 (played match 11) comes on for one of them = 2  ->  20
    assert (float(pts[s1]), float(pts[s2])) == (24.0, 20.0)
    # buying back does not unfreeze this gameweek
    holdings.enforce(c, w, 300_000)
    assert c.execute("SELECT count(*) FROM squad_freezes WHERE squad_id = %s", (s2,)).fetchone()[0] == 1
