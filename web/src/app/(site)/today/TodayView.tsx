"use client";

// Today (docs/design/mockups/today.html): the matchday contest, the weekly Draft and the Shootout side game,
// each card with one state and one button, a next kick-off rail, and a Winnings strip for a signed-in wallet.
// Everything comes from GET /api/today, polled every 30 seconds while the tab is visible; countdowns tick
// once a second on the client, against the server's clock. With no answer and no data every card shows a quiet
// "nothing scheduled" state, never an error page.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import {
  api, ApiError, Board, BlitzDay, BlitzMineFull, Contest, ContestState, DraftMineFull, fetchBlitzDay, fetchBlitzMineFull, fetchDraftMine, sol, Today,
} from "@/lib/api";

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

// ---- the Blitz card: one state, one button, from GET /api/blitz/{day} (+ /mine and the board when signed in) ----
type Live = { day: BlitzDay; mine: BlitzMineFull | null; fifth: number | null };

// refetched whenever /today is (every 30 seconds); null while loading or when the answer cannot be had, so the card
// falls back to the plain one rather than showing a wrong state
function useBlitzLive(c: Contest | null, token: string | null, at: number | null): Live | null {
  const [live, setLive] = useState<{ key: string; v: Live } | null>(null);
  const day = c?.day ?? null, id = c?.id ?? null;
  const key = `${day}:${token ?? ""}`;
  useEffect(() => {
    if (!day || id == null) return;
    let dead = false;
    (async () => {
      const asGuest = async <T,>(fn: (t: string | null) => Promise<T>): Promise<T | null> => {
        try { return await fn(token); } catch (e) {
          if (token && (e as ApiError).status === 401) { try { return await fn(null); } catch { return null; } }
          return null;
        }
      };
      const [d, mine, board] = await Promise.all([
        asGuest((t) => fetchBlitzDay(day, t)),
        token ? asGuest((t) => (t ? fetchBlitzMineFull(day, t) : Promise.reject(new ApiError(401, "")))) : Promise.resolve(null),
        asGuest((t) => api<Board>(`/contests/${id}/board?limit=5`, { token: t })),
      ]);
      if (dead || !d) return;
      const fifth = board?.rows[4]?.points ?? null;
      setLive({ key, v: { day: d, mine: token ? mine : null, fifth } });
    })();
    return () => { dead = true; };
  }, [day, id, token, at, key]);
  return live && live.key === key ? live.v : null;
}

