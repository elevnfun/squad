"use client";

// Winnings (docs/design/mockups/winnings.html): where a player collects prizes. Real money moves here, so every
// state is spelled out. GET /api/winnings with the session token, polled every 30 seconds (every 5 while a claim is
// waiting on the network). Collect and Withdraw run the two-step claim in claim.ts; the wallet signs, never sends.
// The countdown ticks on the client from seconds_to_withdraw and holds still while the balance is frozen.
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { api, ApiError, sol, Winnings, WinningsEvent } from "@/lib/api";
import { Cancelled, claim } from "./claim";
import "./winnings.css";

const SLOW_MS = 30_000;
const FAST_MS = 5_000;
const LAMPORTS = 1_000_000_000;
// the cluster follows the RPC the site is built with, as TestSeason.tsx does; mainnet links carry no cluster
const EXPLORER = `https://explorer.solana.com/tx/%s${(process.env.NEXT_PUBLIC_SOLANA_RPC ?? "").includes("mainnet") ? "" : "?cluster=devnet"}`;
const BUY_URL = process.env.NEXT_PUBLIC_ELEVN_BUY_URL ?? "https://jup.ag";

// ---- formatting: SOL only, never a dollar value ----
const solOf = (n: number) => sol(Math.round(n * LAMPORTS));
const two = (n: number) => String(n).padStart(2, "0");
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const count = (n: number) => n.toLocaleString("en-GB");

const SOURCE = { blitz_matchday: "Blitz matchday", blitz_week: "Blitz weekly", draft_week: "Draft weekly" } as const;

type Load = { status: "loading" | "ready" | "down" | "signedout"; data: Winnings | null; at: number; stale: boolean };

function useWinnings(token: string | null, fast: boolean) {
  const [state, setState] = useState<Load>({ status: "loading", data: null, at: 0, stale: false });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!token) return;
    const n = ++seq.current;
    try {
      const data = await api<Winnings>("/winnings", { token });
      if (n === seq.current) setState({ status: "ready", data, at: Date.now(), stale: false });
    } catch (e) {
      if (n !== seq.current) return;
      if ((e as ApiError).status === 401) setState({ status: "signedout", data: null, at: 0, stale: false });
      else setState((s) => (s.data ? { ...s, stale: true } : { ...s, status: "down" }));
    }
  }, [token]);
  useEffect(() => {
    if (!token) { seq.current++; setState({ status: "loading", data: null, at: 0, stale: false }); return; }
    const visible = () => document.visibilityState === "visible";
    load();
    const poll = setInterval(() => { if (visible()) load(); }, fast ? FAST_MS : SLOW_MS);
    const back = () => { if (visible()) load(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", back); };
  }, [token, load, fast]);
  return { ...state, load };
}

function useNow(): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i); }, []);
  return t;
}

const Frost = () => (
  <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M0-7V7M-6.06-3.5L6.06 3.5M-6.06 3.5L6.06-3.5M-2-5.6L0-4l2-1.6M-2 5.6L0 4l2 1.6" />
  </svg>
);

function Clock({ seconds, paused }: { seconds: number; paused?: boolean }) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  const spoken = `${h} hours ${m} minutes${paused ? "" : ` ${s} seconds`}${paused ? ", paused" : ""}`;
  return (
    <div className={`wn-cd${paused ? " paused" : ""}`} role="timer" aria-label={spoken}>
      <span aria-hidden="true">{h}<small>H</small>{two(m)}<small>M</small>{paused ? null : <>{two(s)}<small>S</small></>}</span>
    </div>
  );
}

const Paused = () => <span className="wn-paused"><span className="pz" aria-hidden="true"><i /><i /></span>Paused</span>;
const Amount = ({ text, zero }: { text: string; zero?: boolean }) => <p className={`wn-amt${zero ? " zero" : ""}`}>{text}<span className="u">SOL</span></p>;

function How({ requirement }: { requirement: number }) {
  return (
    <div>
      <h2 className="e2-eyebrow wn-h">How it works</h2>
      <ol className="wn-how">
        <li><span>Half of each prize you collect at once. The other half goes into Locked.</span></li>
        <li><span>Every 24 hours you can withdraw 20% of what is in Locked right then. Skipped days do not add up.</span></li>
        <li><span>The timer starts at your first collect and restarts at each withdrawal. If your wallet holds less than {count(requirement)} $ELEVN, Locked and the timer pause. Nothing is forfeited.</span></li>
      </ol>
      <p className="e2-small e2-steel2" style={{ marginTop: 12 }}>At launch each result is reviewed before it is released.</p>
    </div>
  );
}

