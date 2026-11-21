"use client";

// Today (docs/design/mockups/today.html): the matchday contest, the weekly Draft and the Shootout side game,
// each card with one state and one button, a next kick-off rail, and a Winnings strip for a signed-in wallet.
// Everything comes from GET /api/today, polled every 30 seconds while the tab is visible; countdowns tick
// once a second on the client, against the server's clock. With no answer and no data every card shows a quiet
// "nothing scheduled" state, never an error page.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { api, ApiError, Contest, ContestState, sol, Today } from "@/lib/api";

const POLL_MS = 30_000;
const GIVE_UP_MS = 6_000;

type Load = { status: "loading" | "ready" | "down"; data: Today | null; at: number | null; skew: number; stale: boolean };

function useToday(token: string | null): Load {
  const [state, setState] = useState<Load>({ status: "loading", data: null, at: null, skew: 0, stale: false });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    let data: Today | null = null;
    try {
      data = await api<Today>("/today", { token });
    } catch (e) {
      // a stale session token: ask again as a guest
      if (token && (e as ApiError).status === 401) { try { data = await api<Today>("/today"); } catch { data = null; } }
    }
    if (n !== seq.current) return;
    if (data) setState({ status: "ready", data, at: Date.now(), skew: Date.parse(data.now) - Date.now(), stale: false });
    else setState((s) => (s.data ? { ...s, stale: true } : { ...s, status: "down" }));
  }, [token]);
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    load();
    const poll = setInterval(() => { if (visible()) load(); }, POLL_MS);
    const back = () => { if (visible()) load(); };
    document.addEventListener("visibilitychange", back);
    const giveUp = setTimeout(() => setState((s) => (s.status === "loading" ? { ...s, status: "down" } : s)), GIVE_UP_MS);
    return () => { clearInterval(poll); clearTimeout(giveUp); document.removeEventListener("visibilitychange", back); };
  }, [load]);
  return state;
}

// the server's clock, ticking once a second; null until the first tick on the client
function useNow(skew: number): number | null {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => { setT(Date.now()); const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i); }, []);
  return t == null ? null : t + skew;
}

// ---- formatting (UK time, as the Blitz week and every kick-off are) ----
const two = (n: number) => String(n).padStart(2, "0");
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const ukToday = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const ukTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const count = (n: number) => n.toLocaleString("en-GB");

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  return m === 1 ? "a minute ago" : m < 60 ? `${m} minutes ago` : "over an hour ago";
}

// Barlow digits: "2D 04H 12M" from a day out, "04H 12M 09S" inside it
function Digits({ ms }: { ms: number }) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400), h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = t % 60;
  const spoken = `${d ? `${d} days ` : ""}${h} hours ${m} minutes${d ? "" : ` ${s} seconds`}`;
  return (
    <span role="timer" aria-label={spoken}>
      <span aria-hidden="true">
        {d > 0 ? <>{d}<small>D</small>{two(h)}<small>H</small>{two(m)}<small>M</small></>
          : <>{two(h)}<small>H</small>{two(m)}<small>M</small>{two(s)}<small>S</small></>}
      </span>
    </span>
  );
}

const BADGE: Record<ContestState, { cls: string; text: string }> = {
  open: { cls: "open", text: "Open" },
  live: { cls: "live", text: "Live" },
  review: { cls: "steel", text: "Result under review" },
  final: { cls: "ft", text: "Result" },
  rolled: { cls: "steel", text: "Rolled forward" },
};
const Badge = ({ state }: { state: ContestState }) => <span className={`e2-badge ${BADGE[state].cls}`}>{BADGE[state].text}</span>;

// the pot is funded at release, so before that the server sends an estimate (pot_estimated); with no figure yet, say so
const potUnset = (c: Contest) => c.pot_lamports === 0 && (c.state === "open" || c.state === "live" || c.state === "review");
const potLabel = (c: Contest | null, name: string) => (c == null ? name : c.pot_estimated && !potUnset(c) && c.state !== "final" ? "Estimated pot" : potUnset(c) ? `${name} · set at full time` : name);
const potText = (c: Contest) => (potUnset(c) ? "–" : sol(c.pot_lamports));

type Access = NonNullable<Today["access"]>;

function Hold({ need, name, access, which }: { need: number; name: string; access: Access | null; which: "blitz" | "draft" }) {
  // under the requirement, with a balance we could read: say what to hold, and what the wallet holds
  if (!access || access[which] || access.balance == null) return null;
  return (
    <div className="hold">
      <span>Hold {count(need)} $ELEVN to play{name}</span>
      <small>You hold {count(access.balance)}</small>
    </div>
  );
}

