"use client";

// Pick team: the whole squad in one place. The pitch always shows 11 starters and 4 substitutes;
// an empty place is a "+" that opens the player list for that position, a player opens their
// card (captain, vice-captain, substitute, transfer out). Picking players, the starting eleven and
// transfers all save together; the API checks every rule (budget, clubs, formation) before it does.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, ApiError, BUDGET, CheckResult, Fixture, fmtM, fmtPts, Picks, Player, Position, POSITIONS, SECTION, SHORT, SquadView,
} from "@/lib/api";
import { clubCodes } from "@/lib/clubs";
import { cannotFinish, cheapestFill } from "@/lib/squad";
import { Countdown, Loading, Select } from "@/components/ui";
import { EmptySlot, LINES, Pitch, Shirt, surname } from "@/components/pitch/Pitch";
import PlayerCard from "@/components/PlayerCard";

type Slot = number | Position;                                  // a player, or an open place for that position
type Lineup = { starters: Slot[]; bench: Slot[]; captain: number | null; vice_captain: number | null };
type Loc = { list: "starters" | "bench"; i: number };

const MIN_XI: Record<Position, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const MAX_XI: Record<Position, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
const EMPTY: Lineup = {
  starters: ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"],
  bench: ["GK", "DEF", "MID", "FWD"], captain: null, vice_captain: null,
};
const filled = (s: Slot): s is number => typeof s === "number";
const toPicks = (l: Lineup): Picks => ({ starters: l.starters.filter(filled), bench: l.bench.filter(filled),
  captain: l.captain, vice_captain: l.vice_captain });

// Saved or drafted picks laid onto the 15 places; a partial draft fills the open places by position.
function toLineup(p: Partial<Picks> | null, byId: Map<number, Player>): Lineup {
  if (p?.starters?.length === 11 && p.bench?.length === 4) return { starters: [...p.starters], bench: [...p.bench],
    captain: p.captain ?? null, vice_captain: p.vice_captain ?? null };
  const l: Lineup = { ...EMPTY, starters: [...EMPTY.starters], bench: [...EMPTY.bench] };
  for (const pid of [...(p?.starters ?? []), ...(p?.bench ?? [])]) {
    const pos = byId.get(pid)?.position;
    if (!pos) continue;
    const i = l.starters.indexOf(pos);
    if (i >= 0) l.starters[i] = pid;
    else { const j = l.bench.indexOf(pos); if (j >= 0) l.bench[j] = pid; }
  }
  l.captain = p?.captain && l.starters.includes(p.captain) ? p.captain : null;
  l.vice_captain = p?.vice_captain && l.starters.includes(p.vice_captain) ? p.vice_captain : null;
  return l;
}

