"""Free test $ELEVN for the public devnet test season. Devnet only: it refuses any other cluster.

A signed-in wallet claims once (config.toml [faucet] amount, enough for two squads). One connection
fills only a few wallets a day, and the faucet as a whole a few hundred, so nobody drains the devnet
SOL that pays to open each new wallet's token account (about 0.002 SOL). The test mint's authority
key is read from the file FAUCET_KEYPAIR names: git-ignored, outside the code folder on the server,
and it only ever holds devnet SOL.
"""

import ipaddress
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from solders.keypair import Keypair
from solders.pubkey import Pubkey

from . import chain, devnet
from .config import CFG

F, FEES = CFG["faucet"], CFG["fees"]
DAY = timedelta(days=1)
STALE = timedelta(minutes=5)   # a claim still unsent after this was cut off mid-send (a restart): free again
log = logging.getLogger(__name__)


class FaucetError(Exception):
    """A claim that was refused, with a message the player can read."""


def on_devnet():
    """Both the config and the Solana node in use say devnet, so a copied mainnet setting can never mint."""
    return FEES["cluster"] == "devnet" and "devnet" in chain.rpc_url()


def enabled():
    """On only for the devnet season, with the mint and its authority's key in place."""
    return on_devnet() and bool(os.environ.get("FAUCET_KEYPAIR")) and bool(chain.mint_address())


def network(ip):
    """The unit the per-day limit counts: an IPv4 address, or an IPv6 /64 (one home or phone gets a whole /64)."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    return str(ipaddress.ip_network(f"{addr}/64", strict=False)) if addr.version == 6 else str(addr)


def authority():
    with open(os.environ["FAUCET_KEYPAIR"], encoding="utf-8") as f:
        return Keypair.from_bytes(bytes(json.load(f)))


def claimed(conn, wallet):
    return conn.execute("SELECT 1 FROM faucet_claims WHERE wallet = %s", (wallet,)).fetchone() is not None


def _check(conn, wallet, ip, now):
    if not on_devnet():
        raise FaucetError("Test tokens exist only in the devnet test season")
    try:
        Pubkey.from_string(wallet)
    except ValueError:
        raise FaucetError("That isn't a Solana wallet address") from None
    conn.execute("DELETE FROM faucet_claims WHERE wallet = %s AND signature IS NULL AND claimed_at < %s",
                 (wallet, now - STALE))
    if claimed(conn, wallet):
        raise FaucetError("This wallet already has its test tokens")
    since = now - DAY
    (by_ip,) = conn.execute("SELECT count(*) FROM faucet_claims WHERE ip = %s AND claimed_at > %s", (ip, since)).fetchone()
    if by_ip >= F["per_ip_per_day"]:
        raise FaucetError("This connection has had its test tokens for today. Try again tomorrow.")
    (total,) = conn.execute("SELECT count(*) FROM faucet_claims WHERE claimed_at > %s", (since,)).fetchone()
    if total >= F["per_day"]:
        raise FaucetError("The faucet has given out today's test tokens. Try again tomorrow.")


def claim(conn, rpc, payer, wallet, ip, now=None):
    """Mint the wallet its test tokens, once. Returns {amount, signature}; raises FaucetError."""
    now = now or datetime.now(timezone.utc)
    ip = network(ip)
    _check(conn, wallet, ip, now)
    try:
        payer_sol = rpc.sol_balance(payer.pubkey())
    except (OSError, RuntimeError) as e:
        log.warning("faucet could not read the payer's balance: %s", e)
        raise FaucetError("Solana can't be reached right now. Try again in a minute.") from e
    if payer_sol < F["min_sol"] * chain.LAMPORTS:
        log.warning("faucet payer %s is below %s SOL", payer.pubkey(), F["min_sol"])
        raise FaucetError("The faucet is empty for now. Try again later.")
    # hold the wallet's place before sending, so two clicks at once cannot both be paid
    held = conn.execute("""INSERT INTO faucet_claims (wallet, ip, amount, claimed_at) VALUES (%s, %s, %s, %s)
                           ON CONFLICT (wallet) DO NOTHING RETURNING wallet""",
                        (wallet, ip, F["amount"], now)).fetchone()
    conn.commit()
    if held is None:
        raise FaucetError("This wallet already has its test tokens")
    mint = Pubkey.from_string(chain.mint_address())
    try:
        raw = F["amount"] * 10 ** rpc.decimals(mint)
        sig = devnet.send(rpc, devnet.mint_ixs(payer.pubkey(), mint, Pubkey.from_string(wallet), raw), payer)
    except Exception as e:
        # free the wallet to try again (a send that landed after a timeout pays twice: test tokens only)
        log.warning("faucet send to %s failed: %s", wallet, e)
        conn.execute("DELETE FROM faucet_claims WHERE wallet = %s", (wallet,))
        conn.commit()
        raise FaucetError("The test tokens couldn't be sent. Please try again in a minute.") from e
    conn.execute("UPDATE faucet_claims SET signature = %s WHERE wallet = %s", (sig, wallet))
    conn.commit()
    return {"amount": F["amount"], "signature": sig}
