"""Winnings ledger: credit prizes, Collect the ready half, Withdraw 20% of the locked half.

All amounts are integer lamports. Nothing is sent automatically: the player signs a transaction
paying them from the payout wallet (they pay the network fee); the server adds the payout wallet's
signature only after it has checked the transaction and recorded its signature.

Callers pass `conn` (they commit, except `submit`, which commits once before sending) and `now`.
"""

import base64
import math
import os
import struct
from datetime import datetime, timedelta, timezone
from fractions import Fraction

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.system_program import ID as SYSTEM_PROGRAM
from solders.transaction import Transaction

from . import chain, pots
from .config import CFG

REL = CFG["release"]
COLLECT_SHARE = Fraction(str(REL["collect_share"]))
WITHDRAW_SHARE = Fraction(str(REL["withdraw_share"]))
WAIT = timedelta(hours=REL["withdraw_every_hours"])
FREEZE_BELOW = REL["freeze_below"]
RECONCILE_GIVE_UP = timedelta(minutes=10)


class ClaimError(Exception):
    """A refusal with a plain message that can be shown to the player."""


def _now(now):
    return now or datetime.now(timezone.utc)


def payout_address():
    return os.environ.get("PAYOUT_WALLET") or CFG["payout_wallet"]["address"]


def _payout_keypair():
    key = os.environ.get("PAYOUT_WALLET_KEY")
    if not key:
        raise ClaimError("Payouts are not available right now. Try again shortly.")
    kp = Keypair.from_base58_string(key)
    if str(kp.pubkey()) != payout_address():
        raise ClaimError("Payouts are not available right now. Try again shortly.")
    return kp


def _withdrawable(locked):
    return int(locked * WITHDRAW_SHARE)       # floor


# ------------------------------------------------------------------ credit / freeze ---
def credit(conn, wallet, lamports, contest_id, now=None):
    """Credit a prize: half ready, half locked (odd lamport to locked). False if already credited."""
    now = _now(now)
    lamports = int(lamports)
    if lamports <= 0:
        return False
    ready = int(lamports * COLLECT_SHARE)
    locked = lamports - ready
    conn.execute("""INSERT INTO winnings (wallet, updated_at) VALUES (%s, %s) ON CONFLICT (wallet) DO NOTHING""",
                 (wallet, now))
    conn.execute("SELECT 1 FROM winnings WHERE wallet = %s FOR UPDATE", (wallet,))
    inserted = conn.execute("""INSERT INTO winnings_events (wallet, kind, ready_delta, locked_delta, contest_id, status, created_at)
                               VALUES (%s, 'credit', %s, %s, %s, 'confirmed', %s)
                               ON CONFLICT (contest_id, wallet) WHERE kind = 'credit' DO NOTHING""",
                            (wallet, ready, locked, contest_id, now)).rowcount == 1
    if inserted:
        conn.execute("""UPDATE winnings SET ready_lamports = ready_lamports + %s, locked_lamports = locked_lamports + %s,
                        updated_at = %s WHERE wallet = %s""", (ready, locked, now, wallet))
    return inserted


def sync_freeze(conn, wallet, token_balance, now=None):
    """Freeze the locked balance and its timer while the wallet holds too little $ELEVN."""
    now = _now(now)
    row = conn.execute("SELECT frozen_at, next_withdraw_at FROM winnings WHERE wallet = %s FOR UPDATE",
                       (wallet,)).fetchone()
    if not row:
        return
    frozen_at, next_at = row
    if token_balance < FREEZE_BELOW and frozen_at is None:
        conn.execute("UPDATE winnings SET frozen_at = %s, updated_at = %s WHERE wallet = %s", (now, now, wallet))
    elif token_balance >= FREEZE_BELOW and frozen_at is not None:
        if next_at is not None:
            next_at = next_at + (now - frozen_at)
        conn.execute("UPDATE winnings SET frozen_at = NULL, next_withdraw_at = %s, updated_at = %s WHERE wallet = %s",
                     (next_at, now, wallet))


