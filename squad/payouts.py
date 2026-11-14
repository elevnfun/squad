"""Fees and prizes, paid in SOL from one fee wallet (owner decisions, Nov 1, 2026).

Money flow:
  1. New fee income = fee wallet balance - what the books say it should hold.
  2. Split 60 / 20 / 10 / 10: prize money is shared across league areas by squads entered
     (pot:<league>), 20% buyback, 10% low-volume reserve, 10% operations.
  3. When an area settles, its pot (topped up to 1 SOL from the reserve, 0.1 on devnet) goes to its top 3
     wallets 50 / 30 / 20: one prize per wallet, frozen squads excluded.
  4. One batch a day, signed by the owner's wallet: new prizes' 30%, one daily vesting part
     (1/14 of the 70%) per prize whose wallet holds the requirement that day, buyback and burn.
     A missed day waits; after 90 days without holding, the unpaid rest returns to the pot.

All amounts are lamports (1 SOL = 1e9). Nothing here holds a private key.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from . import chain, holdings
from .config import CFG

PZ, FEES = CFG["prizes"], CFG["fees"]
DAY = timedelta(days=1)


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
def area_weights(conn, season=CFG["seasons"]["current"]):
    """Squads entered per league area in its current gameweek (the earliest not yet settled)."""
    rows = conn.execute("""SELECT g.league_id, count(DISTINCT sp.squad_id) FROM gameweeks g
                           JOIN squad_picks sp ON sp.gameweek_id = g.id
                           WHERE g.season = %s AND g.id IN (
                               SELECT DISTINCT ON (league_id) id FROM gameweeks
                               WHERE season = %s AND state <> 'settled' ORDER BY league_id, number)
                           GROUP BY g.league_id""", (season, season)).fetchall()
    weights = {lid: n for lid, n in rows if n}
    if not weights:     # first week: squads saved for the open window count
        weights = dict(conn.execute("SELECT league_id, count(*) FROM squads WHERE season = %s GROUP BY league_id",
                                    (season,)).fetchall())
    return weights


def split_by(total, weights):
    """Split lamports by weights; the rounding remainder goes to the largest weight."""
    tot = sum(weights.values())
    out = {k: total * w // tot for k, w in weights.items()}
    if out:
        out[max(weights, key=weights.get)] += total - sum(out.values())
    return out


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
    unassigned = bucket(conn, "pot:unassigned")
    weights = area_weights(conn)
    if weights:
        add(conn, "pot:unassigned", -unassigned, "allocation", ref)
        for lid, amount in split_by(prizes + unassigned, weights).items():
            add(conn, f"pot:{lid}", amount, "allocation", ref)
    else:
        add(conn, "pot:unassigned", prizes, "income", ref)
    set_accounted(conn, wallet_balance)
    return income


# ----------------------------------------------------------------- prizes ---
def minimum_pot():
    """Lamports each area's pot is topped up to from the reserve; smaller in the devnet test season."""
    key = "minimum_per_area_sol_devnet" if FEES["cluster"] == "devnet" else "minimum_per_area_sol"
    return round(PZ[key] * chain.LAMPORTS)


