"use client";

// The player card: a popup with a player's price and season, points in their last five
// gameweeks and their next five fixtures by difficulty. The squad page adds its actions
// (captain, vice-captain, substitute, transfer) at the foot.
import { useEffect, useRef, useState } from "react";
import { api, fmtM, fmtPts, Player, PlayerDetail, SECTION } from "@/lib/api";
import { useDialog } from "./ui";

// difficulty 1 (easiest) to 5
const DIFFICULTY = ["", "bg-[#3ddc84] text-black", "bg-[#a7efc8] text-black", "bg-surface-2 text-text",
  "bg-[#ffb4ae] text-black", "bg-live text-black"];

const STATUS: Record<string, string> = { injured: "Injured", suspended: "Suspended", doubtful: "Doubtful", left_league: "Left the league" };

export default function PlayerCard({ league, player, codes, onClose, children }: {
  league: string; player: Player; codes: Map<string, string>; onClose: () => void; children?: React.ReactNode;
}) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDetail(null);
    api<PlayerDetail>(`/leagues/${league}/players/${player.id}`).then(setDetail).catch(() => {});
  }, [league, player.id]);
  const box = useDialog<HTMLDivElement>(true, onClose, close);

  const ppm = player.appearances ? player.points / player.appearances : null;
  const code = (n: string) => codes.get(n) ?? n.slice(0, 3).toUpperCase();
  const stats: [string, string][] = [
    ["Price", fmtM(player.price)], ["Form", fmtPts(player.form)], ["Pts / match", ppm == null ? "-" : fmtPts(Math.round(ppm * 10) / 10)],
    ["Total pts", fmtPts(player.points)], ["Selected", detail?.selected == null ? "-" : `${detail.selected}%`],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={player.name} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-bg shadow-[0_20px_60px_rgba(10,42,71,.3)] sm:max-w-xl sm:rounded-2xl">
        <div className="pitch-grass relative flex items-center gap-4 px-5 pb-5 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {player.club.logo && <img src={player.club.logo} alt="" className="h-16 w-16 shrink-0 rounded-full bg-white object-contain p-2" />}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">{SECTION[player.position].replace(/s$/, "")}</p>
            <p className="truncate text-2xl font-extrabold tracking-[-0.02em]">{player.name}</p>
            <p className="text-[15px]">{player.club.name}</p>
          </div>
          <button ref={close} onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-black hover:bg-white">
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          {player.status && (
            <p className="rounded-xl bg-danger/10 px-4 py-3 text-[15px] font-medium text-danger">
              {STATUS[player.status] ?? player.status}{player.status_reason ? `: ${player.status_reason}` : ""}
            </p>
          )}
          <dl className="grid grid-cols-5 divide-x divide-line rounded-xl border border-line py-3 text-center">
            {stats.map(([k, v]) => (
              <div key={k} className="px-1"><dt className="text-[12px] text-muted">{k}</dt><dd className="mt-0.5 text-lg font-bold">{v}</dd></div>
            ))}
          </dl>

          <div className="grid gap-5 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 text-[13px] font-semibold">Form</h3>
              {!detail ? <p className="text-sm text-muted">Loading…</p> : detail.recent.length === 0 ? <p className="text-sm text-muted">No games yet this season.</p> : (
                <ol className="flex gap-1.5">
                  {detail.recent.map((r) => (
                    <li key={r.gameweek} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                      <span className="text-[11px] text-muted">GW{r.gameweek}</span>
                      <span className="text-[12px] font-semibold">{code(r.opponent)}</span>
                      <span className="w-full rounded-md bg-surface-2 py-1 text-[13px] font-bold">{fmtPts(r.points)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-[13px] font-semibold">Fixtures</h3>
              {!detail ? <p className="text-sm text-muted">Loading…</p> : detail.upcoming.length === 0 ? <p className="text-sm text-muted">No fixtures left.</p> : (
                <ol className="flex gap-1.5">
                  {detail.upcoming.map((u, i) => (
                    <li key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                      <span className="text-[11px] text-muted">GW{u.gameweek}</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold">{code(u.opponent.name)} ({u.home ? "H" : "A"})</span>
                      <span className={`w-full rounded-md py-1 text-[13px] font-bold ${DIFFICULTY[u.difficulty]}`}
                        title={`Difficulty ${u.difficulty} of 5`}>{u.difficulty}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>

        {children && <div className="border-t border-line bg-bg px-5 py-4">{children}</div>}
      </div>
    </div>
  );
}