# ------------------------------------------------------------------------- status ---
def _pending(conn, wallet, kind):
    return conn.execute("SELECT 1 FROM winnings_events WHERE wallet = %s AND kind = %s AND status = 'pending'",
                        (wallet, kind)).fetchone() is not None


def _seconds(delta):
    return max(0, math.ceil(delta.total_seconds()))


def status(conn, wallet, now=None):
    now = _now(now)
    row = conn.execute("""SELECT ready_lamports, locked_lamports, first_collect_at, next_withdraw_at, frozen_at
                          FROM winnings WHERE wallet = %s""", (wallet,)).fetchone()
    ready, locked, first, next_at, frozen_at = row or (0, 0, None, None, None)
    frozen = frozen_at is not None
    collecting = _pending(conn, wallet, "collect")
    withdrawing = _pending(conn, wallet, "withdraw")
    amount = _withdrawable(locked)

    can_collect, collect_reason = ready > 0 and not collecting, None
    if collecting:
        collect_reason = "A collect is already in progress."
    elif ready <= 0:
        collect_reason = "Nothing to collect yet."

    if first is None or next_at is None:
        seconds = None
    elif frozen:
        seconds = _seconds(next_at - frozen_at)
    else:
        seconds = _seconds(next_at - now)

    can_withdraw, withdraw_reason = False, None
    if first is None:
        withdraw_reason = "Collect your ready winnings first. That starts the 24-hour timer."
    elif frozen:
        withdraw_reason = "Your locked balance is frozen. Hold 150,000 $ELEVN to unfreeze it."
    elif seconds > 0:
        withdraw_reason = "The next withdrawal is not open yet."
    elif withdrawing:
        withdraw_reason = "A withdrawal is already in progress."
    elif amount <= 0:
        withdraw_reason = "Nothing to withdraw."
    else:
        can_withdraw = True
    return {"ready": ready, "locked": locked,
            "withdrawable": amount if can_withdraw else 0,
            "frozen": frozen, "first_collect_at": first, "next_withdraw_at": next_at,
            "seconds_to_withdraw": seconds,
            "can_collect": can_collect, "collect_reason": collect_reason,
            "can_withdraw": can_withdraw, "withdraw_reason": withdraw_reason}


# ----------------------------------------------------------------- two-step claim ---
def _apply(conn, wallet, ready_delta, locked_delta, now):
    conn.execute("""UPDATE winnings SET ready_lamports = ready_lamports + %s, locked_lamports = locked_lamports + %s,
                    updated_at = %s WHERE wallet = %s""", (ready_delta, locked_delta, now, wallet))


def _give_back(conn, wallet, ready_delta, locked_delta, now):
    """Undo a reserve: the event's deltas are negative, so subtract them."""
    _apply(conn, wallet, -ready_delta, -locked_delta, now)


def expire(conn, wallet=None, now=None, max_age_minutes=5):
    """Claims never submitted (no signature) for max_age: failed, amount returned. Returns how many."""
    now = _now(now)
    cutoff = now - timedelta(minutes=max_age_minutes)
    ids = conn.execute("""SELECT id, wallet FROM winnings_events WHERE status = 'pending' AND signature IS NULL
                          AND kind IN ('collect', 'withdraw') AND created_at < %s
                          AND (%s::text IS NULL OR wallet = %s) ORDER BY id""", (cutoff, wallet, wallet)).fetchall()
    n = 0
    for event_id, w in ids:
        conn.execute("SELECT 1 FROM winnings WHERE wallet = %s FOR UPDATE", (w,))
        row = conn.execute("""UPDATE winnings_events SET status = 'failed' WHERE id = %s AND status = 'pending'
                              AND signature IS NULL RETURNING ready_delta, locked_delta""", (event_id,)).fetchone()
        if row:
            _give_back(conn, w, row[0], row[1], now)
            n += 1
    return n


