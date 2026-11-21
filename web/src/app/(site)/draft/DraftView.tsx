"use client";

// Weekly Draft page (docs/design/mockups/draft.html and draft-guest.html).
// A player opens 5 personal packs of 3 players (one Top, one Mid, one Budget in each) and builds a five-a-side from those 15:
// at least 1 defender, 1 midfielder, 1 attacker, no goalkeepers, at most 2 from one club, at most 2 Top and 2 Mid, one captain on
// double points. Any shape is allowed: there is no formation picker, the board arranges itself from the picks.
// Every number shown comes from `rules` in the API answer. Saving needs a connected wallet holding the required $ELEVN; as a guest
// everything works on sample packs but nothing is saved (a refresh clears it).
// Data: GET /api/draft/{week} (every 30 seconds when signed in), POST .../packs/{pack}/open, POST .../check, PUT .../team, POST .../swap.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import {
  ApiError, DraftLimit, DraftMine, DraftPackRow, DraftRules, DraftTier, DraftWeek,
  checkDraftTeam, fetchDraft, openDraftPack, saveDraftTeam, sol, swapDraftPlayer,
} from "@/lib/api";
import "./draft.css";

const POLL_MS = 30_000;
const GIVE_UP_MS = 6_000;
const TICK_MS = 15_000;
const SPLIT = [50, 25, 12, 8, 5];                     // every prize board pays the top 5 like this
const PLACE = ["1st", "2nd", "3rd", "4th", "5th"];
const TIERS: DraftTier[] = ["top", "mid", "budget"];
const TIER_NAME: Record<DraftTier, string> = { top: "Top", mid: "Mid", budget: "Budget" };

type Status = "loading" | "ready" | "none" | "down";
type Pos = "DEF" | "MID" | "ATT" | "GK";
type Pl = { id: number; name: string; pos: Pos; club: string; tier: DraftTier; value: number; pack: number };
type Local = { ids: number[]; captain: number | null };
type CheckState = "ok" | "wait" | "bad";
type Check = { key: string; text: string; state: CheckState };
type Verdict = { sig: string; ok: boolean; problems: string[] };

// ---- formatting (UK time, as every kick-off is) ----
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const numWord = (n: number) => WORDS[n] ?? String(n);
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const count = (n: number) => n.toLocaleString("en-GB");
const ukDay = (iso: string, style: "long" | "short") => new Date(iso).toLocaleDateString("en-GB", { weekday: style, timeZone: "Europe/London" });
const stampOf = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const two = (n: number) => String(n).padStart(2, "0");
const solText = (v: number) => `${sol(Math.floor(Math.max(0, v) * 1e9))} SOL`;

const posOf = (p: string | null | undefined): Pos => {
  const u = (p ?? "").toUpperCase();
  return u === "FWD" || u === "ATT" ? "ATT" : u === "DEF" || u === "MID" || u === "GK" ? u : "MID";
};
// the shorter name for the board: the first name goes, "van de Ven" stays whole
const surname = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 ? w.slice(1).join(" ") : n; };

// a rule is either one number or one number per key; the first key found wins
function limit(l: DraftLimit, keys: string[], fallback: number | null): number | null {
  if (typeof l === "number") return l;
  for (const k of keys) for (const v of [k, k.toLowerCase(), k.toUpperCase()]) if (l && typeof l[v] === "number") return l[v];
  return fallback;
}
const minPos = (r: DraftRules, p: Pos) => limit(r.min_per_position, p === "ATT" ? ["ATT", "FWD"] : [p], 1) ?? 1;
// Budget has no limit unless the rules name one
const maxTier = (r: DraftRules, t: DraftTier) => (typeof r.max_per_tier === "number" ? (t === "budget" ? null : r.max_per_tier) : limit(r.max_per_tier, [t], null));

const sigOf = (l: Local) => `${[...l.ids].sort((a, b) => a - b).join(",")}:${l.captain ?? ""}`;
const fromMine = (m: DraftMine | null | undefined): Local => ({
  ids: (m?.team ?? []).map((p) => p.id),
  captain: m?.captain_id ?? m?.team.find((p) => p.is_captain)?.id ?? null,
});

function toPool(rows: DraftPackRow[], opened: (pack: number) => boolean): Pl[] {
  const out: Pl[] = [];
  rows.forEach((r) => {
    if (r.player_id == null || !r.name || !opened(r.pack)) return;
    out.push({ id: r.player_id, name: r.name, pos: posOf(r.position), club: r.club ?? "", tier: r.tier, value: r.value ?? 0, pack: r.pack });
  });
  return out;
}

