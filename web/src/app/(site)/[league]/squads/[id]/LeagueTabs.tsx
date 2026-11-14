"use client";

// The squad page's league tabs: the gameweek's fixtures, the league table (season or one gameweek)
// and team news (injuries, suspensions and doubts, the squad's own players first).
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Fixture, FINISHED, fmtPts, Gameweek, NOT_STARTED, Player, StandingRow, TableRow } from "@/lib/api";
import { Card, Loading, Select } from "@/components/ui";
import AnimatedList from "@/components/animated-list/AnimatedList";

const NEWS_STYLE = {
  "--al-tile": "var(--surface)", "--al-tile-edge": "rgba(255,255,255,.08)", "--al-tile-highlight": "rgba(255,255,255,.04)",
  "--al-tile-shadow": "none", "--al-ink": "var(--text)", "--al-muted": "var(--muted)", "--al-hover": "brightness(1.18)", "--al-active": "brightness(1.22)",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Badge({ club }: { club: Fixture["home"] }) {
  // eslint-disable-next-line @next/next/no-img-element
  return club.logo ? <img src={club.logo} alt="" className="h-6 w-6 shrink-0 object-contain" /> : <span className="h-6 w-6" />;
}

export function Fixtures({ league, gameweeks, start }: { league: string; gameweeks: Gameweek[]; start: number | null }) {
  const [n, setN] = useState<number | null>(start);
  const [rows, setRows] = useState<Fixture[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (start != null) setN((x) => x ?? start); }, [start]);
  useEffect(() => {
    if (n == null) return;
    setRows(null);
    setFailed(false);
    let current = true;   // a slow answer for a gameweek you've moved on from is ignored
    api<{ fixtures: Fixture[] }>(`/leagues/${league}/gameweeks/${n}/fixtures`)
      .then((r) => { if (current) setRows(r.fixtures); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [league, n, attempt]);
  const numbers = gameweeks.map((g) => g.number);
  const i = n == null ? -1 : numbers.indexOf(n);
  const byDay = (rows ?? []).reduce<Record<string, Fixture[]>>((m, f) => ({ ...m, [day(f.kickoff)]: [...(m[day(f.kickoff)] ?? []), f] }), {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setN(numbers[i - 1])} disabled={i <= 0} className="btn btn-secondary btn-sm">Previous</button>
        <h3 className="text-xl font-bold">{n == null ? "Fixtures" : `Gameweek ${n}`}</h3>
        <button onClick={() => setN(numbers[i + 1])} disabled={i < 0 || i >= numbers.length - 1} className="btn btn-secondary btn-sm">Next</button>
      </div>
      {failed ? (
        <Card><p className="text-muted">The fixtures couldn&apos;t load.</p><button onClick={() => setAttempt((a) => a + 1)} className="btn btn-secondary btn-sm mt-3">Try again</button></Card>
      ) : rows === null ? <Loading label="Loading fixtures" /> : rows.length === 0 ? <Card><p className="text-muted">No fixtures in this gameweek.</p></Card> : (
        Object.entries(byDay).map(([d, list]) => (
          <section key={d}>
            <h4 className="mb-2 text-[13px] font-semibold text-muted">{d}</h4>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {list.map((f) => {
                const live = !FINISHED.includes(f.status) && !NOT_STARTED.includes(f.status);
                const played = f.home.goals != null && !NOT_STARTED.includes(f.status);
                // once a match is over the loser's name steps back, so the results read at a glance
                const over = played && !live && f.home.goals !== f.away.goals;
                const homeLost = over && f.home.goals! < f.away.goals!;
                const awayLost = over && f.away.goals! < f.home.goals!;
                return (
                  <li key={f.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
                    <span className={`flex min-w-0 items-center justify-end gap-2 text-right font-semibold ${homeLost ? "text-muted" : ""}`}>
                      <span className="truncate">{f.home.name}</span><Badge club={f.home} />
                    </span>
                    <span className={`min-w-16 rounded-md px-2 py-1 text-center text-[15px] font-bold tabular-nums ${
                      live ? "bg-live text-black" : played ? "bg-surface-2 text-text" : "border border-line font-medium text-muted"}`}>
                      {played ? `${f.home.goals} - ${f.away.goals}` : time(f.kickoff)}
                    </span>
                    <span className={`flex min-w-0 items-center gap-2 font-semibold ${awayLost ? "text-muted" : ""}`}>
                      <Badge club={f.away} /><span className="truncate">{f.away.name}</span>
                    </span>
                    {live && <span className="col-span-3 -mt-1 text-center text-[12px] font-semibold text-live">Live{f.elapsed ? `, ${f.elapsed}'` : ""}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function Table({ league, gameweeks, squadId, wallet }: {
  league: string; gameweeks: Gameweek[]; squadId: number; wallet: string | null;
}) {
  const scored = gameweeks.filter((g) => g.state !== "open").map((g) => g.number);
  const [mode, setMode] = useState<"season" | number>("season");
  const [rows, setRows] = useState<(StandingRow | TableRow)[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setRows(null);
    setFailed(false);
    const req = mode === "season"
      ? api<{ rows: StandingRow[] }>(`/leagues/${league}/standings`)
      : api<{ rows: TableRow[] }>(`/leagues/${league}/gameweeks/${mode}/table`);
    let current = true;
    req.then((r) => { if (current) setRows(r.rows); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [league, mode]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{mode === "season" ? "Season table" : `Gameweek ${mode}`}</h3>
        <Select label="Table" align="right" value={String(mode)} onChange={(v) => setMode(v === "season" ? "season" : Number(v))}
          options={[{ value: "season", label: "Whole season" }, ...[...scored].reverse().map((n) => ({ value: String(n), label: `Gameweek ${n}` }))]} />
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        {failed ? <p className="p-5 text-muted">The table couldn&apos;t load. Refresh to try again.</p> : rows === null ? <Loading label="Loading the table" /> : rows.length === 0 ? <p className="p-5 text-muted">No squads have scored yet.</p> : (
          <table className="w-full text-[15px]">
            <thead className="bg-surface-2 text-left text-[13px] text-muted">
              <tr><th className="w-14 px-5 py-2.5 font-medium">Rank</th><th className="py-2.5 font-medium">Squad</th>
                <th className="px-5 py-2.5 text-right font-medium">Points</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const here = r.squad === squadId, mine = wallet != null && r.wallet === wallet;
                return (
                  <tr key={r.squad} className={`border-t border-line ${here ? "bg-wash" : "hover:bg-surface-2"}`}>
                    <td className="px-5 py-3.5 text-muted">{r.rank}</td>
                    <td className="py-3.5">
                      <Link href={`/${league}/squads/${r.squad}?tab=points${mode === "season" ? "" : `&gw=${mode}`}`}
                        className="font-semibold hover:text-link hover:underline">{r.name}</Link>
                      {r.username && <span className="ml-2 text-[13px] text-muted">by {r.username}</span>}
                      {here ? <span className="ml-2 text-[13px] text-link">This squad</span>
                        : mine ? <span className="ml-2 text-[13px] text-link">Yours</span> : null}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold">{fmtPts(Math.round(r.points * 10) / 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const STATUS: Record<string, string> = { injured: "Injured", suspended: "Suspended", doubtful: "Doubtful", left_league: "Left the league", off_season: "Not available" };

export function TeamNews({ league, mine }: { league: string; mine: Set<number> }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  useEffect(() => {
    api<{ players: Player[] }>(`/leagues/${league}/players`).then((r) => setPlayers(r.players.filter((p) => p.status))).catch(() => setPlayers([]));
  }, [league]);
  if (players === null) return <Loading label="Loading team news" />;
  const ours = players.filter((p) => mine.has(p.id)), rest = players.filter((p) => !mine.has(p.id));
  const list = (title: string, ps: Player[]) => ps.length > 0 && (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-muted">{title}</h3>
      <AnimatedList<Player> items={ps} frame={false} width="100%" maxHeight={520} gap={8} radius={14} accentColor="#f2c14e"
        animation="fade" stagger={0.03} selectOnHover style={NEWS_STYLE}
        renderItem={(p) => (
          <span className="flex w-full items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.club.logo ? <img src={p.club.logo} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" /> : <span className="h-7 w-7" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-[13px] text-muted">{p.club.name}{p.status_reason ? `: ${p.status_reason}` : ""}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
              p.status === "doubtful" ? "bg-[#3a2f12] text-accent" : "bg-danger/15 text-danger"}`}>{STATUS[p.status ?? ""] ?? p.status}</span>
          </span>
        )} />
    </section>
  );
  return (
    <div className="space-y-6">
      {players.length === 0 ? (
        <Card><p className="font-semibold">No injury or suspension news</p>
          <p className="mt-1 text-muted">Every player in this league is available for the next gameweek.</p></Card>
      ) : <>{list("Your squad", ours)}{list("Around the league", rest)}</>}
    </div>
  );
}
