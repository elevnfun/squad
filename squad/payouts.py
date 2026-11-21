"""The fee ledger and the fee wallet's own payouts (buyback, burn, operations).

Money flow (owner decisions, Nov 1, 2026, changed for elevn 2.0):
  1. New fee income = fee wallet balance - what the books say it should hold.
  2. Split 60 / 20 / 10 / 10: the prize share goes to pot:unassigned (squad/pots.py splits it Blitz 60 /
     Draft 40), 20% buyback, 10% low-volume reserve, 10% operations.
  3. Prizes are not paid here: winners Collect from the payout wallet (squad/winnings.py).
  4. One batch, signed by the owner's wallet: buyback and burn, and the operations share.

All amounts are lamports (1 SOL = 1e9). Nothing here holds a private key.
"""

from collections import Counter
from datetime import datetime, timezone

from psycopg.types.json import Jsonb

from . import chain
from .config import CFG

FEES = CFG["fees"]


# ---------------------------------------------------------------- buckets ---
def bucket(conn, name):
    row = conn.execute("SELECT lamports FROM fee_buckets WHERE bucket = %s", (name,)).fetchone()
    return row[0] if row else 0


def add(conn, name, delta, reason, ref=None):
    if not delta:
        return
    conn.execute("""INSERT INTO fee_buckets (bucket, lamports) VALUES (%s, %s)
                    ON CONFLICT (bucket) DO UPDATE SET lamports = fee_buckets.lamports + EXCLUDED.lamports""",
                 (name, delta))
    conn.execute("INSERT INTO fee_events (bucket, delta, reason, ref) VALUES (%s, %s, %s, %s)",
                 (name, delta, reason, ref))


def move(conn, frm, to, lamports, reason, ref=None):
    add(conn, frm, -lamports, reason, ref)
    add(conn, to, lamports, reason, ref)


def accounted(conn):
    row = conn.execute("SELECT accounted_lamports FROM fee_state").fetchone()
    return row[0] if row else 0


def set_accounted(conn, lamports):
    conn.execute("""INSERT INTO fee_state (id, accounted_lamports, updated_at) VALUES (true, %s, now())
                    ON CONFLICT (id) DO UPDATE SET accounted_lamports = EXCLUDED.accounted_lamports, updated_at = now()""",
                 (lamports,))


# ----------------------------------------------------------------- income ---
def record_income(conn, wallet_balance, ref=None):
    """Book any new fee income in the wallet and split it. Returns the income (lamports)."""
    income = wallet_balance - accounted(conn)
    if income <= 0:
        return 0
    prizes = income * round(FEES["prizes"] * 100) // 100
    buyback = income * round(FEES["buyback"] * 100) // 100
    reserve = income * round(FEES["low_volume_reserve"] * 100) // 100
    add(conn, "buyback", buyback, "income", ref)
    add(conn, "reserve", reserve, "income", ref)
    add(conn, "operations", income - prizes - buyback - reserve, "income", ref)
    add(conn, "pot:unassigned", prizes, "income", ref)
    set_accounted(conn, wallet_balance)
    return income