export default function SquadPlanner({ league, id, token, upcoming }: { league: string; id: string; token: string; upcoming: number | null }) {
  const [squad, setSquad] = useState<SquadView | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [saved, setSaved] = useState<Lineup | null>(null);
  const [selected, setSelected] = useState<Loc | null>(null);      // the player whose card is open
  const [swapFrom, setSwapFrom] = useState<Loc | null>(null);      // substituting: waiting for the other player
  const [filling, setFilling] = useState<Loc | null>(null);        // the open place the list is filling
  const [listOpen, setListOpen] = useState(false);                 // the player list on a phone
  const [view, setView] = useState<"pitch" | "list">("pitch");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const codes = useMemo(() => clubCodes(players.map((p) => p.club.name)), [players]);

  useEffect(() => {
    api<{ players: Player[] }>(`/leagues/${league}/players`).then((r) => setPlayers(r.players)).catch((e) => setError(e.message));
    api<SquadView>(`/squads/${id}`, { token }).then(setSquad).catch((e) => setError(e.message));
  }, [league, id, token]);
  useEffect(() => {
    if (!squad || !players.length || loaded.current) return;
    const s = toLineup(squad.picks, byId);
    setSaved(s);
    setLineup(squad.draft ? toLineup(squad.draft, byId) : s);
    loaded.current = true;
  }, [squad, players, byId]);
  const fixturesFor = squad?.window?.number ?? upcoming;
  useEffect(() => {
    if (fixturesFor == null) return;
    api<{ fixtures: Fixture[] }>(`/leagues/${league}/gameweeks/${fixturesFor}/fixtures`).then((r) => setFixtures(r.fixtures)).catch(() => {});
  }, [league, fixturesFor]);

  const picks = useMemo(() => (lineup ? toPicks(lineup) : null), [lineup]);
  const changed = lineup && saved ? JSON.stringify(toPicks(lineup)) !== JSON.stringify(toPicks(saved)) : false;
  const count = picks ? picks.starters.length + picks.bench.length : 0;

  // keep the draft and preview what a save would do, a moment after each change
  useEffect(() => {
    if (!picks || !loaded.current) return;
    const t = setTimeout(() => {
      api(`/squads/${id}/draft`, { method: "PUT", body: picks, token }).catch(() => {});
      if (squad?.window && count === 15) api<CheckResult>(`/squads/${id}/check`, { body: picks, token }).then(setCheck).catch(() => {});
      else setCheck(null);
    }, 500);
    return () => clearTimeout(t);
  }, [picks, id, token, squad?.window, count]);

  const opp = useMemo(() => {
    const m = new Map<number, { name: string; home: boolean }[]>();
    for (const f of fixtures) {
      m.set(f.home.id, [...(m.get(f.home.id) ?? []), { name: f.away.name, home: true }]);
      m.set(f.away.id, [...(m.get(f.away.id) ?? []), { name: f.home.name, home: false }]);
    }
    return m;
  }, [fixtures]);
  const nextFix = (p?: Player) => {
    const o = p && opp.get(p.club.id);
    return o?.length ? o.map((x) => `${codes.get(x.name) ?? x.name.slice(0, 3)} (${x.home ? "H" : "A"})`).join(", ") : "No match";
  };

  const at = (l: Lineup, loc: Loc) => l[loc.list][loc.i];
  const posOf = (s: Slot) => (filled(s) ? byId.get(s)?.position : s);
  const formationOk = (starters: Slot[]) => POSITIONS.every((p) => {
    const n = starters.filter((s) => posOf(s) === p).length;
    return n >= MIN_XI[p] && n <= MAX_XI[p];
  });
  const canSwap = useCallback((a: Loc, b: Loc) => {
    if (!lineup || (a.list === b.list && a.i === b.i)) return false;
    if (a.list === b.list) return a.list === "bench" && posOf(at(lineup, a)) !== "GK" && posOf(at(lineup, b)) !== "GK";
    const next = { ...lineup, starters: [...lineup.starters], bench: [...lineup.bench] };
    const va = at(lineup, a), vb = at(lineup, b);
    next[a.list][a.i] = vb; next[b.list][b.i] = va;
    return formationOk(next.starters);
  }, [lineup]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (f: (l: Lineup) => Lineup) => { setNotice(null); setLineup((l) => (l ? f(l) : l)); };
  const tidyRoles = (l: Lineup): Lineup => ({ ...l,
    captain: l.captain != null && l.starters.includes(l.captain) ? l.captain : null,
    vice_captain: l.vice_captain != null && l.starters.includes(l.vice_captain) ? l.vice_captain : null });
  const swap = (a: Loc, b: Loc) => change((l) => {
    const next = { ...l, starters: [...l.starters], bench: [...l.bench] };
    const va = at(l, a), vb = at(l, b);
    next[a.list][a.i] = vb; next[b.list][b.i] = va;
    return tidyRoles(next);
  });
  const removeAt = (loc: Loc) => change((l) => {
    const next = { ...l, starters: [...l.starters], bench: [...l.bench] };
    const v = at(l, loc);
    if (filled(v)) next[loc.list][loc.i] = byId.get(v)?.position ?? "MID";
    return tidyRoles(next);
  });
  const add = (p: Player) => {
    if (!lineup) return;
    if (picks && [...picks.starters, ...picks.bench].includes(p.id)) return;
    const sameClub = [...lineup.starters, ...lineup.bench].filter((s) => filled(s) && byId.get(s)?.club.id === p.club.id).length;
    if (sameClub >= MAX_PER_CLUB) { setError(`You already have ${MAX_PER_CLUB} ${p.club.name} players. Transfer one out to add another.`); return; }
    const target = filling && at(lineup, filling) === p.position ? filling
      : (["starters", "bench"] as const).map((list) => ({ list, i: lineup[list].indexOf(p.position) })).find((x) => x.i >= 0);
    if (!target) { setError(`Your squad already has ${QUOTA_TEXT[p.position]}. Transfer one out first.`); return; }
    setError(null);
    change((l) => { const next = { ...l, starters: [...l.starters], bench: [...l.bench] }; next[target.list][target.i] = p.id; return next; });
    setFilling(null); setListOpen(false);
  };
  const tap = (loc: Loc) => {
    if (!lineup) return;
    if (swapFrom) {
      if (canSwap(swapFrom, loc)) swap(swapFrom, loc);
      setSwapFrom(null); setSelected(null);
      return;
    }
    const v = at(lineup, loc);
    if (filled(v)) setSelected(loc);
    else { setFilling(loc); setListOpen(true); }
  };
  const setRole = (pid: number, role: "captain" | "vice_captain", on: boolean) => change((l) => {
    const other = role === "captain" ? "vice_captain" : "captain";
    if (!on) return { ...l, [role]: l[role] === pid ? null : l[role] };
    return { ...l, [role]: pid, [other]: l[other] === pid ? l[role] : l[other] };
  });
  const save = async () => {
    if (!picks || !squad) return;
    setSaving(true); setError(null);
    try {
      const r = await api<CheckResult>(`/squads/${id}/save`, { body: picks, token });
      setCheck(r); setSaved(lineup);
      setNotice(`Saved for gameweek ${squad.window?.number}` + (r.penalty ? `, ${r.penalty} points for extra transfers` : ""));
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.detail && typeof e.detail === "object") setCheck(e.detail as CheckResult);
      else setError((e as Error).message);
    } finally { setSaving(false); }
  };

  if (!lineup || !squad) return error ? <p className="text-danger">{error}</p> : <Loading label="Loading your squad" />;

  const all = [...lineup.starters, ...lineup.bench].filter(filled);
  const cost = all.reduce((s, pid) => s + (byId.get(pid)?.price ?? 0), 0);
  const budget = squad.budget ?? BUDGET;
  // warn as soon as the money left can't fill the open places, before the player gets stuck on the last pick
  const openPlaces = [...lineup.starters, ...lineup.bench].filter((s): s is Position => !filled(s));
  const leastToFill = cheapestFill(players, new Set(all), openPlaces);
  const stuck = openPlaces.length > 0 && cannotFinish(budget - cost, leastToFill);
  const problems = check && !check.ok ? check.problems : [];
  const transfers = check?.transfers ?? [];
  const sel = selected && filled(at(lineup, selected)) ? byId.get(at(lineup, selected) as number) ?? null : null;
  const open = Boolean(squad.window);
  // only an open place filters the list: a swap or a reset can put a player back on the place being filled
  const fillingSlot = filling ? at(lineup, filling) : null;
  const fillingPosition = fillingSlot != null && !filled(fillingSlot) ? fillingSlot : null;

  const place = (loc: Loc) => {
    const v = at(lineup, loc);
    const isSel = selected?.list === loc.list && selected.i === loc.i;
    const isTarget = swapFrom != null && canSwap(swapFrom, loc);
    if (!filled(v)) return <EmptySlot key={`${loc.list}${loc.i}`} position={SHORT[v]} onClick={() => tap(loc)}
      selected={filling?.list === loc.list && filling.i === loc.i} target={isTarget} />;
    const p = byId.get(v);
    return (
      <Shirt key={`${loc.list}${loc.i}`} name={p ? surname(p.name) : "?"} badge={p?.club.logo} fixture={<span className="truncate text-[11px] sm:text-[12px]">{nextFix(p)}</span>}
        captain={lineup.captain === v} vice={lineup.vice_captain === v} flag={(p?.status as "injured") ?? null}
        selected={isSel || (swapFrom?.list === loc.list && swapFrom.i === loc.i)} target={isTarget} onClick={() => tap(loc)} />
    );
  };
  const rows = LINES.map((pos) => lineup.starters.map((s, i) => ({ s, i })).filter(({ s }) => posOf(s) === pos)
    .map(({ i }) => place({ list: "starters", i })));

  return (
    <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={`${listOpen ? "fixed inset-0 z-40 flex flex-col bg-bg" : "hidden"} lg:static lg:z-auto lg:flex lg:max-h-[calc(100vh-6rem)] lg:flex-col`}>
        <PlayerList players={players} picked={new Set(all)} codes={codes} filling={fillingPosition}
          onAdd={add} onClose={() => { setListOpen(false); setFilling(null); }} league={league} />
      </aside>

      <div className="min-w-0 space-y-5">
        <dl className="grid grid-cols-4 divide-x divide-line rounded-xl border border-line py-3 text-center">
          {[
            ["Players", `${count} / 15`, count === 15 ? "" : "text-highlight-ink"],
            ["Money left", fmtM(budget - cost), budget - cost < 0 ? "text-danger" : ""],
            ["Transfers", open ? String(transfers.length) : "-", ""],
            ["Cost", check?.penalty ? `${check.penalty} pts` : "0 pts", check?.penalty ? "text-danger" : ""],
          ].map(([k, v, c]) => (
            <div key={k} className="px-1"><dt className="text-[12px] text-muted sm:text-[13px]">{k}</dt><dd className={`text-lg font-bold sm:text-xl ${c}`}>{v}</dd></div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-muted">
            {squad.window?.deadline
              ? <>Gameweek {squad.window.number} deadline in <span className="font-semibold text-highlight-ink"><Countdown to={squad.window.deadline} /></span></>
              : "Changes open an hour after this gameweek's last match."}
          </p>
          <div role="radiogroup" aria-label="View" className="flex rounded-full bg-surface-2 p-1">
            {(["pitch", "list"] as const).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}
                className={`h-8 rounded-full px-4 text-sm font-semibold capitalize transition-colors ${view === v ? "bg-bg shadow-sm" : "text-muted hover:text-text"}`}>{v}</button>
            ))}
          </div>
        </div>

        {swapFrom && (
          <p className="flex items-center justify-between gap-3 rounded-xl bg-wash px-4 py-2 text-[15px]">
            Tap the player to swap with.
            <button onClick={() => setSwapFrom(null)} className="btn btn-secondary btn-sm shrink-0">Cancel</button>
          </p>
        )}
        {notice && <p className="rounded-xl bg-wash px-4 py-3 text-ok">{notice}</p>}
        {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-danger">{error}</p>}
        {stuck && (
          <p className="rounded-xl bg-danger/10 px-4 py-3 text-danger">
            {fmtM(budget - cost)} left isn&apos;t enough for your {openPlaces.length} open {openPlaces.length === 1 ? "place" : "places"}:
            the cheapest players for {openPlaces.length === 1 ? "it" : "them"} cost {fmtM(leastToFill)}. Swap someone for a cheaper player.
          </p>
        )}
        {problems.length > 0 && (
          <ul className="list-disc space-y-1 rounded-xl border border-danger/30 py-3 pl-9 pr-4 text-sm text-danger">
            {problems.map((p, i) => <li key={i}>{p.message}</li>)}
          </ul>
        )}

        {view === "pitch" ? (
          <div>
            <Pitch rows={rows} />
            <div className="mt-3 rounded-xl bg-surface-2 px-3 pb-4 pt-3">
              <p className="mb-2 text-center text-[13px] font-medium text-muted">Substitutes</p>
              <div className="flex justify-evenly gap-1">
                {lineup.bench.map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-[12px] font-medium text-muted">{posOf(s) === "GK" ? "GK" : `${i}. ${SHORT[posOf(s) ?? "MID"]}`}</span>
                    {place({ list: "bench", i })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <SquadTable lineup={lineup} byId={byId} nextFix={nextFix} onTap={tap} />
        )}

        {transfers.length > 0 && (
          <div className="rounded-xl border border-line p-4 text-[15px]">
            <p className="mb-2 font-semibold">Transfers this gameweek</p>
            <ul className="space-y-1">
              {transfers.map((t, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span>{byId.get(t.player_out)?.name} out, <span className="font-semibold">{byId.get(t.player_in)?.name}</span> in</span>
                  <span className={t.penalty ? "text-danger" : "text-muted"}>{t.penalty ? `${t.penalty} pts` : t.kind === "replacement" ? "free (replacement)" : "free"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={() => { setListOpen(true); setFilling(null); }} className="btn btn-secondary flex-1 lg:hidden">Player list</button>
          <button onClick={() => { setLineup(saved); setCheck(null); setNotice(null); setError(null); setFilling(null); setSwapFrom(null); }} disabled={!changed} className="btn btn-secondary flex-1">Reset</button>
          <button onClick={save} disabled={!open || !changed || count !== 15 || saving || problems.length > 0} className="btn btn-primary flex-1">
            {saving ? "Saving…" : count !== 15 ? `Pick ${15 - count} more` : "Save squad"}
          </button>
        </div>
      </div>

      {sel && selected && (
        <PlayerCard league={league} player={sel} codes={codes} onClose={() => setSelected(null)}>
          {selected.list === "starters" && (
            <div className="mb-4 flex gap-6">
              {(["captain", "vice_captain"] as const).map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 text-[15px] font-medium">
                  <input type="checkbox" className="h-5 w-5 accent-[#f2c14e]" checked={lineup[r] === sel.id}
                    onChange={(e) => setRole(sel.id, r, e.target.checked)} />
                  {r === "captain" ? "Captain" : "Vice-captain"}
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { removeAt(selected); setFilling(selected); setSelected(null); setListOpen(true); }} className="btn btn-secondary">Transfer out</button>
            <button onClick={() => { setSwapFrom(selected); setSelected(null); }} className="btn btn-primary">Substitute</button>
          </div>
        </PlayerCard>
      )}
    </div>
  );
}

const MAX_PER_CLUB = 3;                                          // config.toml squad.max_per_club
const QUOTA_TEXT: Record<Position, string> = { GK: "2 goalkeepers", DEF: "5 defenders", MID: "5 midfielders", FWD: "3 attackers" };
// Sort by points, price or form (the dropdown); the list's column headings flip high-to-low and low-to-high.
type SortKey = "points" | "price" | "form";
const SORTS: { value: SortKey; label: string }[] = [{ value: "points", label: "Points" }, { value: "price", label: "Price" }, { value: "form", label: "Form" }];
const sortValue = (p: Player, key: SortKey) => (key === "price" ? p.price ?? 0 : key === "form" ? p.form ?? 0 : p.points);

function PlayerList({ players, picked, codes, filling, onAdd, onClose, league }: {
  players: Player[]; picked: Set<number>; codes: Map<string, string>; filling: Position | null;
  onAdd: (p: Player) => void; onClose: () => void; league: string;
}) {
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [key, setKey] = useState<SortKey>("points");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const sortBy = (k: SortKey) => { if (k === key) setDir(dir === "desc" ? "asc" : "desc"); else { setKey(k); setDir("desc"); } };
  const [club, setClub] = useState<string>("");
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState<Player | null>(null);
  useEffect(() => { if (filling) setPos(filling); }, [filling]);
  const clubs = useMemo(() => [...new Set(players.map((p) => p.club.name))].sort(), [players]);
  // clubs that already have the maximum in the squad: their other players can't be added
  const clubCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of players) if (picked.has(p.id)) m.set(p.club.id, (m.get(p.club.id) ?? 0) + 1);
    return m;
  }, [players, picked]);
  const clubFull = (x: Player) => !picked.has(x.id) && (clubCount.get(x.club.id) ?? 0) >= MAX_PER_CLUB;
  const shown = players
    .filter((p) => (pos === "ALL" || p.position === pos) && (!club || p.club.name === club)
      && (!query || p.name.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => (dir === "asc" ? 1 : -1) * (sortValue(a, key) - sortValue(b, key)));
  const groups = (pos === "ALL" ? POSITIONS : [pos]).map((p) => [p, shown.filter((x) => x.position === p)] as const);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-xl lg:border lg:border-line">
      <div className="space-y-2 border-b border-line p-4">
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-lg font-bold">{filling ? `Add a ${SECTION[filling].replace(/s$/, "").toLowerCase()}` : "Players"}</p>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Done</button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players"
          className="h-10 w-full rounded-full border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-link" />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Select block label="Position" value={pos} onChange={(v) => setPos(v as Position | "ALL")}
            options={[{ value: "ALL", label: "All positions" }, ...POSITIONS.map((p) => ({ value: p, label: SECTION[p] }))]} />
          <Select block label="Club" value={club || "ALL"} onChange={(v) => setClub(v === "ALL" ? "" : v)} align="right"
            options={[{ value: "ALL", label: "All clubs" }, ...clubs.map((c) => ({ value: c, label: c }))]} />
          <div className="col-span-2">
            <Select block label="Sort by" value={key} onChange={(v) => { setKey(v as SortKey); setDir("desc"); }} menuWidth={200}
              options={SORTS.map((o) => ({ value: o.value, label: `Sort by ${o.label.toLowerCase()}` }))} />
          </div>
        </div>
        <p className="text-[13px] text-muted">{shown.length} player{shown.length === 1 ? "" : "s"}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map(([p, list]) => list.length > 0 && (
          <section key={p}>
            <h4 className="sticky top-0 z-10 flex justify-between bg-surface-2 px-4 py-2 text-[13px] font-semibold">
              <span>{SECTION[p]}</span><span className="flex gap-2 font-medium text-muted">
                <SortHead label="Price" on={key === "price"} dir={dir} onClick={() => sortBy("price")} className="w-14" />
                <SortHead label={key === "form" ? "Form" : "Pts"} on={key !== "price"} dir={dir} onClick={() => sortBy(key === "form" ? "form" : "points")} className="w-11" />
                <span className="w-8" />
              </span>
            </h4>
            <ul className="divide-y divide-line">
              {list.map((x) => {
                const inSquad = picked.has(x.id), full = clubFull(x);
                return (
                  <li key={x.id} className={`flex items-center gap-2 px-4 py-2.5 ${inSquad ? "bg-wash/60" : ""} ${full ? "opacity-45" : ""}`}
                    title={full ? `You already have ${MAX_PER_CLUB} ${x.club.name} players` : undefined}>
                    <button onClick={() => setInfo(x)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`${x.name} details`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {x.club.logo && <img src={x.club.logo} alt="" className="h-6 w-6 shrink-0 object-contain" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                          <span className="truncate" title={x.name}>{x.name}</span>
                          {x.status && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" title={x.status} />}
                        </span>
                        <span className="block truncate text-[12px] text-muted">{codes.get(x.club.name)} {SHORT[x.position]}</span>
                      </span>
                    </button>
                    <span className="w-14 shrink-0 text-right text-[14px]">{fmtM(x.price)}</span>
                    <span className="w-11 shrink-0 text-right text-[14px] font-semibold">{key === "form" ? (x.form ?? 0).toFixed(1) : fmtPts(x.points)}</span>
                    <button onClick={() => onAdd(x)} disabled={inSquad || full}
                      aria-label={inSquad ? `${x.name} is in your squad` : full ? `${x.club.name} already has ${MAX_PER_CLUB} players in your squad` : `Add ${x.name}`}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg font-semibold transition-colors ${
                        inSquad ? "text-link" : full ? "bg-surface-2 text-muted" : "bg-surface-2 hover:bg-accent hover:text-black"}`}>{inSquad ? "✓" : "+"}</button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {info && (
        <PlayerCard league={league} player={info} codes={codes} onClose={() => setInfo(null)}>
          <button onClick={() => { onAdd(info); setInfo(null); }} disabled={picked.has(info.id) || clubFull(info)} className="btn btn-primary w-full">
            {picked.has(info.id) ? "Already in your squad" : clubFull(info) ? `You already have ${MAX_PER_CLUB} ${info.club.name} players` : "Add to squad"}
          </button>
        </PlayerCard>
      )}
    </div>
  );
}

// A column heading that sorts the list by its column; pressing it again flips the order.
function SortHead({ label, on, dir, onClick, className }: { label: string; on: boolean; dir: "desc" | "asc"; onClick: () => void; className: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Sort by ${label}, ${on && dir === "desc" ? "low to high" : "high to low"}`}
      className={`${className} inline-flex items-center justify-end gap-0.5 transition-colors hover:text-text ${on ? "text-accent" : ""}`}>
      {label}<span aria-hidden="true" className={`text-[10px] ${on ? "" : "opacity-0"}`}>{dir === "desc" ? "▼" : "▲"}</span>
    </button>
  );
}

function SquadTable({ lineup, byId, nextFix, onTap }: {
  lineup: Lineup; byId: Map<number, Player>; nextFix: (p?: Player) => string; onTap: (loc: Loc) => void;
}) {
  const sections: [string, Loc[]][] = [
    ...POSITIONS.map((p) => [SECTION[p], lineup.starters.map((s, i) => ({ s, i })).filter(({ s }) => (filled(s) ? byId.get(s)?.position : s) === p)
      .map(({ i }) => ({ list: "starters", i }) as Loc)] as [string, Loc[]]),
    ["Substitutes", lineup.bench.map((_, i) => ({ list: "bench", i }) as Loc)],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-[15px]">
        <thead className="bg-surface-2 text-left text-[13px] text-muted">
          <tr><th className="px-4 py-2.5 font-medium">Player</th><th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Price</th>
            <th className="px-2 py-2.5 text-right font-medium">Form</th><th className="px-2 py-2.5 text-right font-medium">Pts</th>
            <th className="px-4 py-2.5 text-right font-medium">Next</th></tr>
        </thead>
        {sections.map(([title, locs]) => (
          <tbody key={title}>
            <tr><td colSpan={5} className="border-t border-line px-4 pb-1 pt-4 text-[13px] font-semibold">{title}</td></tr>
            {locs.map((loc) => {
              const v = lineup[loc.list][loc.i];
              const p = filled(v) ? byId.get(v) : undefined;
              return (
                <tr key={`${loc.list}${loc.i}`} onClick={() => onTap(loc)} className="cursor-pointer border-t border-line hover:bg-surface-2">
                  <td className="px-4 py-3">
                    {p ? (
                      <>
                        <span className="flex items-center gap-2 font-semibold">{p.name}
                          {lineup.captain === v && <span className="grid h-5 w-5 place-items-center rounded-full bg-highlight text-[11px] font-bold text-black">C</span>}
                          {lineup.vice_captain === v && <span className="grid h-5 w-5 place-items-center rounded-full bg-black text-[11px] font-bold text-white">V</span>}
                        </span>
                        <span className="text-[13px] text-muted">{p.club.name}</span>
                      </>
                    ) : <span className="font-semibold text-link">+ Add a player</span>}
                  </td>
                  <td className="hidden px-2 text-right sm:table-cell">{p ? fmtM(p.price) : ""}</td>
                  <td className="px-2 text-right">{p ? fmtPts(p.form) : ""}</td>
                  <td className="px-2 text-right font-semibold">{p ? fmtPts(p.points) : ""}</td>
                  <td className="px-4 text-right text-[13px]">{p ? nextFix(p) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