// the seven checks under the board; they update on every pick
function evaluate(team: Pl[], captain: number | null, rules: DraftRules): Check[] {
  const n = team.length, full = n >= rules.team_size;
  const by = (p: Pos) => team.filter((x) => x.pos === p).length;
  const perPos = (p: Pos, word: string): Check => {
    const need = minPos(rules, p), have = by(p);
    return { key: p, text: `At least ${need} ${word}${need === 1 ? "" : "s"}`, state: have >= need ? "ok" : full ? "bad" : "wait" };
  };
  const clubs = new Map<string, number>();
  team.forEach((x) => clubs.set(x.club, (clubs.get(x.club) ?? 0) + 1));
  const clubBad = [...clubs.values()].some((v) => v > rules.max_per_club);
  const tierBad = TIERS.some((t) => { const m = maxTier(rules, t); return m != null && team.filter((x) => x.tier === t).length > m; });
  const capped = TIERS.filter((t) => maxTier(rules, t) != null);
  const tierText = capped.map((t) => `${maxTier(rules, t)} ${TIER_NAME[t]}`);
  const mult = rules.captain_multiplier;
  return [
    perPos("DEF", "defender"), perPos("MID", "midfielder"), perPos("ATT", "attacker"),
    { key: "GK", text: "No goalkeepers", state: by("GK") ? "bad" : "ok" },
    { key: "club", text: `At most ${rules.max_per_club} players from one club`, state: clubBad ? "bad" : "ok" },
    { key: "cap", text: `Captain chosen, on ${mult === 2 ? "double" : `x${mult}`} points`, state: captain != null && team.some((x) => x.id === captain) ? "ok" : full ? "bad" : "wait" },
    { key: "tier", text: `At most ${tierText.join(" and ")} players`, state: tierBad ? "bad" : "ok" },
  ];
}

// ---------------------------------------------------------------- data
function useDraft(week: string, token: string | null) {
  const [state, setState] = useState<{ status: Status; data: DraftWeek | null }>({ status: "loading", data: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    let data: DraftWeek | null = null;
    let missing = false;
    try { data = await fetchDraft(week, token); }
    catch (e) {
      const s = (e as ApiError).status;
      if (token && s === 401) { try { data = await fetchDraft(week); } catch { data = null; } }   // a stale session: ask as a guest
      else if (s === 404) missing = true;
    }
    if (n !== seq.current) return;
    if (data) setState({ status: "ready", data });
    else if (missing) setState({ status: "none", data: null });
    else setState((s) => (s.data ? s : { ...s, status: "down" }));
  }, [week, token]);
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    load();
    // a guest's sample packs are fetched once: they must not change under the player's hands
    const poll = token ? setInterval(() => { if (visible()) load(); }, POLL_MS) : null;
    const back = () => { if (token && visible()) load(); };
    document.addEventListener("visibilitychange", back);
    const giveUp = setTimeout(() => setState((s) => (s.status === "loading" ? { ...s, status: "down" } : s)), GIVE_UP_MS);
    return () => { if (poll) clearInterval(poll); clearTimeout(giveUp); document.removeEventListener("visibilitychange", back); };
  }, [load, token]);
  // own actions return a fresh `mine`: use it, and drop any older answer still on its way
  const setMine = useCallback((mine: DraftMine) => { seq.current++; setState((s) => (s.data ? { ...s, data: { ...s.data, mine } } : s)); }, []);
  return { ...state, load, setMine };
}

// ---------------------------------------------------------------- pieces
function PosTag({ p }: { p: Pos }) { return <span className="dp-pos">{p}</span>; }

function Token({ gold, sm }: { gold?: boolean; sm?: boolean }) {
  return <span className={`dp-tok${gold ? " gold" : ""}${sm ? " sm" : ""}`} aria-hidden="true">{gold && <span className="dp-cap">×2</span>}</span>;
}

