"use client";

// The devnet test season: a signed-in wallet's free test $ELEVN, once (POST /api/faucet, squad/faucet.py).
// Shown only while the API offers it (me.faucet) and this wallet hasn't claimed yet. A small secondary card,
// mounted at the bottom of Today by TodayView, and only when the site is on devnet (TEST_SEASON, as the devnet bar).
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./auth";
import { TEST_SEASON } from "./TestSeason";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function FaucetCard() {
  const { me, token, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!TEST_SEASON || !me?.faucet || (me.faucet.claimed && sent === null)) return null;

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
    <article className="e2-card e2-side" aria-labelledby="t-Faucet" aria-live="polite">
      <div>
        <span className="e2-eyebrow">Devnet test tokens</span>
        {sent !== null ? (
          <>
            <h2 id="t-Faucet">{fmt(sent)} test $ELEVN are in your wallet</h2>
            <p className="e2-small e2-muted">To see them in Phantom, turn on Testnet Mode in its settings.</p>
          </>
        ) : (
          <>
            <h2 id="t-Faucet">Get {fmt(me.faucet.amount)} free test $ELEVN</h2>
            <p className="e2-small e2-muted">
              {fmt(me.requirement)} unlocks Blitz, {fmt(me.requirement * 2)} also Draft. No real value, one claim per wallet.
            </p>
            {error && <p className="e2-small" role="alert" style={{ color: "var(--danger)", marginTop: 8 }}>{error}</p>}
          </>
        )}
      </div>
      {sent === null && (
        <button type="button" className="e2-btn e2-btn-line e2-btn-sm" onClick={claim} disabled={busy}>{busy ? "Sending…" : "Get test tokens"}</button>
      )}
    </article>
  );
}
