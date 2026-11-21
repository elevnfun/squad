// Typed client for the $ELEVN Python API (proxied at /api by next.config.ts).

export type Position = "GK" | "DEF" | "MID" | "FWD";
export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
export const SECTION: Record<Position, string> = {
  GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Attackers",
};
export const SHORT: Record<Position, string> = { GK: "GK", DEF: "DEF", MID: "MID", FWD: "ATT" };
export const QUOTA: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
export const BUDGET = 100;
export const LEAGUE_NAMES: Record<string, string> = {
  "premier-league": "Premier League", "la-liga": "La Liga", "bundesliga": "Bundesliga",
};

export type Gameweek = {
  number: number; round: string; state: "open" | "locked" | "live" | "settling" | "settled";
  deadline: string | null; settles_at: string | null;
};
export type LeagueSummary = { slug: string; id: number; window: Gameweek | null; current: Gameweek | null; next: Gameweek | null };
export type Player = {
  id: number; name: string; position: Position; club: { id: number; name: string; logo: string | null };
  photo: string | null; price: number; points: number; appearances: number; form: number | null;
  status: string | null; status_reason: string | null;
};
export type Picks = { starters: number[]; bench: number[]; captain: number | null; vice_captain: number | null };
export type Problem = { code: string; message: string; players: number[] };
export type Transfer = { player_out: number; player_in: number; kind: "free" | "replacement" | "extra"; penalty: number };
export type CheckResult = {
  ok: boolean; problems: Problem[]; cost: number; budget: number; penalty: number; transfers: Transfer[];
};
export type SquadView = {
  id: number; league: string; slot: number; name: string | null; window: Gameweek | null;
  picks: Picks | null; saved_for_window: boolean; draft: Picks | null; budget: number | null;
  transfers: { out: number; in: number; kind: string; penalty: number }[];
};
export type Me = {
  wallet: string; balance: number; requirement: number; squads_allowed: number; is_admin: boolean;
  faucet: { amount: number; claimed: boolean } | null;   // the devnet test season's free tokens; null when off
  username: string | null; username_next_change: string | null;
  access?: { blitz: boolean; draft: boolean };                                   // what the wallet's $ELEVN unlocks
  winnings?: { ready_sol: number; locked_sol: number; frozen: boolean };
  chat: { can_post: boolean; reason: "username" | "squad" | "banned" | "muted" | null };
  squads:{ id: number; league: string; slot: number; name: string | null; frozen_at: string | null; unpaid: boolean; can_delete: boolean }[];
};
export type Prize = {
  id: number; league: string; gameweek: number; place: number; sol: number; sent_sol: number;
  instant_sol: number; vest_sol: number; days_paid: number; days: number; paused: boolean; returned_sol: number;
};
export type BatchItem = {
  id: number; kind: "instant" | "vest" | "buyback" | "burn" | "operations"; wallet: string | null; sol: number;
  tokens: number; prize: number | null; status: "pending" | "paid" | "failed" | "skipped"; signature: string | null; note: string | null;
};
export type Batch = { id: number; created_at: string; status: string; summary: { income?: number }; items: BatchItem[] };
export type AdminOverview = {
  fee_wallet: string; cluster: string; wallet_sol: number | null; accounted_sol: number;
  buckets: Record<string, number>; last_batch: Batch | null;
};
export type BatchTx = { idx: number; tx: string; items: number[]; label: string; versioned: boolean };
export type MatchLine = {
  fixture: number; match: string; status: string; minutes: number; points: number; breakdown: [string, number][];
};
export type GameweekPoints = {
  squad: { id: number; name: string | null; wallet: string; username: string | null; slot: number };
  gameweek: Gameweek; points: number; transfer_penalty: number; captain_used: number | null;
  auto_subs: [number, number][]; is_final: boolean; rank: number | null; squads: number; frozen_at: string | null;
  players: {
    id: number; slot: number; captain: boolean; vice_captain: boolean; name: string; position: Position;
    club: string; photo: string | null; counted: number | null; matches: MatchLine[];
  }[];
};
export type TableRow = {
  rank: number; squad: number; name: string; wallet: string; username: string | null; points: number; transfer_penalty: number; final: boolean;
  frozen: boolean;
};