def award(conn, gw, now=None):
    """Settle an area's prizes for a gameweek: its pot, topped up to the minimum from the reserve,
    goes to the top wallets (one prize per wallet, frozen squads out). Returns the prizes created."""
    if conn.execute("SELECT 1 FROM prizes WHERE gameweek_id = %s", (gw.id,)).fetchone():
        return []
    pot_name = f"pot:{gw.league_id}"
    minimum = minimum_pot()
    if bucket(conn, pot_name) < minimum:
        top_up = min(minimum - bucket(conn, pot_name), max(bucket(conn, "reserve"), 0))
        move(conn, "reserve", pot_name, top_up, "topup", f"gw:{gw.id}")
    pot = bucket(conn, pot_name)
    ranked = conn.execute("""SELECT sc.squad_id, s.wallet FROM squad_gameweek_scores sc JOIN squads s ON s.id = sc.squad_id
                             WHERE sc.gameweek_id = %s AND NOT EXISTS (
                                 SELECT 1 FROM squad_freezes f WHERE f.squad_id = sc.squad_id AND f.gameweek_id = sc.gameweek_id)
                             ORDER BY sc.points DESC, sc.squad_id""", (gw.id,)).fetchall()
    winners, seen = [], set()
    for sid, wallet in ranked:
        if wallet not in seen:
            seen.add(wallet)
            winners.append((sid, wallet))
        if len(winners) == len(PZ["place_split"]):
            break
    created = []
    if pot <= 0:
        return created
    for place, ((sid, wallet), share) in enumerate(zip(winners, PZ["place_split"]), start=1):
        amount = int(pot * share)
        instant = amount * round(PZ["instant_share"] * 100) // 100
        pid = conn.execute("""INSERT INTO prizes (gameweek_id, squad_id, wallet, place, lamports, instant, vest, created_at)
                              VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                           (gw.id, sid, wallet, place, amount, instant, amount - instant,
                            now or datetime.now(timezone.utc))).fetchone()[0]
        move(conn, pot_name, "owed", amount, "prize", f"prize:{pid}")
        created.append(pid)
    return created


def vest_part(prize_vest, parts_paid):
    """One daily part of the 70%; the last part takes the rounding remainder."""
    days = PZ["vesting_days"]
    return prize_vest - (prize_vest // days) * (days - 1) if parts_paid == days - 1 else prize_vest // days


# ------------------------------------------------------------------ batch ---
def prepare_batch(conn, rpc, now=None):
    """Today's batch: book new income, then list every payout due. Replaces an unsigned batch."""
    now = now or datetime.now(timezone.utc)
    wallet = chain.fee_wallet()
    if not wallet:
        raise RuntimeError("Set the fee wallet (fees.fee_wallet or FEE_WALLET) first")
    conn.execute("UPDATE payout_batches SET status = 'cancelled' WHERE status = 'prepared'")
    bid = conn.execute("INSERT INTO payout_batches (created_at) VALUES (%s) RETURNING id", (now,)).fetchone()[0]
    income = record_income(conn, rpc.sol_balance(wallet), f"batch:{bid}")

    def item(kind, lamports=0, wallet=None, prize_id=None, tokens=0, note=None, status="pending"):
        conn.execute("""INSERT INTO payout_items (batch_id, kind, wallet, lamports, tokens, prize_id, note, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                     (bid, kind, wallet, lamports, tokens, prize_id, note, status))

    req = holdings.requirement()
    for pid, w, inst, inst_paid, vest, parts, last, below, created, lid in conn.execute(
            """SELECT p.id, p.wallet, p.instant, p.instant_paid, p.vest, p.parts_paid, p.last_part_at, p.below_since,
                      p.created_at, g.league_id
               FROM prizes p JOIN gameweeks g ON g.id = p.gameweek_id
               WHERE NOT p.instant_paid OR (p.parts_paid < %s AND p.returned = 0) ORDER BY p.id""",
            (PZ["vesting_days"],)).fetchall():
        if not inst_paid:
            item("instant", inst, w, pid)
        if parts >= PZ["vesting_days"] or now - (last or created) < DAY * 0.8:
            continue
        bal = holdings.stored_balance(conn, w)
        if bal is None:
            bal = holdings.balance(w, rpc)
            holdings.store(conn, w, bal, now)
        if bal >= req:
            conn.execute("UPDATE prizes SET below_since = NULL WHERE id = %s", (pid,))
            item("vest", vest_part(vest, parts), w, pid)
        else:
            since = below or now
            conn.execute("UPDATE prizes SET below_since = %s WHERE id = %s", (since, pid))
            if now - since >= DAY * PZ["unclaimed_return_days"]:
                rest = vest - conn.execute("SELECT vest_paid FROM prizes WHERE id = %s", (pid,)).fetchone()[0]
                conn.execute("UPDATE prizes SET returned = %s WHERE id = %s", (rest, pid))
                move(conn, "owed", f"pot:{lid}", rest, "return", f"prize:{pid}")

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

    sol = [(i, w, lam) for i, kind, w, lam, _, _ in items if kind in ("instant", "vest", "operations") and lam > 0]
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
        for iid, kind, lam, pid in conn.execute("SELECT id, kind, lamports, prize_id FROM payout_items WHERE id = ANY(%s)",
                                                (ids,)).fetchall():
            conn.execute("UPDATE payout_items SET status = 'paid', signature = %s WHERE id = %s", (sig, iid))
            if kind == "instant":
                conn.execute("UPDATE prizes SET instant_paid = true WHERE id = %s", (pid,))
                add(conn, "owed", -lam, "paid", sig)
            elif kind == "vest":
                conn.execute("""UPDATE prizes SET parts_paid = parts_paid + 1, vest_paid = vest_paid + %s,
                                last_part_at = %s WHERE id = %s""", (lam, now, pid))
                add(conn, "owed", -lam, "paid", sig)
            elif kind == "buyback":
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
