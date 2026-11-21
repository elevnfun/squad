"use client";

// "Results to release": the owner's review step for the new contests. A result waits here (state
// "review") until the owner presses Release, which credits each winner: half ready to collect, half
// locked. Nothing is sent from here and a release cannot be undone, so every release goes through an
// inline confirm step. This section loads and fails on its own; the old payouts below do not depend on it.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, shortWallet, sol } from "@/lib/api";
import "./release.css";

type Kind = "blitz_matchday" | "blitz_week" | "draft_week";
type AdminContest = { id: number; kind: Kind; day: string | null; week_start: string;
  state: "open" | "live" | "review" | "final" | "rolled"; locks_at: string | null; final_at: string | null;
  pot_lamports: number; pot_sol: number };
type Prize = { wallet: string; place: number; lamports: number; sol: number };
type ReviewContest = AdminContest & { entrants: number; preview_pot_lamports: number | null; preview_pot_sol: number | null;
  preview_prizes: Prize[] | null;
  board: { place: number; wallet: string; username: string | null; points: number; captain_points: number }[] };
type AdminContests = { review: ReviewContest[]; recent: AdminContest[] };
type Released = { id: number; text: string };

const NAMES: Record<Kind, string> = { blitz_matchday: "Blitz matchday", blitz_week: "Blitz weekly", draft_week: "Draft weekly" };
const WEEKLY_USD = 500;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateWords(iso: string) {   // "2026-11-21" -> "Saturday 21 November" (a calendar date, no time zone)
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
function title(c: AdminContest) {
  return c.kind === "blitz_matchday" && c.day ? `${NAMES[c.kind]}, ${dateWords(c.day)}` : `${NAMES[c.kind]}, week of ${dateWords(c.week_start)}`;
}
function heading(c: AdminContest) {
  return c.kind === "blitz_matchday" && c.day ? `${NAMES[c.kind]} · ${dateWords(c.day)}` : `${NAMES[c.kind]} · week of ${dateWords(c.week_start)}`;
}
function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) + " UK";
}
const pts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
const validPrice = (s: string) => { const n = Number(s); return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null; };
const total = (p: Prize[] | null) => (p ?? []).reduce((s, x) => s + x.lamports, 0);   // lamports, shown with the flooring `sol`
const WEEKLY_LAMPORTS = (usd: number) => Math.round(WEEKLY_USD / usd * 1e9);