// one foil pack: the shared artwork, its number drawn over it, the hover video fading in over the still on hover only
function PackTile({ n, opened, selected, enabled, reduced, onClick }: {
  n: number; opened: boolean; selected: boolean; enabled: boolean; reduced: boolean; onClick: () => void;
}) {
  const [want, setWant] = useState(false);
  const [hot, setHot] = useState(false);
  const [ready, setReady] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  const can = !opened && !reduced;
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (hot) { v.play().catch(() => {}); return; }
    const t = setTimeout(() => v.pause(), 320);
    return () => clearTimeout(t);
  }, [hot, want]);
  const on = () => { if (can && enabled) { setWant(true); setHot(true); } };
  const off = () => setHot(false);
  return (
    <button type="button" className={`dp-pkt ${opened ? "opened" : "sealed"}${hot ? " hot" : ""}${ready && hot ? " has-video" : ""}`}
      aria-label={opened ? `Pack ${n}, opened. Show its players` : `Open pack ${n}`} aria-pressed={opened ? selected : undefined}
      disabled={!opened && !enabled} onClick={onClick}
      onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}>
      <span className="dp-pkt-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pack.png" alt="" draggable={false} />
        {want && can && (
          <video ref={vid} muted loop playsInline preload="auto" aria-hidden="true" onCanPlay={() => setReady(true)}>
            <source src="/pack-hover.webm" type="video/webm" />
            <source src="/pack-hover.mp4" type="video/mp4" />
          </video>
        )}
        <span className="dp-pkt-num">PACK {n}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- the page
