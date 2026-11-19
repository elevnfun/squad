"""Winnings ledger: credit, Collect, Withdraw, freeze and tampering, on LiteSVM (an in-process Solana
chain) and a throwaway Postgres database. Every number is worked out by hand in the comments.

Fees: a claim transaction has two signers (the player and the payout wallet) and the PLAYER pays
the fee, so each claim costs the player 2 x 5,000 = 10,000 lamports (read from the chain below).
"""

import base64
from datetime import date, datetime, timedelta, timezone

import psycopg
import pytest
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction

from squad import chain, winnings
from squad.db import init_schema
from squad.winnings import ClaimError
from tests.test_payouts import LocalChain

SOL = chain.LAMPORTS
T0 = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)
FEE = 10_000       # 2 signatures x 5,000 lamports, paid by the player
URL = "postgresql://localhost:5433/{}"


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db.sh start)")
    admin.execute("DROP DATABASE IF EXISTS squad_test_winnings")
    admin.execute("CREATE DATABASE squad_test_winnings")
    c = psycopg.connect(URL.format("squad_test_winnings"))
    init_schema(c)
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test_winnings")
    admin.close()


class Chain(LocalChain):
    """LocalChain plus switches to make sending misbehave."""
    drop = False        # send does nothing, confirm times out (the transaction never lands)
    timeout = False     # the transaction lands but confirm times out
    refuse = False      # the node refuses the transaction

    def send(self, raw):
        if self.refuse:
            raise RuntimeError("node refused the transaction")
        if self.drop:
            return "dropped"
        return super().send(raw)

    def confirm(self, signature, timeout=60):
        if self.drop or self.timeout:
            raise TimeoutError("not confirmed")
        return 5000


@pytest.fixture
def world(conn, monkeypatch):
    local = Chain()
    payout, player = Keypair(), Keypair()
    local.svm.airdrop(payout.pubkey(), 100 * SOL)
    local.svm.airdrop(player.pubkey(), 1 * SOL)
    monkeypatch.setenv("PAYOUT_WALLET", str(payout.pubkey()))
    monkeypatch.setenv("PAYOUT_WALLET_KEY", str(payout))
    return local, payout, player


def contest(conn, n):
    return conn.execute("INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, %s) RETURNING id",
                        (date(2026, 11, 1) + timedelta(days=n), date(2026, 10, 27))).fetchone()[0]


def check(conn, wallet):
    """Invariant: confirmed + pending events add up to the winnings row."""
    r, l = conn.execute("""SELECT COALESCE(SUM(ready_delta), 0), COALESCE(SUM(locked_delta), 0) FROM winnings_events
                           WHERE wallet = %s AND status IN ('confirmed', 'pending')""", (wallet,)).fetchone()
    row = conn.execute("SELECT ready_lamports, locked_lamports FROM winnings WHERE wallet = %s", (wallet,)).fetchone()
    assert (r, l) == row


def bal(local, kp):
    return local.sol_balance(kp.pubkey())


def player_sign(prep, kp):
    tx = Transaction.from_bytes(base64.b64decode(prep["transaction"]))
    tx.partial_sign([kp], tx.message.recent_blockhash)
    return base64.b64encode(bytes(tx)).decode()


def claim(conn, local, kp, kind, now):
    """prepare, sign as the player, submit. Returns the submit result."""
    local.svm.expire_blockhash()        # so two identical claims are not the same transaction
    prep = winnings.prepare(conn, local, str(kp.pubkey()), kind, now)
    res = winnings.submit(conn, local, str(kp.pubkey()), prep["event_id"], player_sign(prep, kp), now)
    check(conn, str(kp.pubkey()))
    return res


def st(conn, kp, now):
    return winnings.status(conn, str(kp.pubkey()), now)


def funded(conn, kp, sol=2, n=1, now=T0):
    assert winnings.credit(conn, str(kp.pubkey()), sol * SOL, contest(conn, n), now)


