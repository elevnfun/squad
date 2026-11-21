"use client";

// Matchday Blitz pick page (docs/design/mockups/blitz-pick.html and blitz-pick-guest.html).
// A player builds up to 3 squads, one per fixture: 3 players from that fixture, at least 1 from each club,
// one captain on double points. A squad can change until its fixture kicks off. Saving needs a connected wallet
// holding 150,000 $ELEVN; as a guest everything works but nothing is saved (a refresh clears it).
// Data: GET /api/blitz/next, polled every 30 seconds; POST /api/blitz/check; PUT/DELETE /api/blitz/{day}/squads/{slot}.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import {
  api, ApiError, Board, BlitzBody, BlitzDay, BlitzFixture, BlitzMine, BlitzPlayer, BlitzSquad, BlitzTeam,
  checkBlitzSquad, deleteBlitzSquad, fetchBlitzNext, saveBlitzSquad, shortWallet, sol,
} from "@/lib/api";
import "./blitz.css";

const POLL_MS = 30_000;
const GIVE_UP_MS = 6_000;
const TICK_MS = 15_000;
const NEED = 150_000;

type Draft = { players: number[]; captain: number | null };
type Status = "loading" | "ready" | "none" | "down";
type Notice = { slot: number; kind: "error" | "ok"; text: string } | null;
type Verdict = { sig: string; ok: boolean; problems: string[] };

// ---- formatting (UK time, as every kick-off is) ----
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const ukTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const count = (n: number) => n.toLocaleString("en-GB");

