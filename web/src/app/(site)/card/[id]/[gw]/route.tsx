import { ImageResponse } from "next/og";

// Shareable result card (1200 x 630) for a squad's gameweek.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

type Data = {
  squad: { name: string | null; wallet: string; username: string | null }; gameweek: { number: number; state: string };
  points: number; rank: number | null; squads: number; is_final: boolean;
  players: { name: string; counted: number | null }[];
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; gw: string }> }) {
  const { id, gw } = await params;
  const res = await fetch(`${API_URL}/api/squads/${id}/gameweeks/${gw}`, {
    cache: "no-store", headers: { "x-elevn-gate": process.env.API_GATE_SECRET ?? "" } });
  const d: Data | null = res.ok ? await res.json() : null;
  const top = d?.players.filter((p) => p.counted != null).sort((a, b) => (b.counted ?? 0) - (a.counted ?? 0))[0];
  const name = d ? d.squad.name ?? d.squad.username ?? `${d.squad.wallet.slice(0, 4)}…${d.squad.wallet.slice(-4)}` : "elevn";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: "#0a0b0d", borderBottom: "24px solid #1b4d2e", color: "#ffffff", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 36, fontWeight: 800 }}>
          <span>elevn<span style={{ color: "#f2c14e" }}>.</span></span>
          <span style={{ color: "#b9d3c3", fontWeight: 500 }}>{d ? `Gameweek ${d.gameweek.number}` : ""}</span>
        </div>
        {d ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 44, fontWeight: 600 }}>{name}</span>
            <span style={{ fontSize: 180, fontWeight: 800, color: "#ffffff", lineHeight: 1, letterSpacing: -6 }}>{d.points % 1 ? d.points.toFixed(1) : d.points}</span>
            <span style={{ display: "flex", alignItems: "center", fontSize: 36, color: "#b9d3c3" }}>
              points{d.rank ? `, rank ${d.rank} of ${d.squads}` : ""}
              {!d.is_final && <span style={{ marginLeft: 20, padding: "4px 16px", borderRadius: 999, background: "#ff5a52", color: "#0a0b0d", fontSize: 28, fontWeight: 700 }}>Live</span>}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 56 }}>This squad is hidden until the gameweek locks</span>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#b9d3c3" }}>
          <span>{top ? `Top scorer: ${top.name} (${Math.round((top.counted ?? 0) * 10) / 10})` : ""}</span>
          <span>elevn.fun</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