# ---------------------------------------------------------------- credit ---
def test_credit_split(conn):
    # 2 SOL = 2,000,000,000 -> ready 1,000,000,000 and locked 1,000,000,000
    assert winnings.credit(conn, "w", 2 * SOL, contest(conn, 1), T0)
    s = winnings.status(conn, "w", T0)
    assert (s["ready"], s["locked"]) == (SOL, SOL)
    # odd: 1,000,000,001 -> ready floor 500,000,000, locked 500,000,001
    assert winnings.credit(conn, "odd", 1_000_000_001, contest(conn, 2), T0)
    s = winnings.status(conn, "odd", T0)
    assert (s["ready"], s["locked"]) == (500_000_000, 500_000_001)
    check(conn, "w"), check(conn, "odd")


def test_credit_is_idempotent(conn):
    c = contest(conn, 1)
    assert winnings.credit(conn, "w", 2 * SOL, c, T0)
    assert not winnings.credit(conn, "w", 2 * SOL, c, T0 + H)
    s = winnings.status(conn, "w", T0)
    assert (s["ready"], s["locked"]) == (SOL, SOL)       # unchanged
    assert len(winnings.history(conn, "w")) == 1
    assert not winnings.credit(conn, "w", 0, contest(conn, 2), T0)
    check(conn, "w")


def test_no_row_is_zeros(conn):
    s = winnings.status(conn, "nobody", T0)
    assert (s["ready"], s["locked"], s["withdrawable"]) == (0, 0, 0)
    assert not s["can_collect"] and not s["can_withdraw"]
    winnings.sync_freeze(conn, "nobody", 0, T0)          # does nothing, no error
    with pytest.raises(ClaimError):
        winnings.prepare(conn, Chain(), "nobody", "collect", T0)


# ------------------------------------------------- the owner's two-day example ---
def test_two_day_example_on_chain(conn, world):
    local, payout, player = world
    w = str(player.pubkey())
    p0, pl0 = bal(local, payout), bal(local, player)

    # day 1: wins 2 SOL -> ready 1, locked 1
    funded(conn, player, 2, 1, T0)
    s = st(conn, player, T0)
    assert (s["ready"], s["locked"]) == (SOL, SOL)
    assert not s["can_withdraw"]                          # no collect yet
    # collects 1 SOL: ready 0; player gains 1 SOL minus the 10,000 fee; payout wallet pays exactly 1 SOL
    r = claim(conn, local, player, "collect", T0)
    assert r["status"] == "confirmed" and r["lamports"] == SOL
    assert bal(local, player) == pl0 + SOL - FEE
    assert bal(local, payout) == p0 - SOL
    s = st(conn, player, T0)
    assert (s["ready"], s["locked"]) == (0, SOL)
    assert s["first_collect_at"] == T0 and s["next_withdraw_at"] == T0 + 24 * H

    # day 2 (exactly 24h later): wins 2 SOL -> ready 1, locked 1 + 1 = 2; the timer does not move
    t1 = T0 + 24 * H
    funded(conn, player, 2, 2, t1)
    s = st(conn, player, t1)
    assert (s["ready"], s["locked"]) == (SOL, 2 * SOL)
    assert s["next_withdraw_at"] == T0 + 24 * H
    pl1 = bal(local, player)
    claim(conn, local, player, "collect", t1)
    assert bal(local, player) == pl1 + SOL - FEE
    # withdraw 20% of 2 SOL = 400,000,000, locked 1,600,000,000
    s = st(conn, player, t1)
    assert s["can_withdraw"] and s["withdrawable"] == 400_000_000
    pl2 = bal(local, player)
    claim(conn, local, player, "withdraw", t1)
    assert bal(local, player) == pl2 + 400_000_000 - FEE
    s = st(conn, player, t1)
    assert (s["ready"], s["locked"]) == (0, 1_600_000_000)
    assert s["next_withdraw_at"] == t1 + 24 * H
    # the next one is 20% of 1.6 SOL = 320,000,000, leaving 1,280,000,000
    t2 = t1 + 24 * H
    assert st(conn, player, t2)["withdrawable"] == 320_000_000
    claim(conn, local, player, "withdraw", t2)
    assert st(conn, player, t2)["locked"] == 1_280_000_000
    kinds = [e["kind"] for e in winnings.history(conn, w)]
    assert kinds == ["withdraw", "withdraw", "collect", "credit", "collect", "credit"]
    assert winnings.history(conn, w)[0]["status"] == "confirmed"


