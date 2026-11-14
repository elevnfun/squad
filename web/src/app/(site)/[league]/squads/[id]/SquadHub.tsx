"use client";

// One page per squad: a sidebar with its season (points, rank, gameweek history) and tabs for
// picking the team (owner only), points, the league's fixtures, the table and team news.
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, fmtPts, Gameweek, LEAGUE_NAMES, shortWallet, SquadHistory, SquadView } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { Loading } from "@/components/ui";
import Points from "./Points";
import SquadPlanner from "./SquadPlanner";
import { Fixtures, Table, TeamNews } from "./LeagueTabs";

type Tab = "pick" | "points" | "fixtures" | "table" | "news";
const LABELS: Record<Tab, string> = { pick: "Pick team", points: "Points", fixtures: "Fixtures", table: "Table", news: "Team news" };

export default function SquadHub() {
  const { league, id } = useParams<{ league: string; id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { me, token, wallet } = useAuth();
  const [history, setHistory] = useState<SquadHistory | null>(null);
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [window_, setWindow] = useState<Gameweek | null>(null);
  const [players, setPlayers] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SquadHistory>(`/squads/${id}/history`).then(setHistory).catch((e) => setError(e.message));
    api<{ window: Gameweek | null; gameweeks: Gameweek[] }>(`/leagues/${league}`)
      .then((d) => { setGameweeks(d.gameweeks); setWindow(d.window); }).catch(() => {});
  }, [id, league]);

  const owner = Boolean(me?.squads.some((s) => String(s.id) === id));
  const tabs: Tab[] = owner ? ["pick", "points", "fixtures", "table", "news"] : ["points", "fixtures", "table", "news"];
  const asked = search.get("tab") as Tab | null;
  const tab: Tab = asked && tabs.includes(asked) ? asked : search.get("gw") || !owner ? "points" : "pick";
  const lastScored = history?.gameweeks.at(-1)?.number ?? null;
  const gw = search.get("gw") ? Number(search.get("gw")) : lastScored;

  // the squad's players, so team news can list them first
  useEffect(() => {
    if (owner && token) api<SquadView>(`/squads/${id}`, { token })
      .then((s) => setPlayers(new Set([...(s.picks?.starters ?? []), ...(s.picks?.bench ?? [])]))).catch(() => {});
  }, [owner, token, id]);

  const go = (t: Tab, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ tab: t, ...extra });
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  // the points tab needs a gameweek in the address; give it the latest one this squad scored in
  useEffect(() => {
    if (tab === "points" && !search.get("gw") && lastScored != null) go("points", { gw: String(lastScored) });
  }, [tab, lastScored]); // eslint-disable-line react-hooks/exhaustive-deps

  // the gameweek coming up: the open window's, else the first one not finished yet
  const fixturesStart = useMemo(() => window_?.number ?? gameweeks.find((g) => g.state !== "settled")?.number ?? gameweeks.at(-1)?.number ?? null,
    [window_, gameweeks]);

  if (error) return <p className="pt-12 text-danger">{error}</p>;
  if (!history) return <Loading label="Loading the squad" className="mt-12" />;
  const name = history.squad.name ?? `Squad ${history.squad.slot}`;
  const latest = history.gameweeks.at(-1);

  return (
    <div className="pt-12">
      <div className="border-b border-line pb-8">
        <Link href={`/${league}`} className="link text-sm">{LEAGUE_NAMES[league] ?? league}</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em]">{name}</h1>
        </div>
        <p className="mt-1 text-muted">{owner ? "Your squad" : history.squad.username ? `by ${history.squad.username}` : `Wallet ${shortWallet(history.squad.wallet)}`}, squad {history.squad.slot}</p>
      </div>

      <div className={`mt-8 grid gap-10 ${tab === "pick" ? "" : "lg:grid-cols-[17rem_minmax(0,1fr)]"}`}>
        <aside className={`order-2 space-y-8 lg:order-none ${tab === "pick" ? "hidden" : ""}`}>
          <section>
            <h2 className="text-lg font-bold">Points and rankings</h2>
            <dl className="mt-3 divide-y divide-line border-y border-line text-[15px]">
              {[
                ["Season points", fmtPts(Math.round(history.total * 10) / 10)],
                ["Season rank", history.rank ? `${history.rank} of ${history.squads}` : "Not ranked yet"],
                [latest ? `Gameweek ${latest.number} points` : "Gameweek points", latest ? fmtPts(latest.points) : "-"],
                [latest ? `Gameweek ${latest.number} rank` : "Gameweek rank", latest ? `${latest.rank} of ${latest.squads}` : "-"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2.5"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
          </section>
          <section>
            <h2 className="text-lg font-bold">Gameweek history</h2>
            {history.gameweeks.length === 0 ? <p className="mt-2 text-muted">No gameweeks scored yet.</p> : (
              <ul className="mt-3 divide-y divide-line border-y border-line text-[15px]">
                {[...history.gameweeks].reverse().map((g) => (
                  <li key={g.number}>
                    <button onClick={() => go("points", { gw: String(g.number) })}
                      className={`flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-link ${tab === "points" && gw === g.number ? "font-semibold text-link" : ""}`}>
                      <span>Gameweek {g.number}</span>
                      <span className="tabular-nums">{fmtPts(g.points)} pts <span className="text-muted">#{g.rank}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className="order-1 min-w-0 lg:order-none">
          <nav className="-mx-6 mb-6 flex gap-1 overflow-x-auto border-b border-line px-6 [scrollbar-width:none] lg:mx-0 lg:px-0" aria-label="Squad">
            {tabs.map((t) => (
              <button key={t} onClick={() => go(t, t === "points" && gw ? { gw: String(gw) } : {})} aria-current={tab === t ? "page" : undefined}
                className={`relative shrink-0 px-3 pb-3 pt-1 text-[15px] font-semibold transition-colors ${tab === t ? "text-text" : "text-muted hover:text-text"}`}>
                {LABELS[t]}
                {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-highlight" />}
              </button>
            ))}
          </nav>

          {tab === "pick" && owner && token && <SquadPlanner league={league} id={id} token={token} upcoming={fixturesStart} />}
          {tab === "points" && (gw != null ? <Points embedded />
            : <p className="text-muted">This squad hasn&apos;t scored yet. Points appear once its first gameweek kicks off.</p>)}
          {tab === "fixtures" && <Fixtures league={league} gameweeks={gameweeks} start={fixturesStart} />}
          {tab === "table" && <Table league={league} gameweeks={gameweeks} squadId={Number(id)} wallet={wallet} />}
          {tab === "news" && <TeamNews league={league} mine={players} />}
        </div>
      </div>
    </div>
  );
}
