"""Devnet helpers: a test $ELEVN token and test balances. Devnet only; never mainnet.

  python -m squad.devnet setup                      create the test mint (prints SQUAD_TOKEN_MINT)
  python -m squad.devnet give --to ADDRESS --amount 300000   send test $ELEVN to any wallet
  python -m squad.devnet fees --to FEE_WALLET --sol 0.5      send devnet SOL, as fake fee income
  python -m squad.devnet status --wallet ADDRESS

The mint authority's key lives in keys/ (git-ignored) and only ever holds devnet SOL.
"""

import argparse
import base64
import json
import time
import urllib.error

from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import CreateAccountParams, TransferParams, create_account, transfer
from solders.transaction import Transaction
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.instructions import create_idempotent_associated_token_account, get_associated_token_address, initialize_mint2, mint_to
from spl.token.models import InitializeMint2Params, MintToParams

from .chain import LAMPORTS, Rpc
from .config import ROOT

KEYS = ROOT / "keys"
DEVNET = "https://api.devnet.solana.com"
DECIMALS = 6


def keypair(name):
    KEYS.mkdir(exist_ok=True)
    f = KEYS / f"{name}.json"
    if f.exists():
        return Keypair.from_bytes(bytes(json.loads(f.read_text())))
    kp = Keypair()
    f.write_text(json.dumps(list(bytes(kp))))
    f.chmod(0o600)
    return kp


def state():
    f = KEYS / "devnet.json"
    return json.loads(f.read_text()) if f.exists() else {}


def send(rpc, ixs, payer, *signers):
    bh = rpc.latest_blockhash()
    tx = Transaction.new_unsigned(Message.new_with_blockhash(ixs, payer.pubkey(), bh))
    tx.sign([payer, *signers], bh)
    sig = rpc.send(bytes(tx))
    rpc.confirm(sig)
    return sig


def fund(rpc, kp, sol=1.0):
    if rpc.sol_balance(kp.pubkey()) >= sol * LAMPORTS / 2:
        return
    try:
        sig = rpc.call("requestAirdrop", [str(kp.pubkey()), int(sol * LAMPORTS)])
        for _ in range(30):
            if rpc.sol_balance(kp.pubkey()) > 0:
                return
            time.sleep(2)
        print(f"airdrop {sig} not confirmed yet")
    except (RuntimeError, OSError):
        raise SystemExit(f"Devnet's automatic faucet is closed. Get free devnet SOL (1 is plenty) at\n"
                         f"  https://faucet.solana.com\nfor this address, then run the command again:\n  {kp.pubkey()}")


def setup(rpc):
    authority = keypair("devnet-mint-authority")
    fund(rpc, authority)
    st = state()
    if st.get("mint"):
        print(f"test mint already exists: {st['mint']}")
        return st["mint"]
    mint = keypair("devnet-mint")
    rent = rpc.call("getMinimumBalanceForRentExemption", [82])
    send(rpc, [create_account(CreateAccountParams(from_pubkey=authority.pubkey(), to_pubkey=mint.pubkey(), lamports=rent,
                                                  space=82, owner=TOKEN_PROGRAM_ID)),
               initialize_mint2(InitializeMint2Params(decimals=DECIMALS, program_id=TOKEN_PROGRAM_ID, mint=mint.pubkey(),
                                                      mint_authority=authority.pubkey()))], authority, mint)
    (KEYS / "devnet.json").write_text(json.dumps({"mint": str(mint.pubkey())}))
    print(f"test $ELEVN mint: {mint.pubkey()}\nset SQUAD_TOKEN_MINT={mint.pubkey()} for the API and the watcher")
    return str(mint.pubkey())


def mint_ixs(authority, mint, owner, raw):
    """Open the owner's token account if it has none (the authority pays its rent) and mint `raw` units into it."""
    return [create_idempotent_associated_token_account(authority, owner, mint),
            mint_to(MintToParams(program_id=TOKEN_PROGRAM_ID, mint=mint, mint_authority=authority,
                                 dest=get_associated_token_address(owner, mint), amount=int(raw)))]


def give(rpc, to, amount):
    authority, mint = keypair("devnet-mint-authority"), Pubkey.from_string(state()["mint"])
    sig = send(rpc, mint_ixs(authority.pubkey(), mint, Pubkey.from_string(to), amount * 10 ** DECIMALS), authority)
    print(f"sent {amount:,.0f} test $ELEVN to {to}: {sig}")


def fees(rpc, to, sol):
    authority = keypair("devnet-mint-authority")
    fund(rpc, authority, sol + 0.1)
    sig = send(rpc, [transfer(TransferParams(from_pubkey=authority.pubkey(), to_pubkey=Pubkey.from_string(to),
                                             lamports=int(sol * LAMPORTS)))], authority)
    print(f"sent {sol} devnet SOL to {to} as fee income: {sig}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m squad.devnet")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup")
    p = sub.add_parser("give")
    p.add_argument("--to", required=True)
    p.add_argument("--amount", type=float, required=True)
    p = sub.add_parser("fees")
    p.add_argument("--to", required=True)
    p.add_argument("--sol", type=float, required=True)
    p = sub.add_parser("status")
    p.add_argument("--wallet", required=True)
    args = ap.parse_args(argv)
    rpc = Rpc(DEVNET)
    if args.cmd == "setup":
        setup(rpc)
    elif args.cmd == "give":
        give(rpc, args.to, args.amount)
    elif args.cmd == "fees":
        fees(rpc, args.to, args.sol)
    else:
        mint = state()["mint"]
        print(f"SOL {rpc.sol_balance(args.wallet) / LAMPORTS:.4f}, test $ELEVN "
              f"{rpc.token_balance_raw(args.wallet, mint) / 10 ** DECIMALS:,.0f}")


if __name__ == "__main__":
    main()