export default function DraftView({ week = "next" }: { week?: string }) {
  const { wallet, token, me, signIn, signingIn } = useAuth();
  const signedIn = Boolean(wallet && token);
  const tk = signedIn ? token : null;
  const { status, data, load, setMine } = useDraft(week, tk);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), TICK_MS); return () => clearInterval(i); }, []);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const f = () => setReduced(q.matches);
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);

  const rules = data?.rules ?? null;
  // `own`: the answer carries this wallet's packs. Otherwise (a guest, or the moment after signing in) the sample packs are shown
  const own = signedIn && Boolean(data?.mine);
  const mine = own ? data?.mine ?? null : null;
  const rows = useMemo<DraftPackRow[]>(() => (own ? mine?.packs : data?.sample) ?? [], [own, mine, data?.sample]);
  const packNos = useMemo(() => [...new Set(rows.map((r) => r.pack))].sort((a, b) => a - b), [rows]);
  // a guest opens sample packs on this page only
  const [guestOpen, setGuestOpen] = useState<number[]>([]);
  const isOpen = useCallback((n: number) => (own ? false : guestOpen.includes(n)) || rows.some((r) => r.pack === n && r.opened_at != null), [own, guestOpen, rows]);
  const pool = useMemo(() => toPool(rows, isOpen), [rows, isOpen]);
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  // every one of the 15, opened or not: the saved team carries no club, and a swap may bring in a player from a sealed pack
  const all = useMemo(() => toPool(rows, () => true), [rows]);
  const poolKey = pool.map((p) => p.id).join(",");

  const [sel, setSel] = useState<number | null>(null);
  const [busyPack, setBusyPack] = useState(false);
  const [packErr, setPackErr] = useState<string | null>(null);
  const [local, setLocal] = useState<Local>({ ids: [], captain: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [swapOut, setSwapOut] = useState<number | null>(null);

  // signing in or out starts the page afresh
  useEffect(() => { setGuestOpen([]); setSel(null); setLocal({ ids: [], captain: null }); setNotice(null); setPackErr(null); setVerdict(null); }, [signedIn]);

  // the saved team fills the board (after sign-in or a reload); unsaved picks stay as they are
  const savedKey = own ? `${mine?.team.map((p) => p.id).join(",") ?? ""}:${mine?.captain_id ?? ""}` : "";
  useEffect(() => {
    if (mine && mine.team.length) setLocal(fromMine(mine));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  // a pick that is not in the pool (another pool after signing in) is dropped
  useEffect(() => {
    if (!pool.length && !rows.length) return;
    setLocal((cur) => {
      const ids = cur.ids.filter((id) => byId.has(id));
      return ids.length === cur.ids.length ? cur : { ids, captain: cur.captain != null && ids.includes(cur.captain) ? cur.captain : null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  const lockMs = data?.locks_at ? Date.parse(data.locks_at) : null;
  const pastLock = lockMs != null && now != null && lockMs <= now;
  const state = mine?.state ?? "open";
  const editable = !own || (state === "open" && !pastLock);
  const total = packNos.length;

  // refetch once when the lock time passes, so the locked team appears without waiting
  const lockSeen = useRef(false);
  useEffect(() => { if (pastLock && !lockSeen.current) { lockSeen.current = true; load(); } }, [pastLock, load]);

  const team = local.ids.map((id) => byId.get(id)).filter(Boolean) as Pl[];
  const checks = rules ? evaluate(team, local.captain, rules) : [];
  const size = rules?.team_size ?? 0;
  const localOk = Boolean(rules) && team.length === size && checks.every((c) => c.state === "ok");
  const sig = editable && localOk ? sigOf(local) : null;

  // ask the server whether this team is valid (works for guests too); the answer is matched to the picks by signature
  useEffect(() => {
    if (!sig) return;
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const r = await checkDraftTeam(week, { pool_player_ids: pool.map((p) => p.id), team_ids: local.ids, captain_id: local.captain }, tk);
        if (!dead) setVerdict({ sig, ok: r.ok, problems: r.problems });
      } catch { if (!dead) setVerdict({ sig, ok: true, problems: [] }); }   // the check is advice; the save is the judge
    }, 250);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, tk]);

  function toggle(id: number) {
    setNotice(null);
    setLocal((cur) => cur.ids.includes(id)
      ? { ids: cur.ids.filter((x) => x !== id), captain: cur.captain === id ? null : cur.captain }
      : cur.ids.length >= size ? cur : { ...cur, ids: [...cur.ids, id] });
  }
  const makeCaptain = (id: number) => { setNotice(null); setLocal((cur) => ({ ...cur, captain: cur.captain === id ? null : id })); };

  async function openOne(n: number): Promise<boolean> {
    if (!own) { setGuestOpen((c) => (c.includes(n) ? c : [...c, n])); setSel(n); return true; }
    try { setMine(await openDraftPack(week, n, token!)); setSel(n); return true; }
    catch (e) { setPackErr((e as ApiError).message); return false; }
  }
  async function openPacks(all: boolean) {
    const sealed = packNos.filter((n) => !isOpen(n));
    if (!sealed.length || busyPack) return;
    setBusyPack(true); setPackErr(null);
    for (const n of all ? sealed : sealed.slice(0, 1)) { if (!(await openOne(n))) break; }
    setBusyPack(false);
  }

  function openPackNo(n: number) {
    if (busyPack || !editable) return;
    setBusyPack(true); setPackErr(null);
    openOne(n).finally(() => setBusyPack(false));
  }

  async function save() {
    if (!token) return;
    setBusy(true); setNotice(null);
    try {
      const fresh = await saveDraftTeam(week, { team_ids: local.ids, captain_id: local.captain }, token);
      setMine(fresh);
      setLocal(fromMine(fresh));
      setNotice({ kind: "ok", text: "Team saved." });
    } catch (e) {
      setNotice({ kind: "error", text: (e as ApiError).message });   // the server's own words, as they are
    }
    setBusy(false);
  }

  // the player to swap in after a match is called off: the highest-valued unused player in the same position
  const swapIn = (outId: number): Pl | null => {
    const out = mine?.team.find((p) => p.id === outId);
    if (!out) return null;
    const used = new Set(mine?.team.map((p) => p.id));
    return all.filter((p) => !used.has(p.id) && p.pos === posOf(out.position)).sort((a, b) => b.value - a.value || a.id - b.id)[0] ?? null;
  };
  async function swap() {
    const out = swapOut ?? mine?.team[0]?.id ?? null;
    const inn = out != null ? swapIn(out) : null;
    if (out == null || !inn || !token) return;
    setBusy(true); setNotice(null);
    try { setMine(await swapDraftPlayer(week, { out_id: out, in_id: inn.id }, token)); setNotice({ kind: "ok", text: `${inn.name} is in.` }); }
    catch (e) { setNotice({ kind: "error", text: (e as ApiError).message }); }
    setBusy(false);
  }

  // ---- render
  if (status !== "ready" || !data || !rules) {
    const text = status === "loading" ? "Loading the Draft" : status === "down" ? "Can't reach elevn right now." : "No Draft week scheduled yet";
    return (
      <div className="e2-page dp">
        <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="e2-ph dp-head">
          <div><span className="e2-eyebrow">Weekly Draft</span></div>
          <div className="w"><h1 className="e2-word">Draft</h1></div>
        </div>
        <div className="e2-card dp-alone" aria-busy={status === "loading" || undefined}>
          <p>{text}</p>
          {status === "none" && <p className="e2-small e2-muted">Packs appear here as soon as a week is set.</p>}
          {status === "down" && <p className="e2-small e2-muted">Trying again every 30 seconds.</p>}
          {status !== "loading" && <Link className="e2-btn e2-btn-line" href="/today">Back to Today</Link>}
        </div>
      </div>
    );
  }

  const contest = data.contest;
  const lockDay = data.locks_at ? ukDay(data.locks_at, "long") : null;
  const kicks = data.fixtures.map((f) => Date.parse(f.kickoff)).filter((x) => !Number.isNaN(x));
  const scores = data.locks_at && kicks.length ? `${ukDay(data.locks_at, "short")} to ${ukDay(new Date(Math.max(...kicks)).toISOString(), "short")}` : "Not set";
  const left = lockMs != null && now != null ? Math.max(0, lockMs - now) : null;
  const dd = left == null ? 0 : Math.floor(left / 86_400_000), hh = left == null ? 0 : Math.floor(left / 3_600_000) % 24, mm = left == null ? 0 : Math.floor(left / 60_000) % 60;
  const blocked = signedIn && me?.access != null && !me.access.draft;
  const pot = contest?.pot_sol ?? null;
  const nOpen = packNos.filter(isOpen).length;
  const sealedLeft = packNos.length - nOpen;
  const nextSealed = packNos.find((n) => !isOpen(n));
  const readOnly = own && !editable;
  const shown = sel != null && isOpen(sel) ? sel : null;
  const revealRows = shown != null ? TIERS.map((t) => pool.find((p) => p.pack === shown && p.tier === t)).filter(Boolean) as Pl[] : [];
  const stateBadge = state === "live" ? <span className="e2-badge live">Live</span>
    : state === "final" ? <span className="e2-badge ft">Final</span>
    : <span className="e2-badge dp-lockd">Locked</span>;

  // the five on the board: from the saved team when read-only, from the picks otherwise
  type Seat = { id: number; name: string; club: string; pos: Pos; captain: boolean; points: number | null };
  const seats: Seat[] = readOnly
    ? (mine?.team ?? []).map((p) => ({ id: p.id, name: p.name, club: all.find((x) => x.id === p.id)?.club ?? "", pos: posOf(p.position), captain: p.is_captain || p.id === mine?.captain_id, points: p.points }))
    : team.map((p) => ({ id: p.id, name: p.name, club: p.club, pos: p.pos, captain: local.captain === p.id, points: null }));
  const shape = (["DEF", "MID", "ATT"] as Pos[]).map((p) => seats.filter((s) => s.pos === p).length).join("-");
  const picked = seats.length;
  const caps = [...TIERS.filter((t) => maxTier(rules, t) != null).map((t) => `${maxTier(rules, t)} ${TIER_NAME[t]}`), `${rules.max_per_club} from one club`];
  const limitPhrase = caps.length > 1 ? `${caps.slice(0, -1).join(", ")} and ${caps[caps.length - 1]}` : caps[0];

  const savedSig = own && mine?.team.length ? sigOf(fromMine(mine)) : null;
  const dirty = savedSig !== sigOf(local);
  const checking = Boolean(sig && verdict?.sig !== sig);
  const problems = sig && verdict?.sig === sig && !verdict.ok ? verdict.problems : [];
  const firstBad = checks.find((c) => c.state === "bad");
  const canSave = signedIn && editable && localOk && !checking && problems.length === 0 && !blocked && dirty && !busy;

  let reason: React.ReactNode;
  if (notice?.kind === "error") reason = <span className="dp-err" role="alert">Not saved. {notice.text}</span>;
  else if (picked < size) reason = `Pick ${numWord(size - picked)} more${local.captain == null && picked > 0 ? " and name a captain" : ""}.`;
  else if (firstBad) reason = `Not ready: ${firstBad.text.charAt(0).toLowerCase()}${firstBad.text.slice(1)}.`;
  else if (!localOk) reason = "Name a captain. Your captain scores double.";
  else if (checking) reason = "Checking your team…";
  else if (problems.length) reason = problems.join(" ");
  else if (blocked) reason = `Hold ${count(rules.requirement)} $ELEVN to save a team.`;
  else if (notice?.kind === "ok") reason = <span role="status">{notice.text} You can change it until {lockDay ? `${lockDay}'s` : "the"} first kick-off.</span>;
  else if (!dirty) reason = `Saved. You can change it until ${lockDay ? `${lockDay}'s` : "the"} first kick-off.`;
  else reason = signedIn ? `Team is valid. Locks at ${lockDay ? `${lockDay}'s` : "the"} first kick-off.` : "Guest view: nothing is saved.";

  const teamBadge = readOnly ? stateBadge
    : localOk ? <span className="e2-badge steel dp-pill">{signedIn ? (dirty ? "Ready · not saved" : "Saved") : "Ready · not saved"}</span>
    : <span className="e2-badge steel dp-pill">{picked} of {size} picked</span>;

  const rowOf = (p: Pos) => seats.filter((s) => s.pos === p);

  return (
    <div className="e2-page dp">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      {!signedIn && <p className="dp-banner" role="note">You&apos;re trying elevn as a guest. Connect a wallet to save your squads and play for prizes.</p>}
      <div className="e2-ph dp-head">
        <div>
          <span className="e2-eyebrow">{`Weekly Draft${now != null ? ` · ${stampOf(now)}` : ""}`}</span>
          <p className="dp-lead">{cap1(numWord(total))} packs of three, different for every wallet. Build a {numWord(size)}-a-side from your {numWord(total * 3)}. Paid once a week to the top {numWord(SPLIT.length)}.</p>
        </div>
        <div className="w"><h1 className="e2-word">Draft</h1></div>
      </div>

      <div className="e2-card dp-bar">
        <div className="dp-lockbar">
          {state === "open" && !pastLock ? (
            <>
              <span className="e2-eyebrow">{lockDay ? `Draft locks at ${lockDay}'s first kick-off` : "Draft locks at the first kick-off"}</span>
              <div className="e2-cd dp-cd" role="timer" aria-label={`${dd} days ${hh} hours ${mm} minutes left`}>{two(dd)}<small>D</small>{two(hh)}<small>H</small>{two(mm)}<small>M</small></div>
            </>
          ) : (
            <>
              <span className="e2-eyebrow">{state === "final" ? "Draft is final" : state === "live" ? "Draft is scoring" : "Draft is locked"}</span>
              {stateBadge}
            </>
          )}
        </div>
        <div className="dp-stats">
          <div><span className="k">Pot this week</span><span className="v">{pot != null ? `${contest?.pot_estimated ? "about " : ""}${solText(pot)}` : "Not set"}</span></div>
          <div><span className="k">Scores</span><span className="v">{scores}</span></div>
          <div><span className="k">{signedIn ? "You hold" : "Your wallet"}</span>
            <span className="v">{signedIn ? (me ? <>{count(me.balance)} <span className="u2">$ELEVN</span></> : "…") : "Not connected"}</span></div>
        </div>
      </div>

      <section className="dp-s1" aria-labelledby="dp-h-packs">
        <div className="dp-sh">
          <div className="dp-t"><span className="e2-eyebrow">Step 1 · Packs</span><h2 id="dp-h-packs">Open your {numWord(total)} packs</h2></div>
          <p className="dp-help">
            {!signedIn && <span className="e2-badge steel">Sample</span>}
            <span aria-live="polite">
              {packErr ? <span className="dp-err" role="alert">{packErr}</span>
                : !signedIn ? `${nOpen} of ${total} sample packs opened. Your own ${numWord(total)} are dealt when you connect.`
                : sealedLeft === 0 ? `All ${numWord(total)} opened. These ${numWord(total * 3)} are yours for the week.`
                : `${nOpen} of ${total} opened. One top, one mid and one budget player in each; luck decides who. No re-rolls: these ${numWord(total * 3)} are yours for the week.`}
            </span>
          </p>
          {sealedLeft > 0 && editable && (
            <div className="btns">
              <button type="button" className={`e2-btn ${signedIn ? "e2-btn-gold" : "e2-btn-line"}`} disabled={busyPack} onClick={() => openPacks(false)}>Open pack {nextSealed}</button>
              <button type="button" className="e2-btn e2-btn-line" disabled={busyPack} onClick={() => openPacks(true)}>Open all</button>
            </div>
          )}
        </div>
        <div className="e2-card dp-shelf">
          <div className="dp-packs">
            {packNos.length === 0 ? <p className="e2-small e2-muted">No packs are dealt yet.</p> : (
              <div className="dp-pkgrid">
                {packNos.map((n) => {
                  const op = isOpen(n);
                  return (
                    <div key={n} className={`dp-packcol${op && shown === n ? " sel" : ""}`}>
                      <PackTile n={n} opened={op} selected={shown === n} enabled={editable && !busyPack} reduced={reduced}
                        onClick={() => (op ? setSel(n) : openPackNo(n))} />
                      <span className={`dp-pkst${!op && editable && n === nextSealed ? " ready" : ""}`}>
                        {op ? <><span className="dp-tick" aria-hidden="true">✓</span>Opened</>
                          : <><span className={`dp-lk${editable && n === nextSealed ? " open" : ""}`} aria-hidden="true" />{editable && n === nextSealed ? "Ready to open" : "Sealed"}</>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="dp-reveal">
            {shown != null ? (
              <>
                <div className="hd"><span className="e2-eyebrow">Pack {shown} · opened, three players</span></div>
                <ul>
                  {revealRows.map((p) => (
                    <li key={p.id} className="dp-rv"><Token sm />
                      <span className="who"><span className="nm">{p.name}</span><span className="mt"><PosTag p={p.pos} />{p.club}</span></span>
                      <span className="tr">{TIER_NAME[p.tier]}</span></li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="hd"><span className="e2-eyebrow">{nOpen ? "Choose an opened pack" : "Nothing opened yet"}</span>
                <p className="e2-small e2-muted" style={{ margin: "8px 0 0" }}>{nOpen ? "Its three players show here." : "Open a pack and its three players show here."}</p></div>
            )}
          </div>
        </div>
      </section>

      <section className="dp-main" aria-label="Build your team">
        <div className="dp-left">
          <div className="dp-sh2">
            <div className="dp-t"><span className="e2-eyebrow">{`Step 2 · Your ${numWord(total * 3)}`}</span>
              <h2>{pool.length === 0 ? "No players yet" : pool.length >= total * 3 ? `All ${numWord(total * 3)} are yours` : `${cap1(numWord(pool.length))} player${pool.length === 1 ? "" : "s"} so far`}</h2></div>
            <p className="dp-help">{sealedLeft > 0 ? `${sealedLeft === 1 ? `Pack ${nextSealed} is` : `${sealedLeft} packs are`} still sealed. ` : ""}No goalkeepers.{editable ? " Tap a player to put him in your five." : ""}</p>
          </div>
          <div className="e2-card dp-pool">
            <div className="dp-tiers" aria-hidden="true"><span /><span>Top</span><span>Mid</span><span>Budget</span></div>
            <ol className="dp-rows">
              {packNos.map((n) => {
                const op = isOpen(n);
                return (
                  <li key={n} className="dp-prow"><span className="dp-pk">Pack {n}</span>
                    {op ? (
                      <ul className="dp-chips">
                        {TIERS.map((t) => {
                          const p = pool.find((x) => x.pack === n && x.tier === t);
                          if (!p) return <li key={t} className="dp-chip" />;
                          const inn = local.ids.includes(p.id) || (readOnly && mine?.team.some((x) => x.id === p.id));
                          const isCap = readOnly ? mine?.captain_id === p.id : local.captain === p.id;
                          const off = editable && !inn && team.length >= size;
                          return (
                            <li key={t} className={`dp-chip${inn ? " in" : ""}${off ? " off" : ""}`}>
                              <button type="button" className="dp-cb" aria-pressed={Boolean(inn)} disabled={!editable || off} onClick={() => toggle(p.id)}
                                aria-label={`${p.name}, ${p.pos}, ${p.club}, ${TIER_NAME[t]}${inn ? ", in your five" : off ? ", your five is full" : ""}`}>
                                <span className="nm">{p.name}</span>
                                <span className="mt"><PosTag p={p.pos} /><span className="cl">{p.club}</span>
                                  {inn ? <span className="u"><span aria-hidden="true">✓</span> In five</span> : <span className="dp-sr">Not in your five</span>}
                                  <span className="t">{TIER_NAME[t]}</span></span>
                              </button>
                              {inn && editable && (
                                <button type="button" className="dp-capb" aria-pressed={isCap} onClick={() => makeCaptain(p.id)}
                                  aria-label={isCap ? `${p.name} is captain` : `Make ${p.name} captain`} title={isCap ? "Captain" : "Make captain"}>
                                  <span className={isCap ? "dp-cap" : "dp-cap ring"} aria-hidden="true">{isCap ? "×2" : "C"}</span>
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="dp-seal"><span className="dp-lk" aria-hidden="true" /><span>Sealed: one top, one mid and one budget player inside</span></div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="e2-card dp-prz">
            <div className="hd"><span className="e2-eyebrow">Top {numWord(SPLIT.length)} are paid</span><span className="e2-small e2-muted">Weekly pot, {SPLIT.join(" / ")}</span></div>
            <ol>
              {SPLIT.map((pc, i) => (
                <li key={i}><span className="p">{PLACE[i]}</span><span className="pc">{pc}%</span><span className="sol">{pot != null ? solText(pot * pc / 100) : "–"}</span></li>
              ))}
            </ol>
            <p className="e2-small e2-steel2">Ties: more captain points wins, else split. Half is collectable at once; the rest is released 20% every 24 hours. See <Link className="dp-tl" href="/winnings">Winnings</Link>.</p>
          </div>
        </div>

        <div className="dp-right">
          <div className="dp-sh2">
            <div className="dp-t dp-t3"><span className="e2-eyebrow">Step 3 · Your {numWord(size)}-a-side</span>
              <h2>Pick {numWord(size)}, name a captain</h2>
              <span className="e2-badge dp-shape">{picked === size || readOnly ? `Shape ${shape}` : `${picked} of ${size} picked`}</span></div>
            <p className="dp-help">Any shape with at least {minPos(rules, "DEF")} defender, {minPos(rules, "MID")} midfielder and {minPos(rules, "ATT")} attacker. At most {limitPhrase}. Your captain scores {rules.captain_multiplier === 2 ? "double" : `x${rules.captain_multiplier}`}. If a player&apos;s match is postponed or cancelled, your highest-valued unused player in that position steps in.</p>
          </div>
          <div className="e2-card dp-frame">
            <div className="dp-pitch" aria-label={picked ? `Your five: ${seats.map((s) => `${s.name}, ${s.pos}${s.captain ? ", captain" : ""}`).join("; ")}` : "Your five, empty"}>
              <div className="dp-ln" />
              {picked === 0 && <p className="dp-pitch-empty">Your {numWord(size)} appear here as you pick.</p>}
              <div className="dp-brows">
                {(["ATT", "MID", "DEF", "GK"] as Pos[]).map((p) => {
                  const r = rowOf(p);
                  if (p === "GK" && !r.length) return null;
                  return (
                    <div key={p} className="dp-brow">
                      {r.map((s) => (
                        <div key={s.id} className="dp-pl" title={s.name}>
                          <Token gold={s.captain} />
                          <span className="nm">{surname(s.name)}</span>
                          <small>{s.club}</small>
                          <span className="ps2">{s.pos}</span>
                          {s.points != null && <span className="pts">{s.points} pts</span>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {readOnly ? (
            <>
              <div className="e2-card dp-result">
                <div className="hd"><span className="e2-eyebrow">Your team</span>{stateBadge}</div>
                {mine?.team.length ? (
                  <p className="tot"><b>{mine.total ?? 0}</b> <small>points{state === "final" ? ", final" : " so far"}</small></p>
                ) : <p className="e2-small e2-muted">No team was saved before the lock, so there is nothing to score this week.</p>}
              </div>
              {mine?.team.length ? (
                <div className="dp-save">
                  <span className="e2-small e2-muted" aria-live="polite">{notice ? notice.kind === "error" ? <span className="dp-err" role="alert">{notice.text}</span> : <span role="status">{notice.text}</span> : state === "final" ? "This week is final." : "Locked. Scoring runs until the last match is done."}</span>
                </div>
              ) : null}
              {state !== "final" && mine?.team.length ? (
                <details className="dp-swap">
                  <summary>A player&apos;s match called off?</summary>
                  <div className="row">
                    <label className="e2-small" htmlFor="dp-swap-out">Swap out</label>
                    <select id="dp-swap-out" value={swapOut ?? mine.team[0].id} onChange={(e) => setSwapOut(Number(e.target.value))}>
                      {mine.team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="e2-small e2-muted">{(() => { const i = swapIn(swapOut ?? mine.team[0].id); return i ? `${i.name} comes in` : "No one left in that position"; })()}</span>
                    <button type="button" className="e2-btn e2-btn-line e2-btn-sm" disabled={busy || !swapIn(swapOut ?? mine.team[0].id)} onClick={swap}>Swap</button>
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <>
              <div className="e2-card dp-rules">
                <div className="hd"><span className="e2-eyebrow">Team rules</span>{teamBadge}</div>
                <ul className="dp-checks">
                  {checks.map((c) => (
                    <li key={c.key} className={c.state}>
                      <span className="dp-tick" aria-hidden="true">{c.state === "ok" ? "✓" : c.state === "bad" ? "✕" : ""}</span>
                      <span>{c.text}<span className="dp-sr">{c.state === "ok" ? ", met" : c.state === "bad" ? ", broken" : ", not met yet"}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="dp-save">
                <span className="e2-small e2-muted" aria-live="polite">{reason}</span>
                {signedIn
                  ? <button type="button" className={`e2-btn${canSave && sealedLeft === 0 ? " e2-btn-gold" : " e2-btn-line"}`} disabled={!canSave} onClick={save}>{busy ? "Saving…" : "Save team"}</button>
                  : <button type="button" className="e2-btn e2-btn-line" onClick={signIn} disabled={signingIn}>{signingIn ? "Check your wallet…" : "Connect wallet to save"}</button>}
              </div>
            </>
          )}
        </div>
      </section>
      {!signedIn && <p className="e2-small e2-muted dp-note">Guest view: everything here works, nothing is saved.</p>}
    </div>
  );

}