# ------------------------------------------------------------- withdraw timing ---
def test_withdraw_timing(conn, world):
    local, _, player = world
    funded(conn, player, 2)
    # before the first collect: not available at all, even much later
    with pytest.raises(ClaimError, match="Collect"):
        winnings.prepare(conn, local, str(player.pubkey()), "withdraw", T0 + 100 * H)
    claim(conn, local, player, "collect", T0)             # timer: T0 + 24h
    # 23h59m59s: refused (86,399 s have passed of 86,400)
    just_before = T0 + 24 * H - timedelta(seconds=1)
    assert st(conn, player, just_before)["seconds_to_withdraw"] == 1
    with pytest.raises(ClaimError):
        winnings.prepare(conn, local, str(player.pubkey()), "withdraw", just_before)
    check(conn, str(player.pubkey()))
    # exactly 24h: allowed. locked 1,000,000,000 -> pays 200,000,000, locked 800,000,000
    t1 = T0 + 24 * H
    claim(conn, local, player, "withdraw", t1)
    assert st(conn, player, t1)["locked"] == 800_000_000
    # a second one is refused until 24 more hours
    with pytest.raises(ClaimError):
        winnings.prepare(conn, local, str(player.pubkey()), "withdraw", t1 + 24 * H - timedelta(seconds=1))
    # missed days do not add up: 5 days later only ONE withdrawal (20% of 800,000,000 = 160,000,000)
    t2 = t1 + 5 * 24 * H
    assert st(conn, player, t2)["withdrawable"] == 160_000_000
    claim(conn, local, player, "withdraw", t2)
    assert st(conn, player, t2)["locked"] == 640_000_000
    with pytest.raises(ClaimError):
        winnings.prepare(conn, local, str(player.pubkey()), "withdraw", t2 + H)


# ----------------------------------------------------------------------- freeze ---
def test_freeze_keeps_time_left(conn, world):
    local, _, player = world
    w = str(player.pubkey())
    funded(conn, player, 2, 1)
    claim(conn, local, player, "collect", T0)             # timer T0 + 24h
    # frozen 10h in: 14h left
    winnings.sync_freeze(conn, w, 149_999, T0 + 10 * H)
    winnings.sync_freeze(conn, w, 0, T0 + 11 * H)         # already frozen: frozen_at stays
    s = st(conn, player, T0 + 11 * H)
    assert s["frozen"] and s["seconds_to_withdraw"] == 14 * 3600
    # withdraw refused while frozen, even long after the original time
    with pytest.raises(ClaimError, match="frozen"):
        winnings.prepare(conn, local, w, "withdraw", T0 + 5 * 24 * H)
    # collect of the ready part still works while frozen
    funded(conn, player, 2, 2, T0 + 12 * H)               # ready 1,000,000,000, locked 2,000,000,000
    r = claim(conn, local, player, "collect", T0 + 12 * H)
    assert r["status"] == "confirmed"
    assert st(conn, player, T0 + 12 * H)["locked"] == 2 * SOL
    # unfrozen 3 days after freezing (T0 + 10h + 72h = T0 + 82h): timer now T0 + 24h + 72h = T0 + 96h
    unfrozen = T0 + 82 * H
    winnings.sync_freeze(conn, w, 150_000, unfrozen)
    s = st(conn, player, unfrozen)
    assert not s["frozen"] and s["next_withdraw_at"] == T0 + 96 * H and s["seconds_to_withdraw"] == 14 * 3600
    # 14h after unfreezing = T0 + 96h: allowed; one second before: not
    with pytest.raises(ClaimError):
        winnings.prepare(conn, local, w, "withdraw", unfrozen + 14 * H - timedelta(seconds=1))
    claim(conn, local, player, "withdraw", unfrozen + 14 * H)
    assert st(conn, player, unfrozen + 14 * H)["locked"] == 1_600_000_000


def test_first_collect_while_frozen_waits_a_full_day_after_unfreeze(conn, world):
    local, _, player = world
    w = str(player.pubkey())
    funded(conn, player, 2)
    winnings.sync_freeze(conn, w, 0, T0)
    claim(conn, local, player, "collect", T0 + 2 * H)     # allowed; timer waits for the unfreeze
    winnings.sync_freeze(conn, w, 150_000, T0 + 50 * H)   # unfrozen at T0+50h: next = T0+50h+24h
    assert st(conn, player, T0 + 50 * H)["seconds_to_withdraw"] == 24 * 3600


