"use client";

// A league's home: its deadline clock, your squads in it (with what each still needs), the season or
// gameweek table and the gameweek's fixtures. Squads and the table are React Bits AnimatedLists.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtPts, Gameweek, LEAGUE_NAMES, SquadHistory, SquadView, StandingRow, TableRow } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { DeadlineClock, Loading, Select, StateBadge } from "@/components/ui";
import AnimatedList from "@/components/animated-list/AnimatedList";
import SeasonRail from "@/components/SeasonRail";
import FaucetCard from "@/components/FaucetCard";
import { TEST_SEASON } from "@/components/TestSeason";
import { Fixtures } from "./squads/[id]/LeagueTabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight01Icon, Delete02Icon, Edit02Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";

const COMING_SOON: Record<string, string> = { "serie-a": "Serie A", "ligue-1": "Ligue 1" };

type League = { slug: string; window: Gameweek | null; gameweeks: Gameweek[] };
type Status = { players: number; saved: boolean; last: { number: number; points: number; rank: number } | null };
type SquadRow = { kind: "squad"; id: number; slot: number; name: string; off: string | null; canDelete: boolean } | { kind: "new"; id: string } | { kind: "full"; id: string };
type Row = (StandingRow | TableRow) & { gameweeks?: number };

// AnimatedList in the night palette (its own dark theme is purple-grey)
const LIST_STYLE = {
  "--al-tile": "var(--surface)", "--al-tile-edge": "rgba(255,255,255,.08)", "--al-tile-highlight": "rgba(255,255,255,.04)",
  "--al-tile-shadow": "none", "--al-ink": "var(--text)", "--al-muted": "var(--muted)", "--al-well": "var(--surface-2)",
  "--al-thumb": "rgba(255,255,255,.18)", "--al-hover": "brightness(1.18)", "--al-active": "brightness(1.22)",
};

const day = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Next keeps this page mounted between leagues; the key starts each league fresh, so its table and
// fixtures open on its own current gameweek rather than the one last viewed in another league.
export default function Area() {
  const { league } = useParams<{ league: string }>();
  return <LeagueHome key={league} league={league} />;
}

