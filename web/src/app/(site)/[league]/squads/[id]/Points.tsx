"use client";

// A squad's gameweek on a pitch: live points (refreshed every 30 s while matches run),
// point alerts as they happen, per-player breakdown, rank and a shareable result card.
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtPts, GameweekPoints, LEAGUE_NAMES, shortWallet } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { Button, Card, Loading, StateBadge } from "@/components/ui";
import { LINES, Pitch, Shirt, surname } from "@/components/pitch/Pitch";

type P = GameweekPoints["players"][number];
type Alert = { id: number; text: string };

const total = (p: P) => p.matches.reduce((s, m) => s + m.points, 0);

export default function Points({ embedded = false }: { embedded?: boolean }) {
  const { league, id } = useParams<{ league: string; id: string }>();
  const gw = useSearchParams().get("gw");
  const { token } = useAuth();
  const [data, setData] = useState<GameweekPoints | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const prev = useRef<GameweekPoints | null>(null);

  const load = useCallback(async () => {
    if (!gw) return;
    try {
      const d = await api<GameweekPoints>(`/squads/${id}/gameweeks/${gw}`, { token });
      // point alerts: compare each player's breakdown with the last refresh
      if (prev.current) {
        const before = new Map(prev.current.players.map((p) => [p.id, p]));
        const fresh: Alert[] = [];
        for (const p of d.players) {
          const was = before.get(p.id);
          const b = new Map((was?.matches ?? []).flatMap((m) => m.breakdown.map(([k, v]) => [`${m.fixture}:${k}`, v])));
          for (const m of p.matches) for (const [k, v] of m.breakdown) {
            const delta = v - (b.get(`${m.fixture}:${k}`) ?? 0);
            if (Math.abs(delta) >= 1) fresh.push({ id: Date.now() + Math.random(), text: `${p.name}: ${k} ${delta > 0 ? "+" : ""}${fmtPts(delta)}` });
          }
        }
        if (d.rank && prev.current.rank && d.rank !== prev.current.rank)
          fresh.push({ id: Date.now() + Math.random(), text: `Rank ${prev.current.rank} → ${d.rank}` });
        if (fresh.length) setAlerts((a) => [...fresh, ...a].slice(0, 5));
      }
      prev.current = d;
      setData(d); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [id, gw, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || !["locked", "live", "settling"].includes(data.gameweek.state)) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [data, load]);

  if (!gw) return <p className="pt-8 text-muted">Pick a gameweek from the league page.</p>;
  if (error) return <p className={embedded ? "text-danger" : "pt-8 text-danger"}>{error}</p>;
  if (!data) return <Loading label="Loading points" className={embedded ? "" : "mt-8"} />;

  const title = data.squad.name ?? `Squad ${data.squad.slot}`;
  if (data.players.length === 0) {
    return (
      <div className={embedded ? "space-y-4" : "space-y-4 pt-12"}>
        {!embedded && <Link href={`/${league}`} className="link text-sm">{LEAGUE_NAMES[league] ?? league}</Link>}
        {!embedded && <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em]">{title}</h1>}
        <Card className="space-y-2">
          <p className="font-medium">No team for gameweek {data.gameweek.number}</p>
          <p className="text-sm text-muted">
            This squad wasn&apos;t picked before the gameweek {data.gameweek.number} deadline, so it has no points for it.
          </p>
          {token && <Link href={`/${league}/squads/${id}?tab=pick`} className="btn btn-primary btn-sm mt-2">Pick team</Link>}
        </Card>
      </div>
    );
  }

  const xi = data.players.filter((p) => p.counted !== null);
  const bench = data.players.filter((p) => p.counted === null);
  const subbedIn = new Set(data.auto_subs.map(([, i]) => i));
  const share = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); setAlerts((a) => [{ id: Date.now(), text: "Link copied" }, ...a]); } catch {}
  };

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 pt-12"}>
      <div className={embedded ? "" : "border-b border-line pb-8"}>
        {!embedded && <Link href={`/${league}`} className="link text-sm">{LEAGUE_NAMES[league] ?? league}</Link>}
        <div className={`flex flex-wrap items-end justify-between gap-6 ${embedded ? "" : "mt-2"}`}>
          <div>
            {embedded ? <h2 className="text-2xl font-bold tracking-[-0.02em]">Gameweek {data.gameweek.number}</h2>
              : <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em]">{title}</h1>}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              {!embedded && <span>Gameweek {data.gameweek.number}</span>} <StateBadge state={data.gameweek.state} />
              {!embedded && <span className="text-[13px]">{data.squad.username ? `by ${data.squad.username}` : `Wallet ${shortWallet(data.squad.wallet)}`}</span>}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-6xl font-extrabold tracking-[-0.03em]">{fmtPts(data.points)}<span className="ml-1 text-xl font-semibold text-muted">pts</span></p>
            <p className="mt-1 text-muted">
              {data.rank ? `Rank ${data.rank} of ${data.squads}` : "Not ranked yet"}
              {data.transfer_penalty ? `, ${data.transfer_penalty} for transfers` : ""}
              {data.is_final ? ", final" : ""}
            </p>
          </div>
        </div>
      </div>

      {data.frozen_at && (
        <p className="rounded-xl border border-danger/40 bg-surface p-4 text-danger">
          Frozen at {new Date(data.frozen_at).toLocaleString()}: the wallet dropped below what this squad needs.
          Matches after that don&apos;t count, and it can&apos;t win a prize this gameweek.
        </p>
      )}

      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a) => <p key={a.id} className="flex items-center gap-2 rounded-lg bg-wash px-4 py-2.5 text-[15px]"><span className="h-2 w-2 rounded-full bg-highlight" /> {a.text}</p>)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div>
          <Pitch rows={LINES.map((pos) => xi.filter((p) => p.position === pos).map((p) => (
            <Chip key={p.id} p={p} points={p.counted ?? 0} captain={data.captain_used === p.id} sub={subbedIn.has(p.id)}
              selected={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} />
          )))} />
          {bench.length > 0 && (
            <div className="mt-3 rounded-xl bg-surface-2 px-4 py-4">
              <p className="mb-3 text-[13px] font-medium text-muted">Bench</p>
              <div className="flex justify-evenly gap-1">
                {bench.map((p) => <Chip key={p.id} p={p} points={total(p)} dim selected={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} />)}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          {open != null ? <Breakdown p={data.players.find((p) => p.id === open)!} />
            : <Card><p className="text-muted">Tap a player to see how they scored.</p></Card>}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={share}>Copy link</Button>
            <a href={`/card/${id}/${gw}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">Result card</a>
          </div>
        </div>
      </div>

    </div>
  );
}

function Chip({ p, points, captain, sub, dim, selected, onClick }: {
  p: P; points: number; captain?: boolean; sub?: boolean; dim?: boolean; selected?: boolean; onClick: () => void;
}) {
  const playing = p.matches.some((m) => !["FT", "AET", "PEN", "NS", "TBD", "PST", "CANC"].includes(m.status));
  return (
    <Shirt name={surname(p.name)} points={fmtPts(points)} captain={captain}
      vice={!captain && p.vice_captain} dim={dim} selected={selected} onClick={onClick}
      note={captain ? "Captain x2" : sub ? "Sub on" : playing ? "Playing" : undefined} />
  );
}

function Breakdown({ p }: { p: P }) {
  return (
    <Card>
      <p className="text-lg font-semibold">{p.name}</p>
      <p className="text-muted">{p.club}</p>
      {p.matches.length === 0 && <p className="mt-2 text-sm text-muted">No match this gameweek.</p>}
      {p.matches.map((m) => (
        <div key={m.fixture} className="mt-3">
          <p className="text-sm text-muted">{m.match}, {m.minutes}&apos;, {m.status}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {m.breakdown.map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span className="font-semibold">{v > 0 ? "+" : ""}{fmtPts(v)}</span></li>
            ))}
            <li className="flex justify-between border-t border-line pt-1 font-medium"><span>Match points</span><span className="font-semibold">{fmtPts(m.points)}</span></li>
          </ul>
        </div>
      ))}
      <p className="mt-3 text-[13px] text-muted">Before captain and Rising Star bonuses. Negative points are never multiplied.</p>
    </Card>
  );
}