function Quiet({ name, line, more, href, label }: { name: string; line: string; more: string; href: string; label: string }) {
  return (
    <article className="e2-card e2-mode" aria-labelledby={`t-${name}`}>
      <div className="top"><h2 className="name" id={`t-${name}`}>{name}</h2></div>
      <p className="none">{line}</p>
      <p className="status" style={{ marginTop: 8 }}>{more}</p>
      <div className="foot"><span /><Link className="e2-btn e2-btn-line" href={href}>{label}</Link></div>
    </article>
  );
}

function BlitzCard({ c, loading, now, access, signedIn }: { c: Contest | null; loading: boolean; now: number | null; access: Access | null; signedIn: boolean }) {
  if (!c && !loading) return <Quiet name="Blitz" line="No matchday scheduled yet" more="Fixtures appear here as soon as a matchday is set." href="/how-to-play" label="How Blitz works" />;
  const over = c != null && c.state !== "open" && c.state !== "live";
  const kick = c?.first_kickoff ? Date.parse(c.first_kickoff) : null;
  return (
    <article className="e2-card e2-mode" aria-labelledby="t-Blitz" aria-busy={loading || undefined}>
      <div className="top">
        <div>
          <h2 className="name" id="t-Blitz">Blitz</h2>
          <p className="status">Matchday Blitz · 3 squads{c?.day ? ` · ${dayLabel(c.day)}` : ""}</p>
        </div>
        {c && <Badge state={c.state} />}
      </div>
      <div className="nums">
        <div><span className="lbl">Fixtures</span><span className="e2-big">{c ? c.fixtures : "–"}</span></div>
        <div>
          <span className="lbl">{kick != null && now != null && kick > now ? "First kick-off in" : "First kick-off"}</span>
          <span className="e2-clockbig">
            {c == null || kick == null ? "–" : now != null && kick > now ? <Digits ms={kick - now} /> : <>{ukTime(c.first_kickoff!)}</>}
          </span>
        </div>
        <div><span className="lbl">{potLabel(c, "Matchday pot")}</span><span className="e2-big">{c ? potText(c) : "–"}<small>SOL</small></span></div>
      </div>
      <div className="foot">
        {signedIn && access && !access.blitz && access.balance != null
          ? <Hold need={access.blitz_requirement} name="" access={access} which="blitz" />
          : <span className="e2-small e2-muted">Top 5 are paid</span>}
        {over
          ? <Link className="e2-btn e2-btn-line" href="/ranks">Open the board</Link>
          : <Link className={`e2-btn ${signedIn && access?.blitz !== false ? "e2-btn-gold" : "e2-btn-line"}`} href="/blitz">Pick squads</Link>}
      </div>
    </article>
  );
}

function DraftCard({ c, loading, now, access, signedIn }: { c: Contest | null; loading: boolean; now: number | null; access: Access | null; signedIn: boolean }) {
  if (!c && !loading) return <Quiet name="Draft" line="No Draft week scheduled yet" more="Opens Tuesday, locks at Friday's first kick-off." href="/how-to-play" label="How Draft works" />;
  const over = c != null && c.state !== "open" && c.state !== "live";
  const lock = c?.locks_at ? Date.parse(c.locks_at) : null;
  const open = lock != null && now != null && lock > now;
  const lockedAt = lock != null && !open
    ? `${new Date(lock).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" })} ${ukTime(c!.locks_at!)}` : null;
  return (
    <article className="e2-card e2-mode" aria-labelledby="t-Draft" aria-busy={loading || undefined}>
      <div className="top">
        <div>
          <h2 className="name" id="t-Draft">Draft</h2>
          <p className="status">Opens Tuesday · locks Friday&apos;s first kick-off · scores Friday to Monday</p>
        </div>
        {c && <Badge state={c.state} />}
      </div>
      <div className="nums">
        <div>
          <span className="lbl">{open ? "Locks in" : "Locked"}</span>
          <span className="e2-clockbig">{c == null || lock == null ? "–" : open ? <Digits ms={lock - now!} /> : lockedAt}</span>
        </div>
        <div><span className="lbl">{potLabel(c, "Weekly pot")}</span><span className="e2-big">{c ? potText(c) : "–"}<small>SOL</small></span></div>
      </div>
      <div className="foot">
        {signedIn && access && !access.draft && access.balance != null
          ? <Hold need={access.draft_requirement} name=" Draft" access={access} which="draft" />
          : <span className="e2-small e2-muted">Top 5 are paid</span>}
        {over
          ? <Link className="e2-btn e2-btn-line" href="/ranks">Open the board</Link>
          : <Link className="e2-btn e2-btn-line" href="/draft">Open Draft</Link>}
      </div>
    </article>
  );
}