export default function Release({ token }: { token: string | null }) {
  const [data, setData] = useState<AdminContests | null>(null);
  const [fetchedFor, setFetchedFor] = useState<number | null>(null);   // the price the shown preview was computed with
  const [failed, setFailed] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [queryPrice, setQueryPrice] = useState<number | null>(null);   // debounced price sent as ?sol_usd=
  const [confirmId, setConfirmId] = useState<number | null>(null);     // only one confirm step open at a time
  const [running, setRunning] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<Record<number, string>>({});
  const [released, setReleased] = useState<Released[]>([]);
  const inFlight = useRef(new Set<number>());   // a contest is never released twice
  const seq = useRef(0);
  const priceRef = useRef<number | null>(null);
  priceRef.current = queryPrice;

  const load = useCallback(async () => {
    if (!token) return;
    const n = ++seq.current, price = priceRef.current;
    try {
      const d = await api<AdminContests>(`/admin/contests${price ? `?sol_usd=${encodeURIComponent(price)}` : ""}`, { token });
      if (n !== seq.current) return;   // an older answer
      setData(d); setFetchedFor(price); setFailed(null);
    } catch (e) {
      if (n !== seq.current) return;
      setFailed((e as Error).message || "The list could not be loaded.");
    }
  }, [token]);

  useEffect(() => { load(); }, [load, queryPrice]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const clearRefusal = (id: number) => setRefusal((r) => Object.fromEntries(Object.entries(r).filter(([k]) => Number(k) !== id)));
  const typed = (id: number, v: string) => {
    setPrices((p) => ({ ...p, [id]: v }));
    setConfirmId((c) => (c === id ? null : c));   // a changed price cancels an open confirm
    clearRefusal(id);
    const n = validPrice(v);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setQueryPrice(n), 450);
  };
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(debounce.current), []);

  async function release(c: ReviewContest) {
    if (inFlight.current.has(c.id)) return;
    inFlight.current.add(c.id);
    setRunning(c.id);
    clearRefusal(c.id);
    try {
      // the pot the owner checked: the server refuses if the pot it is about to release is different
      const body = { sol_usd: c.kind === "blitz_week" ? validPrice(prices[c.id] ?? "") : null, expect_pot_lamports: c.preview_pot_lamports };
      const res = await api<{ prizes: Prize[]; contest: AdminContest }>(`/admin/contests/${c.id}/release`, { body, token });
      const sum = total(res.prizes);
      const text = res.contest.state === "rolled" || res.prizes.length === 0
        ? `${title(c)}: pot rolled forward, nobody credited.`
        : `${title(c)}: released. ${res.prizes.length} ${res.prizes.length === 1 ? "winner" : "winners"} credited ${sol(sum)} SOL in all (half ready to collect, half locked): ${res.prizes.map((p) => `${p.place}. ${c.board.find((r) => r.wallet === p.wallet)?.username ?? shortWallet(p.wallet)} ${sol(p.lamports)} SOL`).join(", ")}.`;
      setReleased((r) => [{ id: c.id, text }, ...r]);
      setConfirmId(null);
      await load();
    } catch (e) {
      setRefusal((r) => ({ ...r, [c.id]: e instanceof ApiError && e.status === 400 ? e.message : (e as Error).message }));
      setConfirmId(null);
      inFlight.current.delete(c.id);   // refused: it may be tried again after the owner reads why
      await load();                    // a changed pot: show the new figures under the refusal
    } finally {
      setRunning(null);
    }
  }

  const busy = running !== null;
  return (
    <section className="rl" aria-labelledby="rl-h">
      <h2 id="rl-h" className="rl-h">Results to release</h2>
      <p className="rl-intro">A result waits here until you press Release. Release sends nothing: it credits each winner, half ready to collect and half locked. A release cannot be undone.</p>

      {failed && <p role="alert" className="rl-err">Results to release could not be loaded: {failed}</p>}
      {!data && !failed && <p className="rl-note" role="status">Loading results…</p>}

      {released.length > 0 && (
        <ul className="rl-done" aria-label="Released just now">
          {released.map((r) => <li key={r.id} role="status">{r.text}</li>)}
        </ul>
      )}

      {data && data.review.length === 0 && <p className="rl-note">No results are waiting for release.</p>}

      {data?.review.map((c) => {
        const weekly = c.kind === "blitz_week";
        const price = prices[c.id] ?? "";
        const p = validPrice(price);
        const under = c.entrants < 3;
        const prizes = c.preview_prizes ?? [];
        const synced = !weekly || (p !== null && fetchedFor === p);
        // an earlier result of the same mode is still waiting: this pot is only known after it is released
        const earlier = weekly ? undefined : data.review.find((o) => o.id !== c.id && o.kind === c.kind && (o.day ?? o.week_start) < (c.day ?? c.week_start));
        const ready = !earlier && c.preview_pot_lamports !== null && (!weekly || (p !== null && synced));
        const sum = total(c.preview_prizes);
        const half = Math.floor(sum / 2);
        const confirming = confirmId === c.id;
        const hid = `rl-c${c.id}`;
        return (
          <article key={c.id} className="e2-card rl-card" aria-labelledby={`${hid}-t`}>
            <header className="rl-top">
              <div>
                <h3 id={`${hid}-t`} className="rl-title">{heading(c)}</h3>
                <p className="rl-sub">{c.final_at ? `Final since ${when(c.final_at)}` : "Final"} · {c.entrants} {c.entrants === 1 ? "entrant" : "entrants"}</p>
              </div>
              <span className="e2-badge steel">In review</span>
            </header>

            <div className="rl-table" role="table" aria-label={`Top 10, ${title(c)}`}>
              <div className="rl-tr rl-th" role="row">
                <span role="columnheader">Place</span><span role="columnheader">Player</span>
                <span role="columnheader" className="n">Points</span><span role="columnheader" className="n">Captain pts</span>
              </div>
              {c.board.map((r) => (
                <div className="rl-tr" role="row" key={`${r.place}-${r.wallet}`}>
                  <span role="cell" className="pl">{r.place}</span>
                  <span role="cell" className="who" title={r.wallet}>{r.username ?? shortWallet(r.wallet)}</span>
                  <span role="cell" className="n">{pts(r.points)}</span>
                  <span role="cell" className="n">{pts(r.captain_points)}</span>
                </div>
              ))}
              {c.board.length === 0 && <p className="rl-note" style={{ padding: "12px 16px" }}>Nobody entered.</p>}
            </div>

            {weekly && (
              <div className="rl-price">
                <label htmlFor={`${hid}-p`}>SOL price in dollars</label>
                <input id={`${hid}-p`} inputMode="decimal" autoComplete="off" placeholder="for example 150" value={price}
                  onChange={(e) => typed(c.id, e.target.value)} disabled={busy} aria-describedby={`${hid}-pn`} />
                <p id={`${hid}-pn`} className="rl-sub">
                  {p !== null ? `$${WEEKLY_USD} at $${p} per SOL = ${sol(WEEKLY_LAMPORTS(p))} SOL` : "Required. The prize is $500 paid in SOL, so enter today's SOL price."}
                </p>
              </div>
            )}

            <div className="rl-prev" aria-live="polite">
              <p className="rl-eyebrow">Release will credit</p>
              {earlier ? (
                <p className="rl-note">Release {title(earlier)} first. This pot is worked out from what is left after it.</p>
              ) : under ? (
                <p className="rl-warn">Under 3 entrants: releasing rolls the pot forward and credits nobody.</p>
              ) : !synced || c.preview_prizes === null ? (
                <p className="rl-note">{weekly && p === null ? "Enter the SOL price to see the amounts." : "Working out the amounts…"}</p>
              ) : (
                <>
                  <p className="rl-pot">Pot {sol(c.preview_pot_lamports ?? sum)} SOL</p>
                  <ul className="rl-prizes">
                    {prizes.map((x) => (
                      <li key={`${x.place}-${x.wallet}`}><span>{x.place}.</span><span title={x.wallet}>{c.board.find((r) => r.wallet === x.wallet)?.username ?? shortWallet(x.wallet)}</span><b>{sol(x.lamports)} SOL</b></li>
                    ))}
                  </ul>
                  <p className="rl-sub">Each winner: half ready to collect, half locked. In all {sol(half)} SOL ready, {sol(half)} SOL locked.</p>
                </>
              )}
            </div>

            {refusal[c.id] && <p role="alert" className="rl-err">Not released: {refusal[c.id]}</p>}

            {!confirming ? (
              <div className="rl-actions">
                <button type="button" className="e2-btn e2-btn-line e2-btn-sm" disabled={busy || !ready}
                  onClick={() => { clearRefusal(c.id); setConfirmId(c.id); }}>
                  Release result<span className="e2-sr"> for {title(c)}</span>
                </button>
                {!ready && <span className="rl-sub">{earlier ? `Release ${title(earlier)} first.` : weekly && !synced ? "Enter the SOL price first." : "Working out the amounts…"}</span>}
              </div>
            ) : (
              <div className="rl-confirm" role="group" aria-label={`Confirm release of ${title(c)}`}>
                <p>
                  Release {title(c)}?{" "}
                  {under ? "The pot rolls forward and nobody is credited."
                    : `${prizes.length} ${prizes.length === 1 ? "winner is" : "winners are"} credited ${sol(sum)} SOL in all.`}
                  {weekly && p !== null && !under ? ` ($${WEEKLY_USD} at $${p} per SOL.)` : ""}{" "}
                  <b>This cannot be undone.</b>
                </p>
                <div className="rl-actions">
                  <button type="button" className="e2-btn e2-btn-gold e2-btn-sm" disabled={busy} autoFocus onClick={() => release(c)}>
                    {running === c.id ? "Releasing…" : "Yes, release"}
                  </button>
                  <button type="button" className="e2-btn e2-btn-line e2-btn-sm" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {data && (
        <div className="rl-recent">
          <h3 className="rl-title">Recently released</h3>
          {data.recent.length === 0 ? <p className="rl-note">Nothing released yet.</p> : (
            <ul>
              {data.recent.slice(0, 10).map((c) => (
                <li key={c.id}>
                  <span className="t">{heading(c)}</span>
                  <span className={`e2-badge ${c.state === "final" ? "ft" : "steel"}`}>{c.state === "final" ? "Final" : "Rolled forward"}</span>
                  <b>{sol(c.pot_lamports)} SOL</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