const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const ord = (n: number) => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`; };

function BlitzCard({ c, loading, now, access, signedIn, live }: { c: Contest | null; loading: boolean; now: number | null; access: Access | null; signedIn: boolean; live: Live | null }) {
  if (!c && !loading) return <Quiet name="Blitz" line="No matchday scheduled yet" more="Fixtures appear here as soon as a matchday is set." href="/how-to-play" label="How Blitz works" />;
  const closed = c != null && (c.state === "final" || c.state === "rolled");
  const review = c?.state === "review";
  const over = closed || review;
  const kick = c?.first_kickoff ? Date.parse(c.first_kickoff) : null;

  // squads, from the answer for a signed-in wallet (a guest has none: nothing is saved for a guest)
  const squads = signedIn ? live?.mine?.squads ?? live?.day.mine?.squads ?? [] : [];
  const allowed = live?.day.squads_allowed ?? 3;
  const started = squads.filter((q) => q.state !== "open");
  const banked = squads.filter((q) => q.state === "banked");
  const fixtures = live?.day.fixtures ?? [];
  const nextKick = fixtures.map((f) => Date.parse(f.kickoff)).filter((t) => now != null && t > now).sort((a, b) => a - b)[0] ?? null;
  const anyPickable = fixtures.some((f) => f.can_pick && (now == null || Date.parse(f.kickoff) > now));
  const mine = live?.mine ?? null;
  const running = !over && started.length > 0;
  const state: "pick" | "set" | "running" | "closed" | "plain" =
    !live ? "plain" : over && squads.length === 0 ? "plain" : over ? "closed" : running ? "running" : squads.length > 0 ? "set" : "pick";

  const pot = (
    <div><span className="lbl">{potLabel(c, "Matchday pot")}</span><span className="e2-big">{c && potUnset(c) ? <span className="e2-small">Set at full time</span> : <>{c ? potText(c) : "–"}<small>SOL</small></>}</span></div>
  );
  const nextBox = (
    <div>
      <span className="lbl">{nextKick != null ? "Next kick-off in" : "Next kick-off"}</span>
      <span className="e2-clockbig">{nextKick != null && now != null ? <Digits ms={nextKick - now} /> : "–"}</span>
    </div>
  );

  let nums: React.ReactNode, note: React.ReactNode = <span className="e2-small e2-muted">Top 5 are paid</span>;
  let button: React.ReactNode = <Link className={`e2-btn ${signedIn && access?.blitz !== false ? "e2-btn-gold" : "e2-btn-line"}`} href="/blitz">Play</Link>;

  if (state === "pick") {
    nums = <><div><span className="lbl">Squads</span><span className="e2-big">{allowed}<small>to pick</small></span></div>{nextBox}{pot}</>;
    if (!anyPickable) {
      nums = <><div><span className="lbl">Squads</span><span className="e2-big">None</span></div><div><span className="lbl">Fixtures</span><span className="e2-big">All kicked off</span></div>{pot}</>;
      button = <Link className="e2-btn e2-btn-line" href="/ranks">Open the board</Link>;
    }
  } else if (state === "set") {
    nums = <><div><span className="lbl">Squads</span><span className="e2-big">{squads.length} of {allowed}<small>set</small></span></div>{nextBox}{pot}</>;
  } else if (state === "running" || state === "closed") {
    const total = mine?.total ?? live?.day.mine?.total ?? 0;
    const place = mine?.place ?? null;
    let third: React.ReactNode;
    if (state === "closed") {
      third = <><span className="lbl">{c?.state === "rolled" ? "Pot" : closed ? "Prize won" : "Prize if released"}</span><span className="e2-big">{c?.state === "rolled" ? <span className="e2-small">Rolled forward</span> : mine && mine.prize_lamports > 0 ? <>{sol(mine.prize_lamports)}<small>SOL</small></> : <span className="e2-small">Nothing this time</span>}</span></>;
    } else if (place == null) {
      third = <><span className="lbl">Prizes</span><span className="e2-big"><span className="e2-small">Top 5 are paid</span></span></>;
    } else if (mine && mine.entrants < 3) {
      third = <><span className="lbl">Prizes</span><span className="e2-big"><span className="e2-small">Needs 3 players</span></span></>;
    } else if (place <= 5) {
      third = <><span className="lbl">Prizes</span><span className="e2-big"><span className="e2-small">In the prizes</span></span></>;
    } else {
      const gap = live?.fifth != null ? live.fifth - total : null;
      third = <><span className="lbl">Prizes</span><span className="e2-big">{gap != null ? <>{pts(Math.max(0, gap))}<small>pts to 5th</small></> : <span className="e2-small">Not yet</span>}</span></>;
    }
    nums = <>
      <div><span className="lbl">{closed ? "Final total" : "Matchday total"}</span><span className="e2-big">{pts(total)}<small>pts</small></span></div>
      <div><span className="lbl">{closed ? "Final place" : "Place"}</span><span className="e2-big">{place != null ? <>{ord(place)}<small>{mine && mine.entrants ? `of ${mine.entrants}` : ""}</small></> : "–"}</span></div>
      <div>{third}</div>
    </>;
    if (state === "closed") {
      note = <span className="e2-small e2-muted">{review ? "Result being checked" : c?.state === "rolled" ? "Fewer than 3 played" : c?.state === "final" && (mine?.prize_lamports ?? 0) > 0 ? "Collect it on Winnings" : "Final result"}</span>;
      button = <Link className="e2-btn e2-btn-line" href="/ranks">Result</Link>;
    } else {
      const last = banked[banked.length - 1];
      if (last && live) note = <Link style={{ color: "var(--text)", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3 }} href={`/blitz/banked?day=${live.day.contest?.day ?? c?.day}&slot=${last.slot}`}>{`Squad ${last.slot} banked: open it`}</Link>;
      else note = <span className="e2-small e2-muted">{`${started.length} of ${squads.length} squads under way`}</span>;
      button = <Link className="e2-btn e2-btn-line" href="/blitz">Live</Link>;
    }
  } else {
    nums = <>
      <div><span className="lbl">Fixtures</span><span className="e2-big">{c ? c.fixtures : "–"}</span></div>
      <div>
        <span className="lbl">{kick != null && now != null && kick > now ? "First kick-off in" : "First kick-off"}</span>
        <span className="e2-clockbig">{c == null || kick == null ? "–" : now != null && kick > now ? <Digits ms={kick - now} /> : <>{ukTime(c.first_kickoff!)}</>}</span>
      </div>
      {pot}
    </>;
    if (over) button = <Link className="e2-btn e2-btn-line" href="/ranks">Open the board</Link>;
    else button = <Link className={`e2-btn ${signedIn && access?.blitz !== false ? "e2-btn-gold" : "e2-btn-line"}`} href="/blitz">Play</Link>;
  }
  if (!signedIn && !over) {
    nums = <p className="none">Build three squads on any three of this matchday&apos;s matches. You can try it now; connect a wallet to save them.</p>;
    button = <Link className="e2-btn e2-btn-line" href="/blitz">Try Blitz</Link>;
  }
  return (
    <article className="e2-card e2-mode" aria-labelledby="t-Blitz" aria-busy={loading || undefined} data-state={state}>
      <div className="top">
        <div>
          <h2 className="name" id="t-Blitz">Blitz</h2>
          <p className="status">Matchday Blitz · {allowed} squads{c?.day ? ` · ${dayLabel(c.day)}` : ""}</p>
        </div>
        {c && <Badge state={c.state} />}
      </div>
      {!signedIn && !over ? nums : <div className="nums">{nums}</div>}
      <div className="foot">
        {signedIn && access && !access.blitz && access.balance != null && !over
          ? <Hold need={access.blitz_requirement} name="" access={access} which="blitz" />
          : note}
        {button}
      </div>
    </article>
  );
}

// ---- the Draft card: one state, one button, from GET /api/draft/{week}/mine (signed in only: a guest has nothing saved) ----
type DraftLive = { mine: DraftMineFull; fifth: number | null };
const DRAFT_PACKS = 5;

function useDraftLive(c: Contest | null, token: string | null, at: number | null): DraftLive | null {
  const [live, setLive] = useState<{ key: string; v: DraftLive } | null>(null);
  const week = c?.week_start ?? null, id = c?.id ?? null;
  const key = `${week}:${token ?? ""}`;
  useEffect(() => {
    if (!week || id == null || !token) return;
    let dead = false;
    (async () => {
      const [mine, board] = await Promise.all([
        fetchDraftMine(week, token).catch(() => null),
        api<Board>(`/contests/${id}/board?limit=5`, { token }).catch(() => null),
      ]);
      if (dead || !mine) return;
      setLive({ key, v: { mine, fifth: board?.rows[4]?.points ?? null } });
    })();
    return () => { dead = true; };
  }, [week, id, token, at, key]);
  return live && live.key === key ? live.v : null;
}

function DraftCard({ c, loading, now, access, signedIn, live }: { c: Contest | null; loading: boolean; now: number | null; access: Access | null; signedIn: boolean; live: DraftLive | null }) {
  if (!c && !loading) return <Quiet name="Draft" line="No Draft week scheduled yet" more="Opens Tuesday, locks at Friday's first kick-off." href="/how-to-play" label="How Draft works" />;
  const closed = c != null && (c.state === "final" || c.state === "rolled");
  const review = c?.state === "review";
  const over = closed || review;
  const lock = c?.locks_at ? Date.parse(c.locks_at) : null;
  const open = lock != null && now != null && lock > now;
  const lockedAt = lock != null && !open
    ? `${new Date(lock).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" })} ${ukTime(c!.locks_at!)}` : null;
  const mine = signedIn ? live?.mine ?? null : null;
  const hasTeam = (mine?.team.length ?? 0) > 0;
  const opened = mine?.packs.filter((p) => p.opened_at != null).length ?? 0;
  const total = mine && mine.packs.length ? new Set(mine.packs.map((p) => p.pack)).size : DRAFT_PACKS;
  const opens = Math.round(opened / 3);                     // three players in a pack
  const state: "packs" | "team" | "set" | "running" | "missed" | "closed" =
    over && !hasTeam ? "missed" : over ? "closed" : mine && mine.state !== "open" ? (hasTeam ? "running" : "missed") : mine && hasTeam ? "set" : mine && opens >= total ? "team" : "packs";

  const lockBox = (
    <div>
      <span className="lbl">{open ? "Locks in" : "Locked"}</span>
      <span className="e2-clockbig">{c == null || lock == null ? "–" : open ? <Digits ms={lock - now!} /> : lockedAt}</span>
    </div>
  );
  const potBox = (
    <div><span className="lbl">{potLabel(c, "Weekly pot")}</span><span className="e2-big">{c && potUnset(c) ? <span className="e2-small">Set at full time</span> : <>{c ? potText(c) : "–"}<small>SOL</small></>}</span></div>
  );
  let nums: React.ReactNode, note: React.ReactNode = <span className="e2-small e2-muted">Top 5 are paid</span>;
  let button: React.ReactNode = <Link className="e2-btn e2-btn-line" href="/draft">Play</Link>;

  if (state === "packs") {
    nums = <><div><span className="lbl">Packs</span><span className="e2-big">{total - opens}<small>{opens ? "still to open" : "to open"}</small></span></div>{lockBox}{potBox}</>;
  } else if (state === "team") {
    nums = <><div><span className="lbl">Packs</span><span className="e2-big">{total} of {total}<small>opened</small></span></div><div><span className="lbl">Team</span><span className="e2-big">Not saved</span></div>{lockBox}</>;
  } else if (state === "set") {
    nums = <><div><span className="lbl">Team</span><span className="e2-big">Saved</span></div>{lockBox}{potBox}</>;
    note = <span className="e2-small e2-muted">You can change it until the lock</span>;
  } else if (state === "missed") {
    nums = over
      ? <><div><span className="lbl">Team</span><span className="e2-big">{signedIn ? "None" : "–"}</span></div>{potBox}</>
      : <><div><span className="lbl">Team</span><span className="e2-big">None saved</span></div>{lockBox}{potBox}</>;
    note = <span className="e2-small e2-muted">{over ? (signedIn ? "No team this week" : "Guests can try the Draft; nothing is saved") : "No team was saved before the lock"}</span>;
    button = <Link className="e2-btn e2-btn-line" href="/ranks?board=draft">Open the board</Link>;
  } else {
    const total_ = mine?.total ?? 0, place = mine?.place ?? null;
    let third: React.ReactNode;
    if (closed) {
      third = <><span className="lbl">{c?.state === "rolled" ? "Pot" : "Prize won"}</span><span className="e2-big">{c?.state === "rolled" ? <span className="e2-small">Rolled forward</span> : mine && mine.prize_lamports > 0 ? <>{sol(mine.prize_lamports)}<small>SOL</small></> : <span className="e2-small">Nothing this time</span>}</span></>;
    } else if (review) {
      third = <><span className="lbl">Prize if released</span><span className="e2-big">{mine && mine.prize_lamports > 0 ? <>{sol(mine.prize_lamports)}<small>SOL</small></> : <span className="e2-small">Nothing this time</span>}</span></>;
    } else if (place == null) {
      third = <><span className="lbl">Prizes</span><span className="e2-big"><span className="e2-small">Top 5 are paid</span></span></>;
    } else if (mine && mine.entrants < 3) {
      third = <><span className="lbl">Prizes</span><span className="e2-big"><span className="e2-small">Needs 3 players</span></span></>;
    } else if (place <= 5) {
      third = <><span className="lbl">Prizes</span><span className="e2-big"><span className="e2-small">In the prizes</span></span></>;
    } else {
      const gap = live?.fifth != null ? live.fifth - total_ : null;
      third = <><span className="lbl">Prizes</span><span className="e2-big">{gap != null ? <>{pts(Math.max(0, gap))}<small>pts to 5th</small></> : <span className="e2-small">Not yet</span>}</span></>;
    }
    nums = <>
      <div><span className="lbl">{over ? "Final total" : "Week total"}</span><span className="e2-big">{pts(total_)}<small>pts</small></span></div>
      <div><span className="lbl">{over ? "Final place" : "Place"}</span><span className="e2-big">{place != null ? <>{ord(place)}<small>{mine && mine.entrants ? `of ${mine.entrants}` : ""}</small></> : "–"}</span></div>
      <div>{third}</div>
    </>;
    if (over) {
      note = <span className="e2-small e2-muted">{review ? "Result being checked" : c?.state === "rolled" ? "Fewer than 3 played" : c?.state === "final" && (mine?.prize_lamports ?? 0) > 0 ? "Collect it on Winnings" : "Final result"}</span>;
      button = <Link className="e2-btn e2-btn-line" href="/ranks?board=draft">Result</Link>;
    } else {
      note = <span className="e2-small e2-muted">Scores Friday to Monday</span>;
      button = <Link className="e2-btn e2-btn-line" href="/draft">Live</Link>;
    }
  }
  if (!live && !over && signedIn && state === "packs") note = <span className="e2-small e2-muted">Top 5 are paid</span>;
  if (!signedIn && !over) {
    nums = <p className="none">Look at sample packs and pick a five-a-side. Your own five packs are dealt when you connect.</p>;
    button = <Link className="e2-btn e2-btn-line" href="/draft">Try Draft</Link>;
  }
  if (!signedIn && over) button = <Link className="e2-btn e2-btn-line" href="/ranks?board=draft">Open the board</Link>;
  return (
    <article className="e2-card e2-mode" aria-labelledby="t-Draft" aria-busy={loading || undefined} data-state={state}>
      <div className="top">
        <div>
          <h2 className="name" id="t-Draft">Draft</h2>
          <p className="status">Opens Tuesday · locks Friday&apos;s first kick-off · scores Friday to Monday</p>
        </div>
        {c && <Badge state={c.state} />}
      </div>
      {!signedIn && !over ? nums : <div className="nums">{nums}</div>}
      <div className="foot">
        {signedIn && access && !access.draft && access.balance != null && !over
          ? <Hold need={access.draft_requirement} name=" Draft" access={access} which="draft" />
          : note}
        {button}
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
  const blitzLive = useBlitzLive(blitz, signedIn ? token : null, at);
  const draftLive = useDraftLive(draft, signedIn ? token : null, at);
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
            <BlitzCard c={blitz} loading={loading} now={now} access={access} signedIn={signedIn} live={blitzLive} />
            <DraftCard c={draft} loading={loading} now={now} access={access} signedIn={signedIn} live={draftLive} />
            <article className="e2-card e2-side" aria-labelledby="t-Shootout">
              <div>
                <span className="e2-eyebrow">Side game</span>
                <h2 id="t-Shootout">Penalty Shootout</h2>
                <p className="e2-small e2-muted">10 ranked games a day</p>
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
