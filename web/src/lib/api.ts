// Typed client for the $ELEVN Python API (proxied at /api by next.config.ts).

export type Me = {
  wallet: string; balance: number; requirement: number; is_admin: boolean;
  faucet: { amount: number; claimed: boolean } | null;   // the devnet test season's free tokens; null when off
  username: string | null; username_next_change: string | null;
  access?: { blitz: boolean; draft: boolean };                                   // what the wallet's $ELEVN unlocks
  winnings?: { ready_sol: number; locked_sol: number; frozen: boolean };
  chat: { can_post: boolean; reason: "username" | "squad" | "banned" | "muted" | null };
};
export type ChatMessage = {
  id: number; wallet: string; username: string | null; body: string; at: string; admin: boolean;
  reports?: number; held?: boolean;   // admin only: report count, and hidden by reports until restored
};
export type ChatPage = { messages: ChatMessage[]; hidden: number[] };

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
    const message = typeof detail === "string" ? detail : res.status >= 500 ? UNREACHABLE : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, detail);
  }
  return res.json() as Promise<T>;
}

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

// ---- Matchday Blitz pick page (GET /api/blitz/next, POST /api/blitz/check, PUT/DELETE /api/blitz/{day}/squads/{slot}) ----
export type BlitzPlayer = { id: number; name: string; position: string; club_id: number; avg?: number | null };
export type BlitzTeam = { id: number; name: string; players: BlitzPlayer[] };
export type BlitzFixture = {
  id: number; kickoff: string; status: string; state: string; can_pick: boolean;
  league?: string | null;   // "Premier League" etc. when the API sends it; the page groups by it
  home: BlitzTeam; away: BlitzTeam;
};
export type BlitzSquadState = "open" | "live" | "full_time" | "banked";
export type BlitzSquad = {
  slot: number; fixture_id: number; kickoff: string; captain_id: number | null; locked: boolean; state: BlitzSquadState;
  points: number | null; captain_points: number | null;
  players: { id: number; name: string; position: string; points: number | null; is_captain: boolean; club_id?: number }[];
};
export type BlitzMine = { squads: BlitzSquad[]; total: number | null; captain_points: number | null };
export type BlitzContest = { id?: number; day: string; state: ContestState; pot_sol: number; pot_estimated: boolean };
export type BlitzDay = { contest: BlitzContest | null; squads_allowed: number; fixtures: BlitzFixture[]; mine?: BlitzMine | null };
export type BlitzBody = { fixture_id: number; player_ids: number[]; captain_id: number | null };
export type BlitzCheck = { ok: boolean; problems: string[] };

export const fetchBlitzNext = (token?: string | null) => api<BlitzDay>("/blitz/next", { token });
export const checkBlitzSquad = (body: BlitzBody, token?: string | null) =>
  api<BlitzCheck>("/blitz/check", { method: "POST", body, token });
export const saveBlitzSquad = (day: string, slot: number, body: BlitzBody, token: string) =>
  api<BlitzMine>(`/blitz/${day}/squads/${slot}`, { method: "PUT", body, token });
export const deleteBlitzSquad = (day: string, slot: number, token: string) =>
  api<BlitzMine>(`/blitz/${day}/squads/${slot}`, { method: "DELETE", token });

// ---- Matchday Blitz "Banked" screen (GET /api/blitz/{day}/mine, signed in) ----
export type BlitzMineFull = BlitzMine & { place: number | null; entrants: number; prize_lamports: number; prize_sol: number };
export const fetchBlitzDay = (day: string, token?: string | null) => api<BlitzDay>(`/blitz/${day}`, { token });
export const fetchBlitzMineFull = (day: string, token: string) => api<BlitzMineFull>(`/blitz/${day}/mine`, { token });