const STATUS_BADGE = { pending: "Pending", failed: "Cancelled" } as const;

function Row({ e }: { e: WinningsEvent }) {
  const source = e.contest ? SOURCE[e.contest.kind] : null;
  const done = e.status === "confirmed";
  const label = e.kind === "credit" ? "Won" : e.kind === "collect" ? (done ? "Collected" : "Collect") : (done ? "Withdrawn" : "Withdraw");
  const amount = e.kind === "credit" ? e.ready_sol + e.locked_sol : e.kind === "collect" ? -e.ready_sol : -e.locked_sol;
  const title = e.kind === "credit" ? `${source ?? "Prize"} win` : e.kind === "collect" ? "Ready winnings to your wallet" : "20% of Locked to your wallet";
  const note = e.status === "failed" ? "Nothing was sent. The amount is back where it was."
    : e.status === "pending" ? (e.signature ? "Waiting for the network to confirm" : "Waiting for your signature")
    : e.kind === "credit" ? "Result final. Half ready, half in Locked" : null;
  return (
    <li className={`wn-row${e.status === "failed" ? " failed" : ""}`}>
      <span className="d">{dayOf(e.created_at)}</span>
      <span className="b">
        <span className="e2-badge steel">{label}</span>
        {e.status !== "confirmed" && <span className="e2-badge ft">{STATUS_BADGE[e.status]}</span>}
      </span>
      <span className="dt">
        {title}
        {note && <small>{note}</small>}
        {e.signature && e.status === "confirmed" && e.kind !== "credit" && (
          <small><a className="wn-tx" href={EXPLORER.replace("%s", e.signature)} target="_blank" rel="noopener noreferrer">View on Solana Explorer</a></small>
        )}
      </span>
      <span className="am">{solOf(amount)} SOL</span>
    </li>
  );
}

type Note = { tone: "ok" | "wait" | "bad"; text: string };

