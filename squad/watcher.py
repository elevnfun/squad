"""Real-time holdings watcher: python -m squad.watcher

One WebSocket subscription to every $ELEVN token account (Token and Token-2022 programs,
filtered by the mint). Solana pushes each balance change the moment it happens; when the
owner is a player, their balance is re-read and squads it no longer pays for freeze at once
(squad.holdings.enforce). No polling. On (re)connect, every player's balance is read once so
nothing missed while disconnected slips through; new players are picked up every minute.
"""

import asyncio
import base64
import json
import time
from datetime import datetime, timezone

import websockets
from solders.pubkey import Pubkey

from . import holdings, winnings
from .chain import TOKEN_PROGRAMS, Rpc, mint_address, parse_token_account, ws_url
from .config import CFG
from .db import connect

SEASON = CFG["seasons"]["current"]


def is_address(wallet):
    try:
        Pubkey.from_string(wallet)
        return True
    except ValueError:
        return False


def players(conn):
    # simulation databases hold made-up wallets; only real addresses can be watched
    # also every wallet with a locked winnings balance: selling below the line must freeze it at once
    return {r[0] for r in conn.execute(
        """SELECT wallet FROM squads WHERE season = %s UNION SELECT wallet FROM winnings WHERE locked_lamports > 0""",
        (SEASON,)).fetchall() if is_address(r[0])}


def check(conn, rpc, wallet, now=None):
    """Re-read a player's balance and apply the freeze rule. Returns newly frozen [(squad, gameweek)]."""
    bal = holdings.balance(wallet, rpc)
    frozen = holdings.enforce(conn, wallet, bal, now)
    winnings.sync_freeze(conn, wallet, bal, now)
    conn.commit()
    if frozen:
        print(f"{datetime.now():%H:%M:%S} {wallet[:4]}…{wallet[-4:]} holds {bal:,.0f}: froze squads {[s for s, _ in frozen]}")
    return frozen


def handle(conn, rpc, notification, tracked, mint):
    """One programNotification: if the account's owner plays, re-check them."""
    value = notification["params"]["result"]["value"]
    data = base64.b64decode(value["account"]["data"][0])
    if len(data) < 72:
        return None
    acc_mint, owner, _ = parse_token_account(data)
    if acc_mint != mint or owner not in tracked:
        return None
    return check(conn, rpc, owner)


async def watch(once=False):
    mint = mint_address()
    if not mint:
        raise SystemExit("Set SQUAD_TOKEN_MINT (or access.token_mint) to watch holdings")
    rpc, conn, backoff = Rpc(), connect(), 1
    while True:
        try:
            async with websockets.connect(ws_url(), ping_interval=20) as ws:
                for i, program in enumerate(TOKEN_PROGRAMS):
                    await ws.send(json.dumps({"jsonrpc": "2.0", "id": i + 1, "method": "programSubscribe", "params": [
                        str(program), {"encoding": "base64", "commitment": "confirmed",
                                       "filters": [{"memcmp": {"offset": 0, "bytes": mint}}]}]}))
                tracked = players(conn)
                for wallet in tracked:             # catch up on anything missed while disconnected
                    check(conn, rpc, wallet)
                print(f"watching {len(tracked)} players' $ELEVN balances in real time")
                backoff, refreshed = 1, time.time()
                while True:
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
                    except asyncio.TimeoutError:
                        msg = {}
                    if msg.get("method") == "programNotification":
                        handle(conn, rpc, msg, tracked, mint)
                    if time.time() - refreshed > 60:
                        new = players(conn) - tracked
                        for wallet in new:
                            check(conn, rpc, wallet)
                        tracked |= new
                        refreshed = time.time()
                    if once:
                        return
        except (OSError, websockets.WebSocketException) as e:
            print(f"connection lost ({e}); reconnecting in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    asyncio.run(watch())