function LeagueHome({ league }: { league: string }) {
  // switching between leagues keeps this page mounted, so Next leaves the scroll where it was: start at the top
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [league]);
  const { me, token, wallet, refresh, signIn, signingIn, error: authError } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<League | null>(null);
  const [mode, setMode] = useState<"season" | number>("season");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tableFailed, setTableFailed] = useState(false);
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => { api<League>(`/leagues/${league}`).then(setData).catch((e) => setError(e.message)); }, [league]);
  // the moment the deadline passes the clock gives way to "live" and the league is read again,
  // so the page never sits on 00:00:00 while the game clock catches up
  const [passed, setPassed] = useState(false);
  const deadline = data?.window?.deadline ?? data?.gameweeks.find((g) => g.state === "open")?.deadline ?? null;
  useEffect(() => {
    if (!deadline) { setPassed(false); return; }
    const left = Date.parse(deadline) - Date.now();
    setPassed(left <= 0);
    if (left <= 0 || left > 2 ** 31 - 1) return;
    const t = setTimeout(() => {
      setPassed(true);
      api<League>(`/leagues/${league}`).then(setData).catch(() => {});
    }, left + 1000);
    return () => clearTimeout(t);
  }, [deadline, league]);

  // only the latest request may fill the table: a slow older one must not overwrite a newer choice
  const tableRequest = useRef(0);
  const loadTable = useCallback(() => {
    const request = ++tableRequest.current;
    (mode === "season" ? api<{ rows: StandingRow[] }>(`/leagues/${league}/standings`)
      : api<{ rows: TableRow[] }>(`/leagues/${league}/gameweeks/${mode}/table`))
      .then((t) => { if (request === tableRequest.current) { setRows(t.rows); setTableFailed(false); } })
      .catch(() => { if (request === tableRequest.current) setTableFailed(true); });
  }, [league, mode]);
  // the loader only shows on a new table; the 30-second refresh during a live gameweek swaps the numbers in place
  useEffect(() => { setRows(null); setTableFailed(false); loadTable(); }, [loadTable]);
  const live = data?.gameweeks.some((g) => g.state === "live");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(loadTable, 30000);
    return () => clearInterval(t);
  }, [live, loadTable]);

  const mine = me?.squads.filter((s) => s.league === league) ?? [];
  const canAdd = me ? me.squads.length < me.squads_allowed : false;

  // what each of your squads still needs, and how it did last time
  useEffect(() => {
    if (!token || !mine.length) return;
    let gone = false;
    Promise.all(mine.map(async (s) => {
      const [v, h] = await Promise.all([
        api<SquadView>(`/squads/${s.id}`, { token }).catch(() => null),
        api<SquadHistory>(`/squads/${s.id}/history`).catch(() => null),
      ]);
      const picks = v?.picks ? v.picks.starters.length + v.picks.bench.length : 0;
      const last = h?.gameweeks.at(-1);
      return [s.id, { players: picks, saved: Boolean(v?.saved_for_window), last: last ? { number: last.number, points: last.points, rank: last.rank } : null }] as const;
    })).then((all) => { if (!gone) setStatus(Object.fromEntries(all)); });
    return () => { gone = true; };
  }, [token, me]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setCreating(true); setError(null);
    try {
      const made = await api<{ id: number }>(`/leagues/${league}/squads`, { body: {}, token });
      await refresh();
      router.push(`/${league}/squads/${made.id}?tab=pick`);   // straight to picking its players
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
  }
  async function rename() {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    try { await api(`/squads/${id}`, { method: "PATCH", body: { name }, token }); await refresh(); }
    catch (e) { setError((e as Error).message); }
  }
  async function remove(id: number) {
    if (!window.confirm("Delete this squad? It has never played, so nothing is lost.")) return;
    try { await api(`/squads/${id}`, { method: "DELETE", token }); await refresh(); }
    catch (e) { setError((e as Error).message); }
  }

  if (!LEAGUE_NAMES[league]) {
    const soon = COMING_SOON[league];
    return (
      <div className="space-y-4 pt-12">
        <Link href="/#leagues" className="link text-sm">All leagues</Link>
        <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em]">{soon ?? "League not found"}</h1>
        <p className="text-muted">{soon ? `${soon} opens after launch. Premier League, La Liga and Bundesliga are open now.` : "There's no league at this address."}</p>
      </div>
    );
  }

  const gw = data?.window ?? data?.gameweeks.find((g) => g.state === "open") ?? null;
  // the gameweek being played: locked, live or settling, or the open one whose deadline has just gone
  const current = data?.gameweeks.find((g) => ["locked", "live", "settling"].includes(g.state))
    ?? (passed && gw ? { ...gw, state: "live" as const } : undefined);
  const scored = data?.gameweeks.filter((g) => g.state !== "open").map((g) => g.number) ?? [];
  const squadRows: SquadRow[] = [
    ...mine.map((s) => ({ kind: "squad" as const, id: s.id, slot: s.slot, name: s.name ?? `Squad ${s.slot}`, canDelete: s.can_delete,
      off: s.frozen_at ? "Frozen: no points this gameweek" : s.unpaid ? `Hold ${(me!.squads.length * me!.requirement).toLocaleString()} $ELEVN to unlock` : null })),
    canAdd ? { kind: "new" as const, id: "new" } : { kind: "full" as const, id: "full" },
  ];

  return (
    <div className="pt-10">
      {/* the league and its clock */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="flex items-center gap-5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-text p-3 sm:h-20 sm:w-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/leagues/${league}.svg`} alt="" width={56} height={56} className="h-full w-full object-contain" />
          </span>
          <div>
            <Link href="/#leagues" className="link text-sm">All leagues</Link>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-tight tracking-[-0.03em]">{LEAGUE_NAMES[league]}</h1>
            <p className="text-muted">
              {current ? <span className="inline-flex items-center gap-2">Gameweek {current.number} <StateBadge state={current.state} /></span>
                : gw?.deadline ? `Gameweek ${gw.number} deadline ${day(gw.deadline)}` : data ? "No gameweek scheduled" : error ? "" : "Loading…"}
            </p>
          </div>
        </div>
        {current && (
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-accent" aria-hidden="true">
              <HugeiconsIcon icon={SquareLock02Icon} size={20} strokeWidth={2} />
            </span>
            <span>
              <span className="block text-lg font-bold">Squads locked</span>
              <span className="block text-[13px] text-muted">Until gameweek {current.number} is over.</span>
            </span>
          </div>
        )}
        {!current && gw?.deadline && (
          <div className="rounded-2xl border border-line bg-surface px-5 py-4">
            <p className="mb-1 text-[13px] text-muted">Gameweek {gw.number} locks in</p>
            <DeadlineClock to={gw.deadline} label={false} />
          </div>
        )}
        {data && <SeasonRail gameweeks={data.gameweeks} focus={current?.number ?? gw?.number ?? null} />}
      </div>
      {error && <p className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-danger">{error}</p>}

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <section>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-[-0.02em]">Your squads</h2>
            {me && <span className="text-[13px] text-muted">{me.squads.length} of {me.squads_allowed} squads used</span>}
          </div>
          {token && <FaucetCard />}
          {!token ? (
            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="text-lg font-semibold">Sign in to build your squad</p>
              <p className="mt-1 text-muted">
                {TEST_SEASON ? "It's the test season: sign in and get free test $ELEVN to play. " : "Every 150,000 $ELEVN in your wallet runs one squad. "}
                Signing in is free and moves no tokens.
              </p>
              <button onClick={signIn} disabled={signingIn} className="btn btn-primary mt-5">{signingIn ? "Check your wallet…" : "Sign in with your wallet"}</button>
            </div>
          ) : !me && authError ? <LoadFailed what="Your squads" onRetry={refresh} /> : !me ? <Loading label="Loading your squads" /> : (
            <AnimatedList<SquadRow> items={squadRows} frame={false} width="100%" maxHeight={560} gap={10} radius={16}
              accentColor="#f2c14e" animation="slide" stagger={0.06} showGradients={false} style={LIST_STYLE}
              onItemSelect={(r) => {
                if (r.kind === "squad" && renaming?.id !== r.id) router.push(`/${league}/squads/${r.id}`);
                if (r.kind === "new" && !creating) create();
              }}
              renderItem={(r) => r.kind === "new" ? (
                <span className="flex w-full items-center gap-4 py-1.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-dashed border-accent/60 text-accent">
                    <HugeiconsIcon icon={Add01Icon} size={22} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{creating ? "Creating your squad…" : "New squad"}</span>
                    <span className="block text-[13px] text-muted">You can run another squad in {LEAGUE_NAMES[league]}</span>
                  </span>
                </span>
              ) : r.kind === "full" ? (
                <span className="flex w-full items-center gap-4 py-1.5 opacity-70">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><HugeiconsIcon icon={Add01Icon} size={22} /></span>
                  <span className="text-[14px] text-muted">Each squad needs {me.requirement.toLocaleString()} $ELEVN held. Add more to run another.</span>
                </span>
              ) : (
                <SquadLine row={r} status={status[r.id]} renaming={renaming} setRenaming={setRenaming} rename={rename} remove={remove} />
              )} />
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-[-0.02em]">Table</h2>
            <Select label="Table" align="right" value={String(mode)} onChange={(v) => setMode(v === "season" ? "season" : Number(v))}
              options={[{ value: "season", label: "Whole season" }, ...[...scored].reverse().map((n) => ({ value: String(n), label: `Gameweek ${n}` }))]} />
          </div>
          {rows && rows.length > 0 && (
            <p className="mb-2 flex justify-between px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
              <span>Rank and squad</span><span>Points</span>
            </p>
          )}
          {tableFailed && rows === null ? <LoadFailed what="The table" onRetry={loadTable} /> : rows === null ? <Loading label="Loading the table" /> : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <p className="text-lg font-semibold">No squads have scored yet</p>
              <p className="mx-auto mt-1 max-w-sm text-muted">
                {gw?.deadline ? `The table fills in once gameweek ${gw.number} kicks off on ${day(gw.deadline)}.` : "The table fills in once the first gameweek kicks off."}
              </p>
              {token && !mine.length && canAdd && <button onClick={create} className="btn btn-primary mt-5">Build a squad</button>}
            </div>
          ) : (
            <AnimatedList<Row> items={rows} frame={false} width="100%" maxHeight={560} gap={6} radius={14} accentColor="#f2c14e"
              animation="fade" stagger={0.03} style={LIST_STYLE}
              onItemSelect={(r) => router.push(`/${league}/squads/${r.squad}?tab=points${mode === "season" ? "" : `&gw=${mode}`}`)}
              renderItem={(r) => (
                <span className="flex w-full items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums ${
                    r.rank === 1 ? "bg-accent text-accent-ink" : r.rank <= 3 ? "border border-accent/60 text-accent" : "bg-surface-2 text-muted"}`}>{r.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold"><span className="truncate">{r.name}</span>
                      {wallet && r.wallet === wallet && <span className="shrink-0 rounded-full bg-wash px-2 text-[12px] text-link">You</span>}
                    </span>
                    {(r.username || ("gameweeks" in r && r.gameweeks != null)) && (
                      <span className="block truncate text-[12px] text-muted">
                        {[r.username && `by ${r.username}`, "gameweeks" in r && r.gameweeks != null && `${r.gameweeks} gameweek${r.gameweeks === 1 ? "" : "s"} played`]
                          .filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="text-lg font-bold tabular-nums">{fmtPts(Math.round(r.points * 10) / 10)}</span>
                </span>
              )} />
          )}
        </section>
      </div>

      {data && data.gameweeks.length > 0 && (
        <section className="mt-16 border-t border-line pt-12">
          <h2 className="mb-6 text-2xl font-bold tracking-[-0.02em]">Fixtures</h2>
          <Fixtures league={league} gameweeks={data.gameweeks} start={current?.number ?? gw?.number ?? data.gameweeks.at(-1)?.number ?? null} />
        </section>
      )}
    </div>
  );
}

function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-lg font-semibold">{what} couldn&apos;t load</p>
      <button onClick={onRetry} className="btn btn-secondary btn-sm mt-4">Try again</button>
    </div>
  );
}

function SquadLine({ row, status, renaming, setRenaming, rename, remove }: {
  row: Extract<SquadRow, { kind: "squad" }>; status?: Status; renaming: { id: number; name: string } | null;
  setRenaming: (r: { id: number; name: string } | null) => void; rename: () => void; remove: (id: number) => void;
}) {
  const editing = renaming?.id === row.id;
  const need = status ? (status.players < 15 ? `Pick ${15 - status.players} more player${15 - status.players === 1 ? "" : "s"}` : status.saved ? "Ready for this gameweek" : "Eleven players | 4 substitutions, not saved for this gameweek") : "Checking…";
  const tone = row.off ? "bg-danger" : !status ? "bg-muted" : status.players < 15 ? "bg-accent" : status.saved ? "bg-ok" : "bg-accent";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span className="flex w-full items-center gap-4 py-1">
      <span className="pitch-grass grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold">{row.slot}</span>
      <span className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); rename(); }} onClick={stop}>
            <input autoFocus value={renaming.name} maxLength={30} placeholder={`Squad ${row.slot}`} aria-label="Squad name"
              onChange={(e) => setRenaming({ id: row.id, name: e.target.value })} onBlur={rename}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setRenaming(null); }}
              className="h-9 w-full max-w-56 rounded-lg border border-line bg-surface-2 px-3 font-semibold outline-none focus:border-accent" />
          </form>
        ) : <span className="block truncate font-semibold">{row.name}</span>}
        <span className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
          <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />{row.off ?? need}
        </span>
      </span>
      {status?.last && (
        <span className="hidden text-right sm:block">
          <span className="block text-lg font-bold tabular-nums">{fmtPts(status.last.points)}</span>
          <span className="block text-[12px] text-muted">GW{status.last.number}, #{status.last.rank}</span>
        </span>
      )}
      <span className="flex items-center gap-1" onClick={stop}>
        <button onClick={() => setRenaming({ id: row.id, name: row.name })} aria-label={`Rename ${row.name}`}
          className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text sm:h-8 sm:w-8"><HugeiconsIcon icon={Edit02Icon} size={16} /></button>
        {row.canDelete && (
          <button onClick={() => remove(row.id)} aria-label={`Delete ${row.name}`}
            className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-danger/15 hover:text-danger sm:h-8 sm:w-8"><HugeiconsIcon icon={Delete02Icon} size={16} /></button>
        )}
      </span>
      <HugeiconsIcon icon={ArrowRight01Icon} size={18} className="shrink-0 text-muted" />
    </span>
  );
}