# -------------------------------------------------------------------- tampering ---
def tampered(prep, player, payout, to=None, lamports=None, extra=False, sign=True, payer=None):
    """A transaction other than the one we built, signed by the player (when sign)."""
    to = to or player.pubkey()
    n = lamports or prep["lamports"]
    ixs = [transfer(TransferParams(from_pubkey=payout.pubkey(), to_pubkey=to, lamports=n))]
    if extra:
        ixs.append(transfer(TransferParams(from_pubkey=payout.pubkey(), to_pubkey=player.pubkey(), lamports=1)))
    bh = Transaction.from_bytes(base64.b64decode(prep["transaction"])).message.recent_blockhash
    tx = Transaction.new_unsigned(Message.new_with_blockhash(ixs, (payer or player).pubkey(), bh))
    if sign:
        tx.partial_sign([payer or player], bh)
    return base64.b64encode(bytes(tx)).decode()


def test_tampering_refused_and_pays_once(conn, world):
    local, payout, player = world
    w = str(player.pubkey())
    other = Keypair()
    funded(conn, player, 2)
    prep = winnings.prepare(conn, local, w, "collect", T0)
    p0, pl0 = bal(local, payout), bal(local, player)
    bad = [tampered(prep, player, payout, lamports=prep["lamports"] + 1),      # a different amount
           tampered(prep, player, payout, to=other.pubkey()),                  # a different recipient
           tampered(prep, player, payout, extra=True),                         # an extra instruction
           tampered(prep, player, payout, sign=False),                         # not signed by the player
           tampered(prep, player, payout, payer=other, to=player.pubkey()),    # someone else pays and signs
           base64.b64encode(b"garbage").decode()]
    for b in bad:
        with pytest.raises(ClaimError):
            winnings.submit(conn, local, w, prep["event_id"], b, T0)
    assert (bal(local, payout), bal(local, player), bal(local, other)) == (p0, pl0, 0)
    ev = winnings.history(conn, w)[0]
    assert ev["status"] == "pending" and ev["signature"] is None      # still reserved, nothing recorded
    check(conn, w)
    # another wallet cannot submit this event
    with pytest.raises(ClaimError):
        winnings.submit(conn, local, str(other.pubkey()), prep["event_id"], player_sign(prep, player), T0)
    # the real one works, once
    good = player_sign(prep, player)
    assert winnings.submit(conn, local, w, prep["event_id"], good, T0)["status"] == "confirmed"
    with pytest.raises(ClaimError):
        winnings.submit(conn, local, w, prep["event_id"], good, T0)
    assert bal(local, payout) == p0 - SOL and bal(local, player) == pl0 + SOL - FEE
    check(conn, w)


# ------------------------------------------------------------- expiry / pending ---
def test_unsubmitted_prepare_expires(conn, world):
    local, _, player = world
    w = str(player.pubkey())
    funded(conn, player, 2)
    prep = winnings.prepare(conn, local, w, "collect", T0)
    assert st(conn, player, T0)["ready"] == 0              # reserved
    check(conn, w)
    # a second prepare of the same kind while one is pending: refused
    with pytest.raises(ClaimError, match="progress"):
        winnings.prepare(conn, local, w, "collect", T0 + timedelta(minutes=4))
    assert winnings.expire(conn, w, T0 + timedelta(minutes=5)) == 0      # exactly 5 minutes: not yet
    assert winnings.expire(conn, None, T0 + timedelta(minutes=5, seconds=1)) == 1
    assert st(conn, player, T0)["ready"] == SOL             # amount back
    check(conn, w)
    # the old transaction can no longer be submitted
    with pytest.raises(ClaimError):
        winnings.submit(conn, local, w, prep["event_id"], player_sign(prep, player), T0 + timedelta(minutes=6))
    # and prepare itself expires a stale one, then works
    p2 = winnings.prepare(conn, local, w, "collect", T0 + timedelta(minutes=7))
    assert p2["lamports"] == SOL
    p3_time = T0 + timedelta(minutes=13)
    p3 = winnings.prepare(conn, local, w, "collect", p3_time)       # p2 was stale: expired, new one made
    assert p3["event_id"] != p2["event_id"]
    check(conn, w)