export default function TodayView() {
  const { wallet, token } = useAuth();
  const signedIn = Boolean(wallet && token);
  const { status, data, at, skew, stale } = useToday(token);
  const now = useNow(skew);
  const loading = status === "loading";
  const blitz = data?.contests.find((c) => c.kind === "blitz_matchday") ?? null;
  const draft = data?.contests.find((c) => c.kind === "draft_week") ?? null;
  const access = signedIn ? data?.access ?? null : null;
  const w = signedIn ? data?.winnings ?? null : null;
  const hasWinnings = w != null && (w.ready_sol > 0 || w.locked_sol > 0);

  const kick = blitz?.first_kickoff ? Date.parse(blitz.first_kickoff) : null;
  const upcoming = kick != null && now != null && kick > now;

  const date = blitz?.day ? dayLabel(blitz.day) : now != null ? ukToday(now) : "";
  const updated = loading ? "Loading today's matches"
    : data == null ? "Can't reach elevn right now. Trying again every 30 seconds."
    : stale ? `Can't refresh right now. Showing the update from ${at && now ? ago(now - skew - at) : "a while ago"}.`
    : `Updated ${at && now ? ago(now - skew - at) : "just now"}`;

  return (
    <div className="e2-page">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="e2-ph">
        <div>
          <span className="e2-eyebrow">{date}{blitz ? " · Matchday" : ""}</span>
          <p className="e2-small e2-muted">{updated}</p>
        </div>
        <div className="w"><h1 className="e2-word">Today</h1></div>
      </div>
      <div className="e2-g" style={{ paddingBottom: 96 }}>
        <div className="e2-col" style={{ "--n": 8 } as React.CSSProperties}>
          <div className="e2-stack" style={{ "--gap": "24px" } as React.CSSProperties}>
            {hasWinnings && (
              <Link className="e2-glass e2-strip" href="/winnings">
                <span className="e2-eyebrow">Winnings</span>
                <span className="msg">
                  {w.ready_sol > 0 && <><b>{sol(w.ready_lamports)} SOL</b> ready to collect</>}
                  {w.ready_sol > 0 && w.locked_sol > 0 && " · "}
                  {w.locked_sol > 0 && <><b>{sol(w.locked_lamports)} SOL</b> locked</>}
                </span>
                {w.frozen && <span className="e2-badge frozen">Frozen</span>}
                <span className="go">Open Winnings</span>
              </Link>
            )}
            <BlitzCard c={blitz} loading={loading} now={now} access={access} signedIn={signedIn} />
            <DraftCard c={draft} loading={loading} now={now} access={access} signedIn={signedIn} />
            <article className="e2-card e2-side" aria-labelledby="t-Shootout">
              <div>
                <span className="e2-eyebrow">Side game</span>
                <h2 id="t-Shootout">Penalty Shootout</h2>
                <p className="e2-small e2-muted">10 ranked games a day · no prize</p>
              </div>
              <Link className="e2-btn e2-btn-line e2-btn-sm" href="/shootout">Play</Link>
            </article>
          </div>
        </div>
        <div className="e2-col" style={{ "--n": 4 } as React.CSSProperties}>
          <aside className="e2-glass e2-rail" aria-label="Next kick-off">
            <span className="e2-eyebrow">Next kick-off</span>
            {blitz ? (
              <>
                <p className="who e2-small">Matchday Blitz · {blitz.fixtures} {blitz.fixtures === 1 ? "fixture" : "fixtures"}</p>
                <div className={upcoming ? "e2-cd" : "e2-cd word"}>
                  {upcoming ? <Digits ms={kick! - now!} /> : blitz.state === "live" ? "Under way" : blitz.state === "open" ? "–" : "Full time"}
                </div>
                {(blitz.state === "open" || blitz.state === "live") && <p className="e2-small e2-muted">Squads lock at their own kick-off.</p>}
              </>
            ) : (
              <p className="who e2-small e2-muted" style={{ margin: "16px 0 0" }}>No matchday scheduled yet</p>
            )}
            <hr className="e2-rule" />
            <p className="e2-small e2-muted">
              Top 5 are paid, 50 / 25 / 12 / 8 / 5 percent. Results are final 15 minutes after the matchday&apos;s last match; half is
              collectable at once, the other half is locked, and 20% of it can be withdrawn every 24 hours. The $500 weekly prize runs
              Tuesday to Monday.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