export type Club = { id: number; name: string; logo: string | null };
export type Fixture = {
  id: number; kickoff: string; status: string; elapsed: number | null;
  home: Club & { goals: number | null }; away: Club & { goals: number | null };
};
export type StandingRow = { rank: number; squad: number; name: string; wallet: string; username: string | null; points: number; gameweeks: number };
export type SquadHistory = {
  squad: { id: number; name: string | null; wallet: string; username: string | null; slot: number };
  total: number; rank: number | null; squads: number;
  gameweeks: { number: number; points: number; transfer_penalty: number; final: boolean; rank: number; squads: number }[];
};
export type PlayerDetail = {
  recent: { gameweek: number; points: number; opponent: string; home: boolean; minutes: number }[];
  upcoming: { gameweek: number; kickoff: string; home: boolean; opponent: Club; difficulty: number }[];
  selected: number | null;
};
export type ChatMessage = {
  id: number; wallet: string; username: string | null; body: string; at: string; admin: boolean;
  reports?: number; held?: boolean;   // admin only: report count, and hidden by reports until restored
};
export type ChatPage = { messages: ChatMessage[]; hidden: number[] };
export const FINISHED = ["FT", "AET", "PEN"];
export const NOT_STARTED = ["NS", "TBD", "PST", "CANC"];

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

const UNREACHABLE = "elevn can't be reached right now. Try again in a minute.";

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  }).catch(() => { throw new ApiError(0, UNREACHABLE); });   // no connection at all
  if (!res.ok) {
    let detail: unknown;
    try { detail = (await res.json()).detail; } catch { detail = undefined; }
    const message = typeof detail === "string" ? detail : res.status === 422 ? "Squad can't be saved yet"
      : res.status >= 500 ? UNREACHABLE : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, detail);
  }
  return res.json() as Promise<T>;
}

export const fmtM = (n: number | null | undefined) => (n == null ? "-" : `${n.toFixed(1)}M`);
export const fmtPts = (n: number | null | undefined) => (n == null ? "-" : Number.isInteger(n) ? `${n}` : n.toFixed(1));
export const fmtSol = (n: number) => `${n.toFixed(n >= 1 ? 2 : 4)} SOL`;
// whole lamports, floored to 4 decimals, shown with at least 2 ("1.00", "0.4032"). Flooring means shares never add up to more than the pot.
export function sol(lamports: number): string {
  const units = Math.floor(Math.max(0, lamports) / 100_000);       // 1e-4 SOL
  if (lamports > 0 && units === 0) return "<0.0001";
  const s = (units / 10_000).toFixed(4).replace(/0{1,2}$/, "");
  return s.endsWith(".") ? `${s}00` : s;
}
export const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

// ---- elevn 2.0: contests, Today, boards and winnings (squad/api.py: /api/today, /api/contests, /api/winnings) ----
export type ContestKind = "blitz_matchday" | "blitz_week" | "draft_week";
export type ContestState = "open" | "live" | "review" | "final" | "rolled";
export type Contest = { id: number; kind: ContestKind; day: string | null; week_start: string; state: ContestState;
  locks_at: string | null; pot_lamports: number; pot_sol: number;
  pot_estimated: boolean;   // true: pot_lamports / pot_sol hold an estimate until the pot is funded at release
  first_kickoff: string | null; fixtures: number };
export type Today = { now: string; contests: Contest[];
  access: { balance: number | null; blitz: boolean; draft: boolean; blitz_requirement: number; draft_requirement: number } | null;
  winnings: { ready_lamports: number; ready_sol: number; locked_lamports: number; locked_sol: number; frozen: boolean } | null };
export type BoardRow = { place: number | null; wallet: string; username: string | null; points: number; captain_points: number;
  prize_lamports: number; prize_sol: number; you: boolean };
export type Board = { contest: Contest; rows: BoardRow[]; you: BoardRow | null; entrants: number };
export type WinningsEvent = { id: number; kind: "credit" | "collect" | "withdraw"; ready_delta: number; locked_delta: number;
  ready_sol: number; locked_sol: number; contest_id: number | null;
  contest: { kind: "blitz_matchday" | "blitz_week" | "draft_week"; day: string | null; week_start: string } | null;
  signature: string | null; status: "pending" | "confirmed" | "failed"; created_at: string };
export type Winnings = { ready: number; locked: number; withdrawable: number;
  ready_lamports: number; ready_sol: number; locked_lamports: number; locked_sol: number;
  withdrawable_lamports: number; withdrawable_sol: number; frozen: boolean; first_collect_at: string | null;
  next_withdraw_at: string | null; seconds_to_withdraw: number | null; can_collect: boolean; collect_reason: string | null;
  can_withdraw: boolean; withdraw_reason: string | null; requirement: number; history: WinningsEvent[] };