// ---- Weekly Draft page (GET /api/draft/{week}, POST .../packs/{pack}/open, POST .../check, PUT .../team, POST .../swap) ----
// {week} is "next" or the YYYY-MM-DD Tuesday the week starts on.
export type DraftTier = "top" | "mid" | "budget";
export type DraftPackRow = {
  pack: number; tier: DraftTier; player_id: number | null; name: string | null; position: string | null; club: string | null;
  value: number | null; opened_at: string | null;
  in_team?: boolean;   // own packs only (the sample has none)
};
// the saved team carries no club or tier: the page reads those from the packs
export type DraftTeamPlayer = { id: number; name: string; position: string; points: number | null; is_captain: boolean };
export type DraftState = "open" | "locked" | "live" | "final";
// points are the points counted: the captain's are already doubled by the API (never double them again)
export type DraftMine = {
  packs: DraftPackRow[]; team: DraftTeamPlayer[]; captain_id: number | null; state: DraftState; total: number | null; captain_points?: number;
};
// GET /api/draft/{week}/mine adds the place and prize if the week ended now
export type DraftMineFull = DraftMine & { place: number | null; entrants: number; prize_lamports: number; prize_sol: number };
// a rule is one number for everything, or one number per position / tier
export type DraftLimit = number | Record<string, number>;
export type DraftRules = {
  team_size: number; min_per_position: DraftLimit; max_per_club: number; max_per_tier: DraftLimit; captain_multiplier: number; requirement: number;
};
export type DraftFixture = { id: number; kickoff: string; status: string; home: string; away: string };
export type DraftContest = {
  id?: number; week_start?: string; state?: string; pot_sol?: number | null; pot_estimated?: boolean; locks_at?: string | null;
} | null;
export type DraftWeek = {
  contest: DraftContest; locks_at: string | null; fixtures: DraftFixture[]; rules: DraftRules; mine?: DraftMine | null; sample?: DraftPackRow[] | null;
};
export type DraftTeamBody = { team_ids: number[]; captain_id: number | null };
export type DraftCheckBody = DraftTeamBody & { pool_player_ids: number[] };

export const fetchDraft = (week: string, token?: string | null) => api<DraftWeek>(`/draft/${week}`, { token });
export const fetchDraftMine = (week: string, token: string) => api<DraftMineFull>(`/draft/${week}/mine`, { token });
export const openDraftPack = (week: string, pack: number, token: string) =>
  api<DraftMine>(`/draft/${week}/packs/${pack}/open`, { method: "POST", body: {}, token });
export const checkDraftTeam = (week: string, body: DraftCheckBody, token?: string | null) =>
  api<BlitzCheck>(`/draft/${week}/check`, { method: "POST", body, token });
export const saveDraftTeam = (week: string, body: DraftTeamBody, token: string) =>
  api<DraftMine>(`/draft/${week}/team`, { method: "PUT", body, token });
export const swapDraftPlayer = (week: string, body: { out_id: number; in_id: number }, token: string) =>
  api<DraftMine>(`/draft/${week}/swap`, { method: "POST", body, token });

// ---- Penalty Shootout side game (GET /api/shootout, POST /api/shootout/start, /{token}/shoot, /{token}/keep) ----
// No prize. Ranked games need a signed-in wallet and are limited per day; practice is open to guests.
// Errors are HTTP 400 with a plain message in `detail` (ApiError.message carries it as is).
export type ShootoutSide = "left" | "centre" | "right";
export type ShootoutPower = "low" | "medium" | "high";
export type ShootoutMode = "ranked" | "practice";
export type ShootoutRow = {
  wallet: string; name?: string | null; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; games: number;
};
export type ShootoutInfo = {
  rules: { rounds: number; ranked_games_per_day: number; sides?: unknown; powers: unknown; miss?: unknown; save?: unknown }; ranked_left?: number; board: ShootoutRow[];
};
export type ShootoutScore = { for: number; against: number };
export type ShootoutKick = {
  kind: "shoot" | "keep"; round: number; shot_side: ShootoutSide; power: ShootoutPower | null; keeper_side: ShootoutSide;
  result: "goal" | "saved" | "missed";
};
// start, shoot, keep and GET /shootout/{token} all return a game view; `kick` is present on shoot and keep only
export type ShootoutGame = {
  token: string; mode: ShootoutMode; state: "playing" | "done"; turn: "shoot" | "keep" | null; round: number; rounds: number;
  score: ShootoutScore; kicks: ShootoutKick[]; kick?: ShootoutKick; result?: "win" | "draw" | "loss";
};

export const fetchShootout = (token?: string | null) => api<ShootoutInfo>("/shootout", { token });
export const startShootout = (mode: ShootoutMode, token?: string | null) =>
  api<ShootoutGame>("/shootout/start", { method: "POST", body: { mode }, token });
export const shootoutShoot = (game: string, side: ShootoutSide, power: ShootoutPower, token?: string | null) =>
  api<ShootoutGame>(`/shootout/${encodeURIComponent(game)}/shoot`, { method: "POST", body: { side, power }, token });
export const shootoutKeep = (game: string, side: ShootoutSide, token?: string | null) =>
  api<ShootoutGame>(`/shootout/${encodeURIComponent(game)}/keep`, { method: "POST", body: { side }, token });