def prepare(conn, rpc, wallet, kind, now=None):
    now = _now(now)
    if kind not in ("collect", "withdraw"):
        raise ClaimError("Unknown claim.")
    expire(conn, wallet, now)
    conn.execute("SELECT 1 FROM winnings WHERE wallet = %s FOR UPDATE", (wallet,))
    st = status(conn, wallet, now)
    if kind == "collect":
        if not st["can_collect"]:
            raise ClaimError(st["collect_reason"])
        amount = st["ready"]
    else:
        if not st["can_withdraw"]:
            raise ClaimError(st["withdraw_reason"])
        amount = st["withdrawable"]
    payout = payout_address()
    if not payout:
        raise ClaimError("Payouts are not available right now. Try again shortly.")
    reserved = conn.execute("""SELECT COALESCE(SUM(-(ready_delta + locked_delta)), 0) FROM winnings_events
                               WHERE status = 'pending' AND kind IN ('collect', 'withdraw')""").fetchone()[0]
    if rpc.sol_balance(payout) < amount + reserved:
        raise ClaimError("The payout wallet is being topped up. Try again shortly.")
    ready_d, locked_d = (-amount, 0) if kind == "collect" else (0, -amount)
    event_id = conn.execute("""INSERT INTO winnings_events (wallet, kind, ready_delta, locked_delta, status, created_at)
                               VALUES (%s, %s, %s, %s, 'pending', %s) RETURNING id""",
                            (wallet, kind, ready_d, locked_d, now)).fetchone()[0]
    _apply(conn, wallet, ready_d, locked_d, now)              # reserve the amount now
    tx = chain.claim_transfer_tx(payout, wallet, amount, rpc.latest_blockhash())
    return {"event_id": event_id, "kind": kind, "lamports": amount,
            "transaction": chain.tx_b64(tx), "message": chain.message_b64(tx)}


def _verify(raw_b64, wallet, payout, lamports):
    """The transaction the player signed must be exactly the one we built. Returns the Transaction."""
    try:
        tx = Transaction.from_bytes(base64.b64decode(raw_b64))
        msg = tx.message
        keys = list(msg.account_keys)
        ok = (msg.header.num_required_signatures == 2 and len(tx.signatures) == 2
              and len(keys) >= 3 and str(keys[0]) == wallet and str(keys[1]) == payout
              and len(msg.instructions) == 1)
        if ok:
            ix = msg.instructions[0]
            data = bytes(ix.data)
            ok = (keys[ix.program_id_index] == SYSTEM_PROGRAM and len(data) == 12
                  and struct.unpack("<IQ", data) == (2, lamports)
                  and list(ix.accounts) == [1, 0])
        if ok:
            ok = tx.signatures[0].verify(Pubkey.from_string(wallet), bytes(msg))
    except Exception:
        ok = False
    if not ok:
        raise ClaimError("This transaction does not match your claim. Nothing was sent.")
    return tx


def _finish(conn, event_id, wallet, kind, now):
    """A claim is confirmed on chain: record it and run the timer. Row must be locked by the caller."""
    done = conn.execute("""UPDATE winnings_events SET status = 'confirmed' WHERE id = %s AND status = 'pending'
                           RETURNING ready_delta, locked_delta""", (event_id,)).fetchone()
    if not done:
        return
    pots.collected(conn, -(done[0] + done[1]), f"claim:{event_id}")      # no longer owed to the winner
    first, frozen_at = conn.execute("SELECT first_collect_at, frozen_at FROM winnings WHERE wallet = %s",
                                    (wallet,)).fetchone()
    # while frozen the timer does not run: leave it so that unfreezing yields a full wait
    start = frozen_at or now
    if kind == "collect" and first is None:
        conn.execute("UPDATE winnings SET first_collect_at = %s, next_withdraw_at = %s, updated_at = %s WHERE wallet = %s",
                     (now, start + WAIT, now, wallet))
    elif kind == "withdraw":
        conn.execute("UPDATE winnings SET next_withdraw_at = %s, updated_at = %s WHERE wallet = %s",
                     (start + WAIT, now, wallet))


def _fail(conn, event_id, wallet, now):
    row = conn.execute("""UPDATE winnings_events SET status = 'failed' WHERE id = %s AND status = 'pending'
                          RETURNING ready_delta, locked_delta""", (event_id,)).fetchone()
    if row:
        _give_back(conn, wallet, row[0], row[1], now)


def _lookup_default(rpc):
    fn = getattr(rpc, "signature_status", None)
    return fn if fn else (lambda signature: None)