export default function WinningsView() {
  const { wallet, token, signIn } = useAuth();
  const { signTransaction } = useWallet();
  const signedIn = Boolean(wallet && token);
  const [busy, setBusy] = useState<"collect" | "withdraw" | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);   // a submitted claim the network has not settled yet
  const [note, setNote] = useState<Note | null>(null);
  const busyRef = useRef(false);

  const hasPending = (d: Winnings | null) => Boolean(d?.history.some((h) => h.status === "pending" && h.kind !== "credit"));
  const [fast, setFast] = useState(false);
  const { status, data, at, stale, load } = useWinnings(signedIn ? token : null, fast);
  useEffect(() => { setFast(waiting != null || hasPending(data)); }, [waiting, data]);

  // a submitted claim is done once its event is no longer pending
  useEffect(() => {
    if (waiting == null || !data) return;
    const ev = data.history.find((h) => h.id === waiting);
    if (!ev || ev.status === "pending") return;
    setWaiting(null);
    setNote(ev.status === "confirmed"
      ? { tone: "ok", text: `Confirmed. ${solOf(ev.kind === "collect" ? -ev.ready_sol : -ev.locked_sol)} SOL is in your wallet.` }
      : { tone: "bad", text: "The network did not complete this claim. Nothing was sent and your balance is unchanged." });
  }, [waiting, data]);

  const now = useNow();
  const w = data;
  const frozen = Boolean(w?.frozen);
  const seconds = w?.seconds_to_withdraw == null ? null : frozen ? w.seconds_to_withdraw : Math.max(0, w.seconds_to_withdraw - Math.floor((now - at) / 1000));
  // when the timer runs out, ask the server so Withdraw opens without waiting for the next poll
  const expired = !frozen && w?.seconds_to_withdraw != null && w.seconds_to_withdraw > 0 && seconds === 0;
  useEffect(() => { if (expired) load(); }, [expired, load]);

  const run = async (kind: "collect" | "withdraw") => {
    if (busyRef.current || !token) return;
    busyRef.current = true; setBusy(kind); setNote(null);
    try {
      const out = await claim(kind, token, signTransaction);
      const paid = solOf(out.lamports / LAMPORTS);
      if (out.status === "confirmed") setNote({ tone: "ok", text: `Confirmed. ${paid} SOL is in your wallet.` });
      else {
        setNote({ tone: "wait", text: "Sent. Waiting for the network to confirm." });
        setWaiting(out.event_id);
      }
    } catch (e) {
      if (e instanceof Cancelled) setNote({ tone: "bad", text: "Cancelled. Nothing was sent. The claim frees itself within 5 minutes, then you can try again." });
      else setNote({ tone: "bad", text: (e as Error).message });
    } finally {
      busyRef.current = false; setBusy(null); load();
    }
  };

  const down = status === "down";
  const loading = signedIn && status === "loading";
  const working = busy != null || waiting != null;
  // a claim the server is holding (for example after a cancelled signature, up to 5 minutes)
  const held = w?.history.find((h) => h.status === "pending" && h.kind !== "credit") ?? null;
  const heldSol = held ? solOf(Math.abs(held.kind === "collect" ? held.ready_sol : held.locked_sol)) : "";
  const requirement = w?.requirement ?? 150_000;
  const everything = w != null && (w.history.length > 0 || w.ready_lamports > 0 || w.locked_lamports > 0);

  // the one gold button: Get $ELEVN when frozen, else Collect, else Withdraw
  const goldCollect = !frozen && Boolean(w?.can_collect);
  const goldWithdraw = !frozen && !w?.can_collect && Boolean(w?.can_withdraw);
  const collectOff = !w?.can_collect || working;
  const withdrawOff = !w?.can_withdraw || working;
  const opensIn = seconds != null && seconds > 0 && !frozen ? `Withdraw 20% opens in ${Math.floor(seconds / 3600)}h ${two(Math.floor(seconds / 60) % 60)}m.` : null;
  const hint = busy ? "Waiting for your wallet. Check its pop-up." : waiting != null ? "Waiting for the network to confirm."
    : down && !w ? ""
    : !w ? "" : held ? "A claim is in progress. This page updates when it settles."
    : frozen ? `Withdraw is off while the wallet is below ${count(requirement)} $ELEVN.${w.can_collect ? " Collect still works." : ""}`
    : w.can_collect ? (w.can_withdraw ? "Your wallet asks you to sign each claim. You pay the small network fee." : `Your wallet will ask you to sign. You pay the small network fee.${w.withdraw_reason ? ` ${w.withdraw_reason}` : ""}`)
    : w.can_withdraw ? "One withdrawal every 24 hours. Your wallet will ask you to sign."
    : !everything ? "Nothing to collect or withdraw yet."
    : opensIn ?? w.withdraw_reason ?? w.collect_reason ?? "";

  const updated = !signedIn ? "" : loading ? "Loading your winnings" : down ? "Can't reach elevn right now. Trying again every 30 seconds."
    : stale ? "Can't refresh right now. Showing the last update." : "";

  return (
    <div className="e2-page wn">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="e2-ph">
        <div>
          <span className="e2-eyebrow">Your wallet</span>
          <p className="wn-lead">
            Results are final 15 minutes after the last match of the day (weekly prizes: after the week&apos;s last matchday).
            You press Collect and your wallet signs the transaction.
          </p>
        </div>
        <div className="w"><h1 className="e2-word">Winnings</h1></div>
      </div>

      <div className="e2-glass wn-panel" aria-busy={loading || undefined}>
        {!signedIn || status === "signedout" ? (
          <div className="wn-guest">
            <div>
              <h2 className="wn-guest-t">{status === "signedout" ? "Your session ended" : "Connect a wallet to see your winnings"}</h2>
              <p className="wn-sub">
                {status === "signedout" ? "Sign in again to see what you have won and collect it."
                  : "You can browse the whole site without a wallet. Prizes you win are tied to your wallet, so they appear here once you connect."}
              </p>
            </div>
            <button type="button" className="e2-btn e2-btn-line" onClick={() => signIn()}>Connect wallet</button>
          </div>
        ) : (
          <>
            {frozen && (
              <div className="wn-frozenbar" role="status">
                <span className="e2-badge frozen">Frozen</span>
                <p>Your wallet holds less than {count(requirement)} $ELEVN. Locked and its timer are paused until it holds {count(requirement)} again. Nothing is forfeited.</p>
                <a className="e2-btn e2-btn-gold" href={BUY_URL} target="_blank" rel="noopener noreferrer">Get $ELEVN</a>
              </div>
            )}
            <div className="wn-figs">
              <div className="wn-fig">
                <span className="wn-lbl">Ready to collect</span>
                <Amount text={w ? sol(w.ready_lamports) : "–"} zero={!w || w.ready_lamports === 0} />
                <p className="wn-sub">
                  {!w ? (down ? "Not available right now." : "Loading.")
                    : held?.kind === "collect" ? `${heldSol} SOL is held for a claim in progress. It comes back here within 5 minutes if it is not signed.`
                    : w.ready_lamports > 0 ? "Half of your winnings, ready now. Your wallet will ask you to sign."
                    : everything ? "Nothing waiting. New wins appear here." : "Prizes you win appear here once results are final."}
                </p>
              </div>
              <div className={`wn-fig${frozen ? " paused" : ""}`}>
                <span className="wn-lbl">Locked{frozen && <Paused />}</span>
                <Amount text={w ? sol(w.locked_lamports) : "–"} zero={!w || w.locked_lamports === 0} />
                <p className="wn-sub">
                  {held?.kind === "withdraw" ? `${heldSol} SOL is held for a claim in progress. It comes back here within 5 minutes if it is not signed.`
                    : frozen ? "Held safe and not unlocking while frozen."
                    : w && w.locked_lamports > 0 ? "The other half of your winnings. You can withdraw 20% of it every 24 hours."
                    : "Half of each prize waits here. You can withdraw 20% of it every 24 hours."}
                </p>
              </div>
              <div className={`wn-fig${frozen ? " paused" : ""}`}>
                <span className="wn-lbl">Next withdrawal{frozen && w?.first_collect_at && <Paused />}</span>
                {!w ? <p className="wn-state">–</p>
                  : w.first_collect_at == null || seconds == null ? (
                    <>
                      <p className="wn-state steel">Not started</p>
                      <p className="wn-sub">The 24-hour timer starts the first time you collect.</p>
                    </>
                  ) : frozen ? (
                    <>
                      <Clock seconds={seconds} paused />
                      <p className="wn-sub">Frozen at {Math.floor(seconds / 3600)}h {two(Math.floor(seconds / 60) % 60)}m. It carries on from here once you hold {count(requirement)} $ELEVN again.</p>
                    </>
                  ) : seconds > 0 ? (
                    <>
                      <Amount text={sol(Math.floor(w.locked_lamports / 5))} zero={w.locked_lamports === 0} />
                      <Clock seconds={seconds} />
                      <p className="wn-sub">20% of {sol(w.locked_lamports)} SOL. A new win adds to Locked and raises it.</p>
                    </>
                  ) : (
                    <>
                      <Amount text={sol(Math.floor(w.locked_lamports / 5))} zero={w.locked_lamports === 0} />
                      <p className="wn-state sm">{w.can_withdraw ? "Available now" : "Timer finished"}</p>
                      <p className="wn-sub">{w.can_withdraw ? "20% of what is locked right now. Days you skip do not add up." : w.withdraw_reason ?? ""}</p>
                    </>
                  )}
              </div>
            </div>
            <div className="wn-bar">
              <button type="button" className={`e2-btn ${goldCollect ? "e2-btn-gold" : "e2-btn-line"}`} disabled={collectOff} onClick={() => run("collect")}>
                {busy === "collect" ? "Waiting for your wallet" : "Collect"}
              </button>
              <button type="button" className={`e2-btn ${goldWithdraw ? "e2-btn-gold" : "e2-btn-line"}`} disabled={withdrawOff} onClick={() => run("withdraw")}>
                {frozen && <Frost />}{busy === "withdraw" ? "Waiting for your wallet" : frozen ? "Frozen" : "Withdraw 20%"}
              </button>
              <span className="wn-hint">{hint}</span>
            </div>
          </>
        )}
        <div className="wn-status" role="status" aria-live="polite">
          {note && <p className={`wn-note ${note.tone}`}>{note.text}</p>}
          {!note && updated && <p className="wn-note wait">{updated}</p>}
        </div>

        <div className="wn-cols">
          <How requirement={requirement} />
          <div>
            <h2 className="e2-eyebrow wn-h">History</h2>
            {w && w.history.length > 0 ? (
              <ul className="wn-hist">{w.history.map((e) => <Row key={e.id} e={e} />)}</ul>
            ) : (
              <>
                <p className="wn-empty">{!signedIn || status === "signedout" ? "Nothing here yet. Prizes from Blitz and Draft will be listed here." : loading ? "Loading." : down ? "History will show when elevn can be reached." : "Nothing won yet. Prizes from Blitz and Draft will be listed here."}</p>
                <div style={{ marginTop: 12 }}><Link className="e2-btn e2-btn-line e2-btn-sm" href="/blitz">Pick your squads</Link></div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