function until(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return "under a minute";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

const POS_ORDER = ["GK", "DEF", "MID", "ATT"] as const;
const POS_NAME: Record<string, string> = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", ATT: "Attackers" };
const posOf = (p: string) => (p === "FWD" ? "ATT" : p.toUpperCase());

// club code for the crest and the small labels: initials for names of 2+ words, else the first three letters
function code(name: string): string {
  const w = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  return (w.length > 1 ? w.slice(0, 3).map((x) => x[0]).join("") : (w[0] ?? "").slice(0, 3)).toUpperCase();
}

const sigOf = (fixture: number, d: Draft) => `${fixture}:${[...d.players].sort((a, b) => a - b).join(",")}:${d.captain ?? ""}`;
const fromSaved = (s: BlitzSquad): Draft => ({ players: s.players.map((p) => p.id), captain: s.captain_id ?? s.players.find((p) => p.is_captain)?.id ?? null });

function playersOf(fx: BlitzFixture): Map<number, { p: BlitzPlayer; team: BlitzTeam; side: 0 | 1 }> {
  const m = new Map<number, { p: BlitzPlayer; team: BlitzTeam; side: 0 | 1 }>();
  fx.home.players.forEach((p) => m.set(p.id, { p, team: fx.home, side: 0 }));
  fx.away.players.forEach((p) => m.set(p.id, { p, team: fx.away, side: 1 }));
  return m;
}

// what is still missing, in words, and whether the squad is complete (3 players, 1 or more per club, a captain)
function readiness(fx: BlitzFixture, d: Draft): { ready: boolean; hint: string; sides: [number, number] } {
  const all = playersOf(fx);
  const sides: [number, number] = [0, 0];
  d.players.forEach((id) => { const e = all.get(id); if (e) sides[e.side]++; });
  const n = d.players.length;
  const parts: string[] = [];
  if (n < 3) {
    const need = 3 - n;
    const lack = n > 0 ? (sides[0] === 0 ? fx.home.name : sides[1] === 0 ? fx.away.name : null) : null;
    parts.push(lack ? (need === 1 ? `pick 1 more from ${lack}` : `pick ${need} more, at least 1 from ${lack}`) : `pick ${need} more`);
  } else if (sides[0] === 0 || sides[1] === 0) {
    parts.push(`pick at least 1 from ${sides[0] === 0 ? fx.home.name : fx.away.name}`);
  }
  if (d.captain == null || !d.players.includes(d.captain)) parts.push("choose a captain");
  return {
    ready: parts.length === 0, sides,
    hint: parts.length ? `Not ready: ${parts.join(" and ")}. Squads need 3 players, at least 1 from each club.` : "",
  };
}

// ---------------------------------------------------------------- data
function useBlitz(token: string | null) {
  const [state, setState] = useState<{ status: Status; data: BlitzDay | null; board: Board | null }>({ status: "loading", data: null, board: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    let data: BlitzDay | null = null;
    let missing = false;
    try {
      data = await fetchBlitzNext(token);
    } catch (e) {
      const s = (e as ApiError).status;
      if (token && s === 401) { try { data = await fetchBlitzNext(); } catch { data = null; } }   // a stale session: ask as a guest
      else if (s === 404) missing = true;
    }
    let board: Board | null = null;
    const id = data?.contest?.id;
    if (data && id != null) {
      try { board = await api<Board>(`/contests/${id}/board?limit=5`, { token }); }
      catch { try { board = await api<Board>(`/contests/${id}/board?limit=5`); } catch { board = null; } }
    }
    if (n !== seq.current) return;
    if (data) setState({ status: data.contest && data.fixtures.length ? "ready" : "none", data, board });
    else if (missing) setState({ status: "none", data: null, board: null });
    else setState((s) => (s.data ? s : { ...s, status: "down" }));
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
  // own saves and removals return fresh squads: use them, and drop any older answer still on its way
  const setMine = useCallback((mine: BlitzMine) => { seq.current++; setState((s) => (s.data ? { ...s, data: { ...s.data, mine } } : s)); }, []);
  return { ...state, load, setMine };
}

// ---------------------------------------------------------------- pieces
function Crest({ name, lg }: { name: string; lg?: boolean }) {
  return <span className={`bz-crest${lg ? " lg" : ""}`} aria-hidden="true">{code(name)}</span>;
}

function Token({ gold, empty }: { gold?: boolean; empty?: boolean }) {
  return <span className={`bz-tok${gold ? " gold" : ""}${empty ? " empty" : ""}`} aria-hidden="true">{gold && <span className="bz-cap">×2</span>}</span>;
}

type Slotted = { name: string; mt: string; captain: boolean };

function Card(props: {
  n: number; fx: BlitzFixture | null; badge: React.ReactNode; right?: React.ReactNode; sub: React.ReactNode;
  action?: React.ReactNode; slots: Slotted[]; holes?: string[]; note?: string; locked: boolean; active: boolean; label: string; unsetCaptain?: boolean;
}) {
  const { n, fx, badge, right, action, sub, slots, holes = [], note, locked, active, label, unsetCaptain } = props;
  return (
    <article className={`e2-card bz-card${active ? " is-active" : ""}`} aria-label={label}>
      <div className="bz-hd">
        <span className="bz-slot" aria-hidden="true">{n}</span>
        <span className="bz-teams">
          {fx ? <><Crest name={fx.home.name} />{fx.home.name} <span className="v">v</span> <Crest name={fx.away.name} />{fx.away.name}</> : "Fixture"}
        </span>
        <span className="bz-r">{right}{badge}</span>
      </div>
      <div className="bz-subrow"><p className="bz-sub">{sub}</p>{action}</div>
      <div className="bz-slots">
        {slots.map((s, i) => (
          <div key={i} className={`bz-sl${s.captain ? " capsl" : ""}`}>
            <span className={`bz-tok${s.captain ? " gold" : ""}`} aria-hidden="true">
              {s.captain ? <span className="bz-cap">×2</span> : unsetCaptain ? <span className="bz-cap unset" title="Captain not chosen" /> : null}
            </span>
            <span className="nm">{s.name}</span>
            <span className="mt">{s.mt}</span>
          </div>
        ))}
        {holes.map((h, i) => (
          <div key={`h${i}`} className="bz-sl hole"><Token empty />{h && <span className="nm">{h}</span>}</div>
        ))}
      </div>
      {note && <p className="bz-note">{note}</p>}
      <span className={`bz-lock${locked ? "" : " open"}`} role="img" aria-label={locked ? "Locked" : "Not locked yet"} />
    </article>
  );
}

function PickerRow({ pl, club, picked, captain, off, reason, onPick, onCaptain }: {
  pl: BlitzPlayer; club: string; picked: boolean; captain: boolean; off: boolean; reason: string; onPick: () => void; onCaptain: () => void;
}) {
  const pos = posOf(pl.position);
  const avg = pl.avg != null ? pl.avg.toFixed(1) : "";
  const base = `${pl.name}, ${pos}, ${club}${avg ? `, average ${avg} points` : ""}`;
  return (
    <div className={`bz-row${picked ? " picked" : ""}${off ? " off" : ""}`}>
      <button type="button" className="bz-pick" aria-pressed={picked} disabled={off} onClick={onPick} title={pl.name}
        aria-label={`${base}${picked ? (captain ? ", picked, captain" : ", picked") : off ? `, not available: ${reason}` : ""}`}>
        <span className="pos">{pos}</span><span className="nm">{pl.name}</span><span className="avg">{avg}</span>
        {picked && <span className="sub"><span className="pk">&#10003; {captain ? "Captain, double points" : "Picked"}</span></span>}
      </button>
      {picked && (
        <button type="button" className="bz-c" aria-pressed={captain} onClick={onCaptain} title={captain ? "Captain" : "Make captain"}
          aria-label={captain ? `${pl.name} is captain` : `Make ${pl.name} captain`}>
          <span className={captain ? "bz-cap" : "bz-cap ring"} aria-hidden="true">{captain ? "×2" : "C"}</span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the page
export default function BlitzView() {
  const { wallet, token, me, signIn, signingIn } = useAuth();
  const signedIn = Boolean(wallet && token);
  const tk = signedIn ? token : null;
  const { status, data, board, load, setMine } = useBlitz(tk);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), TICK_MS); return () => clearInterval(i); }, []);

  const day = data?.contest?.day ?? null;
  const allowed = Math.max(0, Math.min(3, data?.squads_allowed ?? 3));
  const fixtures = useMemo(() => [...(data?.fixtures ?? [])].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)), [data?.fixtures]);
  const fxById = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const mine = data?.mine ?? null;
  const saved = useCallback((slot: number) => mine?.squads.find((s) => s.slot === slot) ?? null, [mine]);
  // open for picking: the server says so and the kick-off has not passed on this clock either
  const pickable = useCallback((f: BlitzFixture) => f.can_pick && (now == null || Date.parse(f.kickoff) > now), [now]);

  // local work: which fixture each squad slot uses, and the unsaved picks. Guests keep these in memory only.
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [active, setActive] = useState<number | null>(null);
  const [club, setClub] = useState<0 | 1>(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const seenDay = useRef<string | null>(null);

  // a new matchday starts clean
  useEffect(() => {
    if (!day || seenDay.current === day) return;
    if (seenDay.current != null) { setSlots([null, null, null]); setDrafts({}); setActive(null); setNotice(null); }
    seenDay.current = day;
  }, [day]);

  // saved squads fill their slots (once a wallet signs in, or after a reload); unsaved picks stay as they are
  const savedKey = (mine?.squads ?? []).map((s) => `${s.slot}:${s.fixture_id}:${s.players.map((p) => p.id).join(",")}:${s.captain_id}`).join("|");
  useEffect(() => {
    if (!mine) return;
    setSlots((cur) => { const next = [...cur]; mine.squads.forEach((s) => { next[s.slot - 1] = s.fixture_id; }); return next; });
    setDrafts((cur) => { const next = { ...cur }; mine.squads.forEach((s) => { if (!next[s.fixture_id]) next[s.fixture_id] = fromSaved(s); }); return next; });
    setActive((a) => a ?? (mine.squads.find((s) => !s.locked && s.state === "open")?.slot ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  // a fixture that kicked off before its squad was saved can no longer be picked: free the slot
  useEffect(() => {
    if (now == null) return;
    setSlots((cur) => {
      let changed = false;
      const next = cur.map((id, i) => {
        const f = id != null ? fxById.get(id) : null;
        if (f && !pickable(f) && !saved(i + 1)) { changed = true; return null; }
        return id;
      });
      return changed ? next : cur;
    });
  }, [now, fxById, pickable, saved]);

  // refetch once when an open fixture's kick-off passes, so locks and live states appear without waiting
  const kicked = useRef(new Set<number>());
  useEffect(() => {
    if (now == null) return;
    const fresh = fixtures.filter((f) => f.can_pick && Date.parse(f.kickoff) <= now && !kicked.current.has(f.id));
    if (fresh.length) { fresh.forEach((f) => kicked.current.add(f.id)); load(); }
  }, [now, fixtures, load]);

  const freeSlot = slots.slice(0, allowed).indexOf(null);
  const slotOfFx = (id: number) => slots.slice(0, allowed).indexOf(id);

  function chooseFixture(f: BlitzFixture) {
    const at = slotOfFx(f.id);
    if (at >= 0) { setActive(at + 1); setClub(0); setNotice(null); return; }
    if (freeSlot < 0 || !pickable(f)) return;
    setSlots((cur) => { const next = [...cur]; next[freeSlot] = f.id; return next; });
    setDrafts((cur) => (cur[f.id] ? cur : { ...cur, [f.id]: { players: [], captain: null } }));
    setActive(freeSlot + 1); setClub(0); setNotice(null);
  }

  const setDraft = (fid: number, fn: (d: Draft) => Draft) =>
    setDrafts((cur) => ({ ...cur, [fid]: fn(cur[fid] ?? { players: [], captain: null }) }));

  function togglePlayer(fid: number, id: number) {
    setNotice(null);
    setDraft(fid, (d) => d.players.includes(id)
      ? { players: d.players.filter((x) => x !== id), captain: d.captain === id ? null : d.captain }
      : d.players.length >= 3 ? d : { ...d, players: [...d.players, id] });
  }
  const makeCaptain = (fid: number, id: number) => { setNotice(null); setDraft(fid, (d) => ({ ...d, captain: d.captain === id ? null : id })); };

  async function removeSquad(slot: number) {
    const fid = slots[slot - 1];
    if (fid == null) return;
    setNotice(null);
    if (saved(slot) && token && day) {
      setBusy(true);
      try { setMine(await deleteBlitzSquad(day, slot, token)); }
      catch (e) { setNotice({ slot, kind: "error", text: (e as ApiError).message }); setBusy(false); return; }
      setBusy(false);
    }
    setSlots((cur) => { const next = [...cur]; next[slot - 1] = null; return next; });
    setDrafts((cur) => { const next = { ...cur }; delete next[fid]; return next; });
    setActive((a) => (a === slot ? null : a));
  }

  async function saveSquad(slot: number, fid: number) {
    const d = drafts[fid];
    if (!d || !token || !day) return;
    setBusy(true); setNotice(null);
    const body: BlitzBody = { fixture_id: fid, player_ids: d.players, captain_id: d.captain };
    try {
      const fresh = await saveBlitzSquad(day, slot, body, token);
      setMine(fresh);
      const s = fresh.squads.find((q) => q.slot === slot);
      if (s) setDrafts((cur) => ({ ...cur, [fid]: fromSaved(s) }));
      setNotice({ slot, kind: "ok", text: `Squad ${slot} saved. You can change it until kick-off.` });
    } catch (e) {
      setNotice({ slot, kind: "error", text: (e as ApiError).message });   // the server's own words, as they are
    }
    setBusy(false);
  }

  // the active squad, if it can still be edited
  const activeFxId = active != null ? slots[active - 1] : null;
  const activeFx = activeFxId != null ? fxById.get(activeFxId) ?? null : null;
  const activeSaved = active != null ? saved(active) : null;
  const editable = activeFx != null && pickable(activeFx) && !(activeSaved && (activeSaved.locked || activeSaved.state !== "open"));
  const draft: Draft = (editable && activeFx && drafts[activeFx.id]) || { players: [], captain: null };
  const ready = editable && activeFx ? readiness(activeFx, draft) : null;
  const sig = editable && activeFx && ready?.ready ? sigOf(activeFx.id, draft) : null;

  // ask the server whether this squad is valid (works for guests too); answer matched to the picks by signature
  useEffect(() => {
    if (!sig || !activeFx) return;
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const r = await checkBlitzSquad({ fixture_id: activeFx.id, player_ids: draft.players, captain_id: draft.captain }, tk);
        if (!dead) setVerdict({ sig, ok: r.ok, problems: r.problems });
      } catch { if (!dead) setVerdict({ sig, ok: true, problems: [] }); }   // the check is advice; the save is the judge
    }, 250);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, tk]);

  // ---- counts for the header
  const complete = (fid: number | null) => { const f = fid != null ? fxById.get(fid) : null; const d = fid != null ? drafts[fid] : null; return f && d ? readiness(f, d).ready : false; };
  const readyCount = signedIn
    ? (mine?.squads.length ?? 0)
    : slots.slice(0, allowed).filter((id) => complete(id)).length;

  // ---- render
  if (status === "loading" || status === "down" || status === "none") {
    const text = status === "loading" ? "Loading the matchday" : status === "down" ? "Can't reach elevn right now." : "No matchday scheduled yet";
    return (
      <div className="e2-page bz">
        <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="e2-ph">
          <div><span className="e2-eyebrow">Matchday Blitz</span><h1 className="bz-h1">Pick your squads</h1></div>
          <div className="w"><span className="e2-word" aria-hidden="true">Blitz</span></div>
        </div>
        <div className="e2-card bz-alone" style={{ marginBottom: 96 }} aria-busy={status === "loading" || undefined}>
          <h2 className="h">Blitz</h2>
          <p>{text}</p>
          {status === "none" && <p className="e2-small e2-muted">Fixtures appear here as soon as a matchday is set.</p>}
          {status === "down" && <p className="e2-small e2-muted">Trying again every 30 seconds.</p>}
          {status !== "loading" && <Link className="e2-btn e2-btn-line" href="/today">Back to Today</Link>}
        </div>
      </div>
    );
  }

  const contest = data!.contest!;
  const live = contest.state === "live";
  const grouped = new Map<string, BlitzFixture[]>();
  fixtures.forEach((f) => { const k = f.league || ""; grouped.set(k, [...(grouped.get(k) ?? []), f]); });
  const noFree = freeSlot < 0;
  const blocked = signedIn && me?.access != null && !me.access.blitz;

  function fixtureRow(f: BlitzFixture) {
    const at = slotOfFx(f.id);
    const open = pickable(f);
    const isLive = f.state === "live";
    const over = ["full_time", "ft", "finished", "banked"].includes(f.state);
    const disabledRow = !open || (at < 0 && noFree);
    const tail = isLive ? <><span className="e2-badge live">Live</span></>
      : over ? "Full time"
      : open ? (now == null ? "" : `in ${until(Date.parse(f.kickoff) - now)}`)
      : "Kicked off";
    return (
      <button key={f.id} type="button" className={`bz-fxr${!open ? " dim" : ""}${at >= 0 && at + 1 === active ? " sel" : ""}${noFree ? " nofree" : ""}${at >= 0 ? " has" : ""}`}
        aria-pressed={at >= 0 ? at + 1 === active : false} disabled={disabledRow}
        onClick={() => chooseFixture(f)}
        aria-label={`${f.home.name} v ${f.away.name}, ${ukTime(f.kickoff)}${at >= 0 ? `, squad ${at + 1}` : ""}`}>
        <span>{at >= 0 ? <span className="bz-slot">{at + 1}</span> : null}</span>
        <span className="t">{ukTime(f.kickoff)}</span>
        <span className="m">{f.home.name} <span className="v">v</span> {f.away.name}</span>
        <span className="s">{tail}</span>
      </button>
    );
  }

  function squadCard(n: number) {
    const sv = saved(n);
    const fid = slots[n - 1];
    const f = fid != null ? fxById.get(fid) ?? null : null;
    const lg = f?.league ? `${f.league} · ` : "";
    // read-only: locked, live, full time or banked
    if (sv && (sv.locked || sv.state !== "open" || (f && !pickable(f)))) {
      const fx = fxById.get(sv.fixture_id) ?? null;
      const badge = sv.state === "live" ? <span className="e2-badge live">Live</span>
        : sv.state === "full_time" ? <span className="e2-badge ft">Full time</span>
        : sv.state === "banked" ? <span className="e2-badge bz-banked">Banked</span>
        : <span className="e2-badge bz-lockd">Locked</span>;
      const ordered = [...sv.players].sort((a, b) => Number(b.is_captain) - Number(a.is_captain));
      return (
        <Card key={n} n={n} fx={fx} locked active={false} label={`Squad ${n}, ${fx ? `${fx.home.name} v ${fx.away.name}, ` : ""}${sv.state === "open" ? "locked" : sv.state.replace("_", " ")}`}
          badge={badge} right={sv.points != null ? <span><b>{sv.points}</b> pts</span> : undefined}
          action={sv.state === "banked" && day ? <Link className="bz-rm" href={`/blitz/banked?day=${day}&slot=${n}`} aria-label={`Open banked result for squad ${n}`}>Banked result</Link> : undefined}
          sub={<>{`${lg}kick-off ${ukTime(sv.kickoff)} · `}<span className="bz-kick">Locked at kick-off</span></>}
          slots={ordered.map((p) => ({
            name: p.name, captain: p.is_captain,
            mt: `${posOf(p.position)}${p.points != null ? ` · ${p.points}${p.is_captain ? " ×2" : ""}` : ""}`,
          }))} />
      );
    }
    if (f && fid != null) {
      const d = drafts[fid] ?? { players: [], captain: null };
      const r = readiness(f, d);
      const all = playersOf(f);
      const dirty = !sv || sigOf(fid, d) !== sigOf(fid, fromSaved(sv));
      const picked = d.players.map((id) => all.get(id)).filter(Boolean) as { p: BlitzPlayer; team: BlitzTeam }[];
      const holes: string[] = [];
      for (let i = picked.length; i < 3; i++) {
        const lack = picked.length > 0 && 3 - picked.length === holes.length + 1 ? (r.sides[0] === 0 ? f.home.name : r.sides[1] === 0 ? f.away.name : null) : null;
        holes.push(lack && i === 2 ? `Pick 1 from ${lack}` : i === picked.length ? "Pick a player" : "");
      }
      const badge = sv && !dirty ? <span className="e2-badge open">Saved</span>
        : r.ready ? <span className="e2-badge steel">{sv ? "Changes not saved" : "Ready · not saved"}</span>
        : <span className="e2-badge steel">{picked.length} of 3 picked</span>;
      const leftMs = now == null ? null : Date.parse(f.kickoff) - now;
      return (
        <Card key={n} n={n} fx={f} locked={false} active={active === n}
          label={`Squad ${n}, ${f.home.name} v ${f.away.name}, ${sv && !dirty ? "saved" : r.ready ? "ready, not saved" : `${picked.length} of 3 picked`}`}
          badge={badge} action={<button type="button" className="bz-rm" disabled={busy} onClick={() => removeSquad(n)} aria-label={`Remove squad ${n}`}>Remove</button>}
          sub={<>{`${lg}kick-off ${ukTime(f.kickoff)} · `}<span className="bz-kick">{leftMs == null ? "Locks at kick-off" : `Locks in ${until(leftMs)}${sv && !dirty ? "" : " once saved"}`}</span></>}
          slots={picked.map(({ p, team }) => ({ name: p.name, captain: d.captain === p.id, mt: `${posOf(p.position)} · ${code(team.name)}` }))}
          holes={holes} unsetCaptain={d.captain == null && picked.length > 0}
          note={picked.length === 3 && d.captain == null ? "Choose a captain. Every squad needs one on double points." : undefined} />
      );
    }
    return (
      <article key={n} className="e2-card bz-card empty" aria-label={`Squad ${n}, empty`}>
        <div className="bz-empty-hd">
          <span className="bz-slot" aria-hidden="true">{n}</span>
          <span className="bz-teams e2-muted" style={{ fontWeight: 600 }}>Squad {n} is empty</span>
          <span className="bz-r"><span>{noFree && fixtures.every((x) => !pickable(x)) ? "No fixtures left to choose" : <>Choose any fixture<span className="bz-lr"> on the left</span></>}</span></span>
        </div>
        <div className="bz-slots" style={{ marginTop: 16 }}>
          {[0, 1, 2].map((i) => <div key={i} className="bz-sl hole"><Token empty /></div>)}
        </div>
      </article>
    );
  }

  // ---- the picker for the active squad
  function picker() {
    if (!editable || !activeFx || !ready || active == null) {
      return (
        <div className="e2-card bz-alone" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 17 }}>{fixtures.some(pickable) ? "Choose a fixture to pick players for a squad." : "Every fixture has kicked off, so squads can no longer change."}</p>
        </div>
      );
    }
    const f = activeFx;
    const sv = activeSaved;
    const dirty = !sv || sigOf(f.id, draft) !== sigOf(f.id, fromSaved(sv));
    const sides = ready.sides;
    const teams: [BlitzTeam, BlitzTeam] = [f.home, f.away];
    const full = draft.players.length >= 3;
    const hasAvg = [...f.home.players, ...f.away.players].some((p) => p.avg != null);
    const sideLabel = (i: 0 | 1) => `${i === 0 ? "Home" : "Away"} · ${sides[i] ? `${sides[i]} picked` : "pick 1"}`;
    const checking = Boolean(sig && verdict?.sig !== sig);
    const problems = sig && verdict?.sig === sig && !verdict.ok ? verdict.problems : [];
    const nt = notice && notice.slot === active ? notice : null;

    let reason: React.ReactNode;
    if (nt?.kind === "error") reason = <span className="bz-err" role="alert">Not saved. {nt.text}</span>;
    else if (!ready.ready) reason = ready.hint;
    else if (checking) reason = "Checking your squad…";
    else if (problems.length) reason = problems.join(" ");
    else if (blocked) reason = `Hold ${count(NEED)} $ELEVN to save squads.`;
    else if (nt?.kind === "ok") reason = <span role="status">{nt.text}</span>;
    else if (!dirty) reason = "Saved. You can change it until kick-off.";
    else reason = signedIn ? `Ready. Squad ${active} can change until kick-off.` : "Ready. Connect a wallet to save it; nothing is saved as a guest.";
    const canSave = ready.ready && !checking && problems.length === 0 && !blocked && dirty && !busy;

    return (
      <div className="e2-card bz-panel">
        <div className="bz-panelhd">
          <div><span className="e2-eyebrow">Squad {active} · choose 3 players</span><h2 className="bz-h3">{f.home.name} v {f.away.name}</h2></div>
          <span className="e2-small e2-muted">Line-ups confirmed<br />about an hour before kick-off</span>
        </div>
        <div className="bz-sw" role="group" aria-label="Show one club">
          {teams.map((t, i) => (
            <button key={t.id} type="button" className="bz-swb" aria-pressed={club === i} onClick={() => setClub(i as 0 | 1)}>
              {t.name}{!sides[i] ? " · pick 1" : ""}
            </button>
          ))}
        </div>
        <div className="bz-hdrow">
          {teams.map((t, i) => (
            <div key={t.id} className="bz-team"><Crest name={t.name} lg /><span>{t.name}<br /><span className="e2-small">{sideLabel(i as 0 | 1)}</span></span></div>
          ))}
        </div>
        <div className="bz-scroll" data-show={club} role="region" aria-label={`Players for ${f.home.name} v ${f.away.name}, scrolls`} tabIndex={0}>
          <div className="bz-cols">
            {teams.map((t, i) => (
              <div key={t.id} className="bz-col">
                <div className="bz-team bz-colhd"><Crest name={t.name} lg /><span>{t.name}<br /><span className="e2-small">{sideLabel(i as 0 | 1)}</span></span></div>
                {POS_ORDER.map((pos) => {
                  const list = t.players.filter((p) => posOf(p.position) === pos);
                  const sorted = hasAvg ? [...list].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1)) : list;
                  return (
                    <section key={pos} className="bz-grp" aria-label={`${t.name} ${POS_NAME[pos].toLowerCase()}`}>
                      <h3 className="bz-ph"><span>{POS_NAME[pos]}</span><span>{hasAvg ? "Avg pts" : ""}</span></h3>
                      {sorted.map((pl) => {
                        const picked = draft.players.includes(pl.id);
                        const clubFull = sides[i] >= 2;
                        const off = !picked && (full || clubFull);
                        return (
                          <PickerRow key={pl.id} pl={pl} club={t.name} picked={picked} captain={draft.captain === pl.id} off={off}
                            reason={full ? "squad is full" : "one from each club"}
                            onPick={() => togglePlayer(f.id, pl.id)} onCaptain={() => makeCaptain(f.id, pl.id)} />
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="bz-save">
          <p className="e2-small" aria-live="polite">{reason}</p>
          {signedIn
            ? <button type="button" className={`e2-btn${canSave ? " e2-btn-gold" : ""}`} disabled={!canSave} onClick={() => saveSquad(active, f.id)}>{busy ? "Saving…" : `Save squad ${active}`}</button>
            : <button type="button" className="e2-btn e2-btn-line" onClick={signIn} disabled={signingIn}>{signingIn ? "Check your wallet…" : "Connect wallet to save"}</button>}
        </div>
      </div>
    );
  }

  // ---- the live board
  function boardPanel() {
    const rows = board?.rows ?? [];
    const top = rows.filter((r) => r.place != null && r.place <= 5);
    const you = board?.you ?? null;
    const fifth = Math.floor(contest.pot_sol * 0.05 * 1e9);
    const fifthText = `${contest.pot_estimated ? "about " : ""}${sol(top.find((r) => r.place === 5)?.prize_lamports || fifth)} SOL`;
    const line = top.length ? top[top.length - 1].points : null;
    const squadsOpen = (mine?.squads ?? []).filter((s) => s.state === "open").length;
    const label = (r: { username: string | null; wallet: string }) => r.username || shortWallet(r.wallet);
    return (
      <aside className="e2-glass bz-board" aria-label="Live matchday board">
        <div className="bz-bhd"><span className="e2-eyebrow">{live ? "Live matchday board" : "Matchday board"}</span>{live && <span className="e2-badge live">Live</span>}</div>
        <p className="e2-small e2-muted" style={{ marginBottom: 8 }}>
          {board ? `Day total · ${count(board.entrants)} player${board.entrants === 1 ? "" : "s"}` : "Day total"}
        </p>
        {top.length === 0 && <p className="e2-small e2-muted" style={{ padding: "11px 0", borderTop: "1px solid var(--line)" }}>No squads on the board yet.</p>}
        {top.map((r) => (
          <div key={r.wallet} className={`bz-brow${r.you ? " you" : ""}`}>
            <b>{r.place}</b><span className="nm">{label(r)}{r.you && <span className="bz-you">You</span>}</span><b>{r.points}</b>
          </div>
        ))}
        <div className="bz-pline"><span>Prize line</span></div>
        {you && (you.place == null || you.place > 5) && (
          <div className="bz-brow you"><b>{you.place ?? "–"}</b><span className="nm">{label(you)}<span className="bz-you">You</span></span><b>{you.points}</b></div>
        )}
        <div className="bz-lines">
          {signedIn ? (
            <>
              <p className="e2-small" style={{ fontWeight: 600 }}>
                {you && you.place != null && you.place <= 5
                  ? `If the day ended now you'd be ${you.place}${["st", "nd", "rd", "th", "th"][you.place - 1]} and win ${sol(you.prize_lamports)} SOL.`
                  : `If the day ended now you'd win nothing yet. 5th place pays ${fifthText}.`}
              </p>
              {mine && mine.squads.length > 0 && (
                <p className="e2-small e2-muted" style={{ marginTop: 8 }}>
                  {`You have ${mine.total ?? 0} so far`}{line != null && (mine.total ?? 0) < line ? `, ${line - (mine.total ?? 0)} behind the prize line` : ""}.
                  {squadsOpen ? ` ${squadsOpen} squad${squadsOpen === 1 ? " is" : "s are"} still open.` : ""}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="e2-small" style={{ fontWeight: 600 }}>Connect a wallet to see where your squads would place.</p>
              <p className="e2-small e2-muted" style={{ marginTop: 8 }}>Top 5 are paid, 5th place pays {fifthText} on this matchday. Guests see the board but are not on it.</p>
            </>
          )}
        </div>
      </aside>
    );
  }

  const stamp = now == null ? dayLabel(contest.day) : `${dayLabel(contest.day)} · ${new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
  const colStyle = (n: number) => ({ "--n": n } as React.CSSProperties);

  return (
    <div className="e2-page bz">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      {!signedIn && <p className="bz-banner" role="note">You&apos;re trying elevn as a guest. Connect a wallet to save your squads and play for prizes.</p>}
      <div className="e2-ph">
        <div>
          <span className="e2-eyebrow">{stamp}</span>
          <h1 className="bz-h1">Pick your squads</h1>
          <p className="bz-lead">{allowed >= 3 ? "Three squads on any three of today's matches, three players each." : `${allowed === 1 ? "One squad" : "Two squads"} on today's matches, three players each.`} Each squad locks at its own kick-off.</p>
          <p className="bz-meta">{readyCount} <small>of {allowed} ready{!signedIn ? " · nothing saved yet" : ""}</small></p>
        </div>
        <div className="w"><span className="e2-word" aria-hidden="true">Blitz</span></div>
      </div>

      <div className="e2-g" style={{ paddingBottom: 128, alignItems: "start" }}>
        <div className="e2-col bz-fx" style={colStyle(4)}>
          <span className="e2-eyebrow bz-fxhd">{`Today's ${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"}`}</span>
          <div className="e2-card bz-flist">
            {[...grouped.entries()].map(([lg, list]) => (
              <div key={lg || "all"} className="bz-group">
                {lg && <span className="e2-eyebrow">{lg}</span>}
                {list.map(fixtureRow)}
              </div>
            ))}
          </div>
          {noFree && fixtures.some(pickable) && <p className="bz-hint">All {allowed} squads have a fixture. Remove one to choose another.</p>}
        </div>
        <div className="e2-col bz-bd" style={colStyle(5)}>
          <div className="e2-stack" style={{ "--gap": "40px" } as React.CSSProperties}>
            <div>
              <span className="e2-eyebrow">Your squads</span>
              <div className="e2-stack" style={{ "--gap": "32px", marginTop: 14 } as React.CSSProperties}>
                {Array.from({ length: allowed }, (_, i) => squadCard(i + 1))}
              </div>
            </div>
            {picker()}
          </div>
        </div>
        <div className="e2-col bz-bo" style={colStyle(3)}>{boardPanel()}</div>
      </div>
    </div>
  );
}
