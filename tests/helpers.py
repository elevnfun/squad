"""Shared test helpers: an in-process Solana chain (LiteSVM) behind the chain.Rpc interface, test mints and
token gifts, and a signer for the unsigned payout transactions."""

import base64

from solders.keypair import Keypair
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.system_program import CreateAccountParams, create_account
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.instructions import create_associated_token_account, get_associated_token_address, initialize_mint2, mint_to
from spl.token.models import InitializeMint2Params, MintToParams

from squad import chain

SOL = chain.LAMPORTS


class LocalChain:
    """The chain.Rpc interface over LiteSVM, an in-process Solana chain."""

    def __init__(self):
        self.svm = LiteSVM()

    def sol_balance(self, pubkey):
        return self.svm.get_balance(chain.Pubkey.from_string(str(pubkey))) or 0

    def token_balance_raw(self, owner, mint):
        ata = get_associated_token_address(chain.Pubkey.from_string(str(owner)), chain.Pubkey.from_string(str(mint)))
        acc = self.svm.get_account(ata)
        return chain.parse_token_account(bytes(acc.data))[2] if acc else 0

    def decimals(self, mint):
        return bytes(self.svm.get_account(chain.Pubkey.from_string(str(mint))).data)[44]

    def token_program_of(self, mint):
        return TOKEN_PROGRAM_ID

    def latest_blockhash(self):
        return self.svm.latest_blockhash()

    def send(self, raw):
        tx = Transaction.from_bytes(raw)
        res = self.svm.send_transaction(tx)
        if isinstance(res, FailedTransactionMetadata):
            raise RuntimeError(str(res.err()))
        return str(tx.signatures[0])

    def confirm(self, signature, timeout=60):
        return 5000

    def run(self, ixs, payer, *signers):
        tx = Transaction.new_unsigned(Message.new_with_blockhash(ixs, payer.pubkey(), self.svm.latest_blockhash()))
        tx.sign([payer, *signers], self.svm.latest_blockhash())
        assert not isinstance(self.svm.send_transaction(tx), FailedTransactionMetadata)


def make_mint(local, authority, decimals=6):
    mint = Keypair()
    rent = local.svm.minimum_balance_for_rent_exemption(82)
    local.run([create_account(CreateAccountParams(from_pubkey=authority.pubkey(), to_pubkey=mint.pubkey(), lamports=rent,
                                                  space=82, owner=TOKEN_PROGRAM_ID)),
               initialize_mint2(InitializeMint2Params(decimals=decimals, program_id=TOKEN_PROGRAM_ID, mint=mint.pubkey(),
                                                      mint_authority=authority.pubkey()))], authority, mint)
    return mint.pubkey()


def give_tokens(local, authority, mint, owner, whole):
    local.run([create_associated_token_account(authority.pubkey(), owner, mint),
               mint_to(MintToParams(program_id=TOKEN_PROGRAM_ID, mint=mint, mint_authority=authority.pubkey(),
                                    dest=get_associated_token_address(owner, mint), amount=whole * 10 ** 6))], authority)


def sign_all(txs, keypair, blockhash):
    out = []
    for t in txs:
        tx = Transaction.from_bytes(base64.b64decode(t["tx"]))
        tx.sign([keypair], blockhash)
        out.append({"idx": t["idx"], "tx": base64.b64encode(bytes(tx)).decode()})
    return out
