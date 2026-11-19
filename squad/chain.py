"""Solana access: JSON-RPC reads, transaction building and sending.

`Rpc` talks to a real cluster (devnet now, mainnet at launch). Tests use the same interface
over LiteSVM, an in-process Solana chain (tests/test_payouts.py). Nothing here holds a
private key: payout transactions are built unsigned and signed by the owner's wallet.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request

from solders.hash import Hash
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction, VersionedTransaction
from spl.token.constants import TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID
from spl.token.instructions import burn, get_associated_token_address
from spl.token.models import BurnParams

from .config import CFG

LAMPORTS = 1_000_000_000
TOKEN_PROGRAMS = (TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID)


def rpc_url():
    return os.environ.get("SOLANA_RPC") or CFG["access"]["solana_rpc"]


def ws_url():
    return os.environ.get("SOLANA_WS") or rpc_url().replace("https://", "wss://").replace("http://", "ws://")


def mint_address():
    return os.environ.get("SQUAD_TOKEN_MINT") or CFG["access"]["token_mint"]


def fee_wallet():
    return os.environ.get("FEE_WALLET") or CFG["fees"]["fee_wallet"]


def parse_token_account(data: bytes):
    """(mint, owner, raw amount) from SPL token account data (same layout in Token-2022)."""
    return (str(Pubkey.from_bytes(data[0:32])), str(Pubkey.from_bytes(data[32:64])),
            int.from_bytes(data[64:72], "little"))


class Rpc:
    def __init__(self, url=None):
        self.url = url or rpc_url()

    RETRIES = 6          # rate-limited (429) requests were refused, not run, so resending is safe

    def call(self, method, params):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        # public RPC endpoints refuse Python's default user agent
        req = urllib.request.Request(self.url, data=body, headers={"Content-Type": "application/json",
                                                                   "User-Agent": "squad/0.5"})
        for attempt in range(self.RETRIES + 1):
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    data = json.loads(r.read())
                break
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt == self.RETRIES:
                    raise
                wait = e.headers.get("Retry-After") if e.headers else None
                time.sleep(float(wait) if wait and wait.isdigit() else min(2 ** attempt, 20))
        if "error" in data:
            raise RuntimeError(f"Solana RPC {method}: {data['error']}")
        return data["result"]

    def sol_balance(self, pubkey):
        return self.call("getBalance", [str(pubkey), {"commitment": "confirmed"}])["value"]

    def token_balance_raw(self, owner, mint):
        """Raw amount of `mint` held by `owner` across all its token accounts."""
        total = 0
        for program in TOKEN_PROGRAMS:
            res = self.call("getTokenAccountsByOwner",
                            [str(owner), {"programId": str(program)}, {"encoding": "base64", "commitment": "confirmed"}])
            for acc in res["value"]:
                m, _, amount = parse_token_account(base64.b64decode(acc["account"]["data"][0]))
                if m == str(mint):
                    total += amount
        return total

    def decimals(self, mint):
        info = self.call("getAccountInfo", [str(mint), {"encoding": "base64"}])["value"]
        return base64.b64decode(info["data"][0])[44]

    def token_program_of(self, mint):
        return Pubkey.from_string(self.call("getAccountInfo", [str(mint), {"encoding": "base64"}])["value"]["owner"])

    def latest_blockhash(self):
        return Hash.from_string(self.call("getLatestBlockhash", [{"commitment": "confirmed"}])["value"]["blockhash"])

    def send(self, raw: bytes):
        return self.call("sendTransaction", [base64.b64encode(raw).decode(), {"encoding": "base64"}])

    def confirm(self, signature, timeout=60):
        """Wait for a signature; returns the fee paid (lamports). Raises if the transaction failed."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            st = self.call("getSignatureStatuses", [[signature], {"searchTransactionHistory": True}])["value"][0]
            if st and st.get("err"):
                raise RuntimeError(f"transaction {signature} failed: {st['err']}")
            if st and st.get("confirmationStatus") in ("confirmed", "finalized"):
                tx = self.call("getTransaction", [signature, {"commitment": "confirmed", "maxSupportedTransactionVersion": 0}])
                return tx["meta"]["fee"] if tx else 5000
            time.sleep(1.5)
        raise TimeoutError(f"transaction {signature} not confirmed in {timeout}s")


