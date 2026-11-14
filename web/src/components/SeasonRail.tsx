// The whole season as one row of ticks: played in gold, the gameweek in focus lit, the rest waiting.
// Red only while matches are on, as everywhere else on the site.
import type { CSSProperties } from "react";
import type { Gameweek } from "@/lib/api";

function tickTone(gameweek: Gameweek, focus: number | null): string {
  if (gameweek.state === "live") return "bg-live animate-pulse motion-reduce:animate-none";
  if (gameweek.number === focus) return "bg-text";
  return gameweek.state === "settled" ? "bg-accent" : "bg-white/15";
}

export default function SeasonRail({ gameweeks, focus }: { gameweeks: Gameweek[]; focus: number | null }) {
  if (!gameweeks.length) return null;
  const played = gameweeks.filter((g) => g.state === "settled").length;
  const summary = focus == null ? `${played} of ${gameweeks.length} gameweeks played` : `Gameweek ${focus} of ${gameweeks.length}`;
  return (
    <div className="basis-full">
      <p className="mb-2 flex justify-between text-[13px] text-muted">
        <span>Season</span><span className="tabular-nums">{summary}</span>
      </p>
      <div role="img" aria-label={`${summary}, ${played} played`} className="flex gap-[3px]">
        {gameweeks.map((g, i) => (
          <span key={g.number} style={{ "--i": i } as CSSProperties} className={`rail-tick h-1.5 flex-1 rounded-full ${tickTone(g, focus)}`} />
        ))}
      </div>
    </div>
  );
}
