"use client";

// The devnet test season: a signed-in wallet's free test $ELEVN, once (POST /api/faucet, squad/faucet.py).
// Shown only while the API offers it (me.faucet) and this wallet hasn't claimed yet.
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./auth";

export default function FaucetCard() {
  const { me, token, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me?.faucet || (me.faucet.claimed && sent === null)) return null;
  const squads = Math.floor(me.faucet.amount / me.requirement);

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await api<{ amount: number }>("/faucet", { method: "POST", token });
      setSent(out.amount);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-surface p-5" aria-live="polite">
      {sent !== null ? (
        <>
          <p className="font-semibold">{sent.toLocaleString("en-US")} test $ELEVN are in your wallet</p>
          <p className="mt-1 text-[14px] text-muted">Build your squad below. To see the tokens in Phantom, turn on Testnet Mode in its settings.</p>
        </>
      ) : (
        <>
          <p className="font-semibold">Get {me.faucet.amount.toLocaleString("en-US")} free test $ELEVN</p>
          <p className="mt-1 text-[14px] text-muted">
            Enough for {squads === 1 ? "one squad" : `${squads} squads`} in the test season. Devnet tokens with no real value, one claim per wallet.
          </p>
          <button onClick={claim} disabled={busy} className="btn btn-primary btn-sm mt-4">{busy ? "Sending…" : "Get test tokens"}</button>
          {error && <p className="mt-3 text-[14px] text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
