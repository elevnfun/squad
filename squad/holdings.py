"""Token holdings: how many squads a wallet pays for, and freezing the rest.

150k tokens = one squad, counted across all league areas (750k = one in each of five).
Balances come from Solana RPC for the configured mint; the watcher (squad/watcher.py) keeps
wallet_holdings current in real time. Before the token exists, HOLDINGS_DEV_BALANCE (e.g.
300000) gives every wallet that balance for local testing.

Freeze rule (owner, Nov 1, 2026): when a wallet's balance stops paying for all its squads, its
newest squads beyond what the balance pays for freeze at once for the gameweek in play: no
points from that moment, no prize that week, and buying back does not undo it. A frozen squad
plays again from the next lock if the wallet holds enough then.
"""

import os
from datetime import datetime, timezone

from .config import CFG

ACCESS = CFG["access"]
SEASON = CFG["seasons"]["current"]
_decimals = {}


def requirement():
    return ACCESS["per_area_requirement"]


def enabled():
    """Whether holdings can be checked at all (a mint is set, or a dev balance)."""
    from .chain import mint_address
    return bool(os.environ.get("HOLDINGS_DEV_BALANCE") or mint_address())


def balance(wallet, rpc=None):
    """Token balance of a wallet (whole tokens). 0 if the mint is not configured."""
    dev = os.environ.get("HOLDINGS_DEV_BALANCE")
    if dev:
        return float(dev)
    from .chain import Rpc, mint_address
    mint = mint_address()
    if not mint:
        return 0.0
    rpc = rpc or Rpc()
    if mint not in _decimals:
        _decimals[mint] = rpc.decimals(mint)
    return rpc.token_balance_raw(wallet, mint) / 10 ** _decimals[mint]


def squads_allowed(bal):
    """Squads a balance pays for across all league areas."""
    return int(bal // requirement()) * ACCESS["squads_per_requirement"]


def store(conn, wallet, bal, now=None):
    conn.execute("""INSERT INTO wallet_holdings (wallet, balance, updated_at) VALUES (%s, %s, %s)
                    ON CONFLICT (wallet) DO UPDATE SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at""",
                 (wallet, bal, now or datetime.now(timezone.utc)))


def stored_balance(conn, wallet):
    row = conn.execute("SELECT balance FROM wallet_holdings WHERE wallet = %s", (wallet,)).fetchone()
    return float(row[0]) if row else None


def unpaid_squads(conn, wallet, bal, season=SEASON):
    """The wallet's squads its balance does not pay for: the newest ones first to go."""
    ids = [r[0] for r in conn.execute("SELECT id FROM squads WHERE wallet = %s AND season = %s ORDER BY created_at, id",
                                      (wallet, season)).fetchall()]
    return ids[squads_allowed(bal):]


def freeze(conn, squad_id, gameweek_id, at, bal):
    """Freeze a squad for a gameweek it has picks in. Returns True if newly frozen."""
    return conn.execute("""INSERT INTO squad_freezes (squad_id, gameweek_id, frozen_at, balance)
                           SELECT %s, %s, %s, %s WHERE EXISTS (
                               SELECT 1 FROM squad_picks WHERE squad_id = %s AND gameweek_id = %s)
                           ON CONFLICT DO NOTHING""",
                        (squad_id, gameweek_id, at, bal, squad_id, gameweek_id)).rowcount == 1


def enforce(conn, wallet, bal, now=None, season=SEASON):
    """A wallet's balance changed: freeze the squads it no longer pays for in every gameweek in play.
    Returns [(squad_id, gameweek_id)] newly frozen."""
    now = now or datetime.now(timezone.utc)
    store(conn, wallet, bal, now)
    frozen = []
    for sid in unpaid_squads(conn, wallet, bal, season):
        for (gw,) in conn.execute("""SELECT g.id FROM gameweeks g JOIN squads s ON s.league_id = g.league_id
                                     WHERE s.id = %s AND g.season = %s AND g.state IN ('locked', 'live', 'settling')""",
                                  (sid, season)).fetchall():
            if freeze(conn, sid, gw, now, bal):
                frozen.append((sid, gw))
    return frozen


def enforce_at_lock(conn, gw, rpc=None):
    """At lock: every wallet with a squad in this gameweek must pay for it from the first kickoff.
    Uses the watcher's live balance, or reads it now if the watcher has not seen the wallet."""
    if not enabled():
        return []
    frozen = []
    wallets = [r[0] for r in conn.execute("""SELECT DISTINCT s.wallet FROM squad_picks sp JOIN squads s ON s.id = sp.squad_id
                                             WHERE sp.gameweek_id = %s""", (gw.id,)).fetchall()]
    for wallet in wallets:
        bal = stored_balance(conn, wallet)
        if bal is None or os.environ.get("HOLDINGS_DEV_BALANCE"):
            try:
                bal = balance(wallet, rpc)
            except Exception:
                continue        # RPC down: the watcher will catch up; never freeze on missing data
            store(conn, wallet, bal)
        for sid in unpaid_squads(conn, wallet, bal, gw.season):
            if freeze(conn, sid, gw.id, gw.first_kickoff, bal):
                frozen.append(sid)
    return frozen