def submit(conn, rpc, wallet, event_id, signed_b64, now=None, lookup=None):
    """Verify the player's signed transaction, add the payout signature, send it.
    Returns {"status": "confirmed" | "confirming", "signature", "lamports"}."""
    now = _now(now)
    lookup = lookup or _lookup_default(rpc)
    conn.execute("SELECT 1 FROM winnings WHERE wallet = %s FOR UPDATE", (wallet,))
    ev = conn.execute("""SELECT kind, ready_delta, locked_delta, signature, status, created_at FROM winnings_events
                         WHERE id = %s AND wallet = %s AND kind IN ('collect', 'withdraw')""",
                      (event_id, wallet)).fetchone()
    if not ev or ev[4] != "pending" or ev[3] is not None:
        raise ClaimError("This claim is not waiting for a signature.")
    kind, rd, ld, _, _, created = ev
    if created < now - timedelta(minutes=5):
        expire(conn, wallet, now)
        conn.commit()
        raise ClaimError("This claim took too long. Start again.")
    lamports = -(rd + ld)
    kp = _payout_keypair()
    tx = _verify(signed_b64, wallet, str(kp.pubkey()), lamports)
    tx.partial_sign([kp], tx.message.recent_blockhash)
    if not all(tx.verify_with_results()):
        raise ClaimError("This transaction does not match your claim. Nothing was sent.")
    signature = str(tx.signatures[0])
    # record the signature BEFORE sending, so a crash after the send still leaves it on file
    conn.execute("UPDATE winnings_events SET signature = %s WHERE id = %s", (signature, event_id))
    conn.commit()

    outcome = None
    try:
        rpc.send(bytes(tx))
    except Exception as e:
        # the node refused it (RuntimeError): it never ran. Anything else is unclear: ask the chain.
        known = lookup(signature)
        outcome = "confirmed" if known == "confirmed" else \
            "failed" if known == "failed" or (isinstance(e, RuntimeError) and known is None) else None
    else:
        try:
            rpc.confirm(signature)
            outcome = "confirmed"
        except TimeoutError:
            pass
        except Exception:
            # the chain says it failed, or the check itself broke: only believe the chain's own answer
            known = lookup(signature)
            outcome = known if known in ("confirmed", "failed") else None
    conn.execute("SELECT 1 FROM winnings WHERE wallet = %s FOR UPDATE", (wallet,))
    if outcome == "confirmed":
        _finish(conn, event_id, wallet, kind, now)
    elif outcome == "failed":
        _fail(conn, event_id, wallet, now)
    conn.commit()
    if outcome == "failed":
        raise ClaimError("The transaction failed on the network. Your winnings are back where they were.")
    return {"status": outcome or "confirming", "signature": signature, "lamports": lamports}


def reconcile(conn, rpc, now=None, lookup=None):
    """Settle claims that were sent but not seen confirmed. Returns (confirmed, given_back)."""
    now = _now(now)
    lookup = lookup or _lookup_default(rpc)
    rows = conn.execute("""SELECT id, wallet, kind, signature, created_at FROM winnings_events
                           WHERE status = 'pending' AND signature IS NOT NULL ORDER BY id""").fetchall()
    ok = back = 0
    for event_id, wallet, kind, signature, created in rows:
        state = lookup(signature)
        conn.execute("SELECT 1 FROM winnings WHERE wallet = %s FOR UPDATE", (wallet,))
        if state == "confirmed":
            _finish(conn, event_id, wallet, kind, now)
            ok += 1
        elif state == "failed" or (state is None and created < now - RECONCILE_GIVE_UP):
            _fail(conn, event_id, wallet, now)
            back += 1
    return ok, back


def history(conn, wallet, limit=50):
    rows = conn.execute("""SELECT id, kind, ready_delta, locked_delta, contest_id, signature, status, created_at
                           FROM winnings_events WHERE wallet = %s ORDER BY created_at DESC, id DESC LIMIT %s""",
                        (wallet, limit)).fetchall()
    keys = ("id", "kind", "ready_delta", "locked_delta", "contest_id", "signature", "status", "created_at")
    return [dict(zip(keys, r)) for r in rows]