def test_late_submit_is_refused(conn, world):
    local, _, player = world
    w = str(player.pubkey())
    funded(conn, player, 2)
    prep = winnings.prepare(conn, local, w, "collect", T0)
    with pytest.raises(ClaimError, match="too long"):
        winnings.submit(conn, local, w, prep["event_id"], player_sign(prep, player), T0 + timedelta(minutes=6))
    assert st(conn, player, T0 + timedelta(minutes=6))["ready"] == SOL
    check(conn, w)


def test_payout_wallet_short(conn, monkeypatch):
    local = Chain()
    payout, player = Keypair(), Keypair()
    local.svm.airdrop(payout.pubkey(), SOL // 2)           # 0.5 SOL, needs 1 SOL
    monkeypatch.setenv("PAYOUT_WALLET", str(payout.pubkey()))
    monkeypatch.setenv("PAYOUT_WALLET_KEY", str(payout))
    funded(conn, player, 2)
    with pytest.raises(ClaimError) as e:
        winnings.prepare(conn, local, str(player.pubkey()), "collect", T0)
    assert str(e.value) == "The payout wallet is being topped up. Try again shortly."
    assert st(conn, player, T0)["ready"] == SOL
    assert len(winnings.history(conn, str(player.pubkey()))) == 1       # only the credit
    check(conn, str(player.pubkey()))


# ---------------------------------------------------- failures and reconcile ---
def test_node_refuses_gives_back(conn, world):
    local, payout, player = world
    w = str(player.pubkey())
    funded(conn, player, 2)
    local.refuse = True
    with pytest.raises(ClaimError, match="failed"):
        claim(conn, local, player, "collect", T0)
    s = st(conn, player, T0)
    assert s["ready"] == SOL and s["first_collect_at"] is None
    assert winnings.history(conn, w)[0]["status"] == "failed"
    check(conn, w)


def test_timeout_then_reconcile(conn, world):
    local, payout, player = world
    w = str(player.pubkey())
    funded(conn, player, 2)
    local.timeout = True                                   # lands, but confirm times out
    r = claim(conn, local, player, "collect", T0)
    assert r["status"] == "confirming"
    ev = winnings.history(conn, w)[0]
    assert ev["status"] == "pending" and ev["signature"] == r["signature"]
    assert st(conn, player, T0)["first_collect_at"] is None
    # chain does not know yet, and it is young: stays pending
    assert winnings.reconcile(conn, local, T0 + timedelta(minutes=2), lookup=lambda s: None) == (0, 0)
    # chain confirms: finished, timer starts at the reconcile time
    t = T0 + timedelta(minutes=3)
    assert winnings.reconcile(conn, local, t, lookup=lambda s: "confirmed") == (1, 0)
    s = st(conn, player, t)
    assert s["first_collect_at"] == t and s["next_withdraw_at"] == t + 24 * H
    assert winnings.history(conn, w)[0]["status"] == "confirmed"
    check(conn, w)


def test_reconcile_failed_and_dropped(conn, world):
    local, _, player = world
    w = str(player.pubkey())
    funded(conn, player, 2)
    local.drop = True                                      # never lands
    claim(conn, local, player, "collect", T0)
    assert st(conn, player, T0)["ready"] == 0
    # unknown at 9 minutes: still waiting; unknown at 11 minutes: blockhash expired, given back
    assert winnings.reconcile(conn, local, T0 + timedelta(minutes=9), lookup=lambda s: None) == (0, 0)
    assert winnings.reconcile(conn, local, T0 + timedelta(minutes=11), lookup=lambda s: None) == (0, 1)
    assert st(conn, player, T0 + 11 * H)["ready"] == SOL
    check(conn, w)
    # a chain-reported failure is given back at once
    claim(conn, local, player, "collect", T0 + 20 * H)
    assert winnings.reconcile(conn, local, T0 + 20 * H, lookup=lambda s: "failed") == (0, 1)
    assert st(conn, player, T0 + 20 * H)["ready"] == SOL
    check(conn, w)