# ------------------------------------------------------------ transactions ---
def sol_transfers_tx(payer, transfers, blockhash):
    """Unsigned transaction paying SOL from `payer`: transfers = [(to, lamports)]."""
    payer = Pubkey.from_string(str(payer))
    ixs = [transfer(TransferParams(from_pubkey=payer, to_pubkey=Pubkey.from_string(str(to)), lamports=int(lamports)))
           for to, lamports in transfers]
    return Transaction.new_unsigned(Message.new_with_blockhash(ixs, payer, blockhash))


def burn_tx(owner, mint, amount, blockhash, token_program=TOKEN_PROGRAM_ID):
    """Unsigned transaction burning `amount` raw units of `mint` from the owner's token account."""
    owner, mint = Pubkey.from_string(str(owner)), Pubkey.from_string(str(mint))
    account = get_associated_token_address(owner, mint, token_program)
    ix = burn(BurnParams(program_id=token_program, account=account, mint=mint, owner=owner, amount=int(amount)))
    return Transaction.new_unsigned(Message.new_with_blockhash([ix], owner, blockhash))


def message_b64(tx):
    return base64.b64encode(bytes(tx.message)).decode()


def tx_b64(tx):
    return base64.b64encode(bytes(tx)).decode()


def load_signed(raw_b64):
    """A signed transaction from the wallet (legacy or versioned), signature checked."""
    raw = base64.b64decode(raw_b64)
    try:
        tx = Transaction.from_bytes(raw)
        tx.verify()
    except Exception:
        tx = VersionedTransaction.from_bytes(raw)
        if not tx.verify_with_results() or not all(tx.verify_with_results()):
            raise ValueError("transaction is not fully signed")
    return tx, raw


def jupiter_swap_tx(user, lamports, mint, slippage_bps=100):
    """Mainnet only: a Jupiter swap of `lamports` SOL into $ELEVN for `user` (unsigned, base64)."""
    base = os.environ.get("JUPITER_API", "https://lite-api.jup.ag/swap/v1")
    q = urllib.request.urlopen(f"{base}/quote?inputMint=So11111111111111111111111111111111111111112"
                               f"&outputMint={mint}&amount={int(lamports)}&slippageBps={slippage_bps}", timeout=20)
    quote = json.loads(q.read())
    body = json.dumps({"quoteResponse": quote, "userPublicKey": str(user), "wrapAndUnwrapSol": True}).encode()
    req = urllib.request.Request(f"{base}/swap", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())["swapTransaction"], quote


# ------------------------------------------------- winnings claims (squad/winnings.py) ---
def claim_transfer_tx(payout, player, lamports, blockhash):
    """Unsigned transaction: one SOL transfer payout -> player, the PLAYER pays the fee.
    Two required signers: the player (fee payer, first) and the payout wallet (second)."""
    payout, player = Pubkey.from_string(str(payout)), Pubkey.from_string(str(player))
    ix = transfer(TransferParams(from_pubkey=payout, to_pubkey=player, lamports=int(lamports)))
    return Transaction.new_unsigned(Message.new_with_blockhash([ix], player, blockhash))


def _signature_status(self, signature):
    """'confirmed', 'failed' or None (unknown / not yet seen) for a transaction signature."""
    st = self.call("getSignatureStatuses", [[signature], {"searchTransactionHistory": True}])["value"][0]
    if not st:
        return None
    if st.get("err"):
        return "failed"
    return "confirmed" if st.get("confirmationStatus") in ("confirmed", "finalized") else None


Rpc.signature_status = _signature_status
