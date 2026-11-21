// The claim flow for Collect and Withdraw: prepare on the server, the player's wallet signs (it does not send),
// the server adds the payout wallet's signature and sends. See squad/winnings.py (prepare, submit).
import { Transaction } from "@solana/web3.js";
import { api, ApiError } from "@/lib/api";

export type Prepared = { event_id: number; kind: "collect" | "withdraw"; lamports: number; transaction: string; message: string };
export type Submitted = { status: "confirmed" | "confirming"; signature: string; lamports: number; event_id: number };
export type Signer = (tx: Transaction) => Promise<Transaction>;

// Thrown when the player turns the signature down in their wallet.
export class Cancelled extends Error {}
// Thrown when the wallet cannot sign at all (or failed for another reason); `message` is safe to show.
export class CannotSign extends Error {}

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

export async function claim(kind: "collect" | "withdraw", token: string, signTransaction: Signer | undefined): Promise<Submitted> {
  if (!signTransaction) throw new CannotSign("This wallet can't sign transactions. Try Phantom or Solflare.");
  const p = await api<Prepared>(`/winnings/${kind}/prepare`, { method: "POST", token });
  let signed: Transaction;
  try {
    signed = await signTransaction(Transaction.from(fromB64(p.transaction)));
  } catch (e) {
    const text = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`;
    if (/reject|cancel|denied|declin|closed|user/i.test(text)) throw new Cancelled();
    throw new CannotSign("Your wallet could not sign this transaction.");
  }
  // the payout wallet's signature is added by the server
  const transaction = toB64(signed.serialize({ requireAllSignatures: false, verifySignatures: false }));
  try {
    const out = await api<Omit<Submitted, "event_id">>("/winnings/submit", { body: { event_id: p.event_id, transaction }, token });
    return { ...out, event_id: p.event_id };
  } catch (e) {
    // no answer, or a server error: the claim may have gone through, so do not suggest trying again
    if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
      throw new Error("We could not confirm this claim yet. Do not start another. This page updates when it settles.");
    }
    throw e;
  }
}