# ------------------------------------------------------------------ batch ---
def prepare_batch(conn, rpc, now=None):
    """A batch: book new income, then list the buyback, burn and operations payouts due. Replaces an unsigned batch."""
    now = now or datetime.now(timezone.utc)
    wallet = chain.fee_wallet()
    if not wallet:
        raise RuntimeError("Set the fee wallet (fees.fee_wallet or FEE_WALLET) first")
    conn.execute("UPDATE payout_batches SET status = 'cancelled' WHERE status = 'prepared'")
    bid = conn.execute("INSERT INTO payout_batches (created_at) VALUES (%s) RETURNING id", (now,)).fetchone()[0]
    income = record_income(conn, rpc.sol_balance(wallet), f"batch:{bid}")

    def item(kind, lamports=0, wallet=None, tokens=0, note=None, status="pending"):
        conn.execute("""INSERT INTO payout_items (batch_id, kind, wallet, lamports, tokens, note, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                     (bid, kind, wallet, lamports, tokens, note, status))

    mint = chain.mint_address()
    buyback = bucket(conn, "buyback")
    if buyback >= FEES["buyback_min_sol"] * chain.LAMPORTS:
        if FEES["cluster"] == "mainnet":
            item("buyback", buyback)
        else:
            item("buyback", buyback, note="devnet: no market to buy on", status="skipped")
    if mint:
        held = rpc.token_balance_raw(wallet, mint)
        if held > 0:
            item("burn", tokens=held)
    ops = bucket(conn, "operations")
    if FEES["operations_wallet"] and ops > 0:
        item("operations", ops, FEES["operations_wallet"])

    kinds = Counter(r[0] for r in conn.execute("SELECT kind FROM payout_items WHERE batch_id = %s", (bid,)).fetchall())
    conn.execute("UPDATE payout_batches SET summary = %s WHERE id = %s",
                 (Jsonb({"income": income, "items": dict(kinds)}), bid))
    conn.commit()
    return bid


def build_transactions(conn, rpc, batch_id):
    """The batch as unsigned transactions with a fresh blockhash, for the owner's wallet to sign.
    Each transaction's message is stored, so only these exact transactions can be submitted."""
    wallet = chain.fee_wallet()
    blockhash = rpc.latest_blockhash()
    items = conn.execute("""SELECT id, kind, wallet, lamports, tokens, note FROM payout_items
                            WHERE batch_id = %s AND status = 'pending' ORDER BY id""", (batch_id,)).fetchall()
    conn.execute("DELETE FROM payout_txs WHERE batch_id = %s AND signature IS NULL", (batch_id,))
    out, idx = [], 0

    def keep(tx_b64, message_b64, ids, label):
        nonlocal idx
        conn.execute("INSERT INTO payout_txs (batch_id, idx, message, item_ids) VALUES (%s, %s, %s, %s)",
                     (batch_id, idx, message_b64, ids))
        out.append({"idx": idx, "tx": tx_b64, "items": ids, "label": label, "versioned": label == "Buy back $ELEVN"})
        idx += 1

    sol = [(i, w, lam) for i, kind, w, lam, _, _ in items if kind == "operations" and lam > 0]
    step = FEES["transfers_per_tx"]
    for k in range(0, len(sol), step):
        chunk = sol[k:k + step]
        tx = chain.sol_transfers_tx(wallet, [(w, lam) for _, w, lam in chunk], blockhash)
        keep(chain.tx_b64(tx), chain.message_b64(tx), [i for i, _, _ in chunk], f"{len(chunk)} SOL payments")
    for i, kind, _, lam, tokens, note in items:
        if kind == "burn":
            mint = chain.mint_address()
            tx = chain.burn_tx(wallet, mint, tokens, blockhash, rpc.token_program_of(mint))
            keep(chain.tx_b64(tx), chain.message_b64(tx), [i], "Burn $ELEVN")
        elif kind == "buyback":
            swap_b64, _ = chain.jupiter_swap_tx(wallet, lam, chain.mint_address())
            from solders.transaction import VersionedTransaction
            import base64
            vtx = VersionedTransaction.from_bytes(base64.b64decode(swap_b64))
            keep(swap_b64, base64.b64encode(bytes(vtx.message)).decode(), [i], "Buy back $ELEVN")
    conn.commit()
    return out


def submit(conn, rpc, batch_id, signed, now=None):
    """Send the owner-signed transactions. Each must match a stored message exactly.
    Marks items paid and updates the books. Returns [(idx, signature or error)]."""
    now = now or datetime.now(timezone.utc)
    results = []
    stored = {i: (m, ids, sig) for i, m, ids, sig in conn.execute(
        "SELECT idx, message, item_ids, signature FROM payout_txs WHERE batch_id = %s", (batch_id,)).fetchall()}
    import base64
    for entry in signed:
        idx = entry["idx"]
        if idx not in stored or stored[idx][2]:
            results.append((idx, "unknown or already sent"))
            continue
        message, ids, _ = stored[idx]
        try:
            tx, raw = chain.load_signed(entry["tx"])
            if base64.b64encode(bytes(tx.message)).decode() != message:
                raise ValueError("signed transaction differs from the one offered")
            sig = rpc.send(raw)
            fee = rpc.confirm(sig)
        except Exception as e:
            conn.execute("UPDATE payout_items SET status = 'failed', note = %s WHERE id = ANY(%s)", (str(e)[:200], ids))
            conn.commit()
            results.append((idx, f"failed: {e}"))
            continue
        conn.execute("UPDATE payout_txs SET signature = %s, status = 'sent' WHERE batch_id = %s AND idx = %s",
                     (sig, batch_id, idx))
        spent = fee
        for iid, kind, lam in conn.execute("SELECT id, kind, lamports FROM payout_items WHERE id = ANY(%s)",
                                           (ids,)).fetchall():
            conn.execute("UPDATE payout_items SET status = 'paid', signature = %s WHERE id = %s", (sig, iid))
            if kind == "buyback":
                add(conn, "buyback", -lam, "paid", sig)
            elif kind == "operations":
                add(conn, "operations", -lam, "paid", sig)
            spent += lam if kind != "burn" else 0
        set_accounted(conn, accounted(conn) - spent)
        conn.commit()
        results.append((idx, sig))
    left = conn.execute("SELECT count(*) FROM payout_items WHERE batch_id = %s AND status = 'pending'", (batch_id,)).fetchone()[0]
    failed = conn.execute("SELECT count(*) FROM payout_items WHERE batch_id = %s AND status = 'failed'", (batch_id,)).fetchone()[0]
    conn.execute("UPDATE payout_batches SET status = %s WHERE id = %s",
                 ("done" if not left and not failed else "partial", batch_id))
    conn.commit()
    return results
