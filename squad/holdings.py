"""Token holdings: reading a wallet's $ELEVN balance, and keeping the last balance seen.

Balances come from Solana RPC for the configured mint; the watcher (squad/watcher.py) keeps
wallet_holdings current in real time and freezes locked winnings when a wallet drops below the
line. Before the token exists, HOLDINGS_DEV_BALANCE (e.g. 300000) gives every wallet that
balance for local testing.
"""

import os
from datetime import datetime, timezone

_decimals = {}


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


def store(conn, wallet, bal, now=None):
    conn.execute("""INSERT INTO wallet_holdings (wallet, balance, updated_at) VALUES (%s, %s, %s)
                    ON CONFLICT (wallet) DO UPDATE SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at""",
                 (wallet, bal, now or datetime.now(timezone.utc)))


def stored_balance(conn, wallet):
    row = conn.execute("SELECT balance FROM wallet_holdings WHERE wallet = %s", (wallet,)).fetchone()
    return float(row[0]) if row else None
