"use client";

// Ranks (docs/design/mockups/ranks.html): the three prize boards as tabs, kept in the URL as ?board=matchday|weekly|draft.
// The open tab's board is fetched from GET /api/contests/{id}/board and polled every 30 seconds while the page is
// visible. Prize amounts are SOL only; the fixed weekly prize is named in dollars. While a contest is not final the
// API sends prize_sol 0, so what each place pays is worked out here from the pot and the 50/25/12/8/5 split.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { api, ApiError, Board, BoardRow, Contest, ContestKind, ContestState, shortWallet, sol, Today } from "@/lib/api";
import "./ranks.css";

const POLL_MS = 30_000;
const GIVE_UP_MS = 6_000;
const SPLIT = [50, 25, 12, 8, 5];
const WEEKLY_USD = [250, 125, 60, 40, 25];
const ORD = ["1st", "2nd", "3rd", "4th", "5th"];

type TabKey = "matchday" | "weekly" | "draft";
const TABS: { key: TabKey; kind: ContestKind; label: string; noun: string }[] = [
  { key: "matchday", kind: "blitz_matchday", label: "Blitz matchday", noun: "matchday" },
  { key: "weekly", kind: "blitz_week", label: "Blitz weekly · $500", noun: "week" },
  { key: "draft", kind: "draft_week", label: "Draft weekly", noun: "week" },
];

const BADGE: Record<ContestState, { cls: string; text: string }> = {
  open: { cls: "open", text: "Open" },
  live: { cls: "live", text: "Live" },
  review: { cls: "steel", text: "Result being checked" },
  final: { cls: "ft", text: "Final" },
  rolled: { cls: "steel", text: "Rolled forward" },
};

// ---- formatting ----
const count = (n: number) => n.toLocaleString("en-GB");
const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
};
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  return m === 1 ? "a minute ago" : m < 60 ? `${m} minutes ago` : "over an hour ago";
};

// ---- data ----
type Poll<T> = { status: "loading" | "ready" | "down"; data: T | null; at: number | null; stale: boolean };

function usePolled<T>(fetcher: (() => Promise<T | null>) | null, key: string): Poll<T> {
  const [state, setState] = useState<{ key: string; p: Poll<T> }>({ key, p: { status: "loading", data: null, at: null, stale: false } });
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  useEffect(() => {
    if (!fetchRef.current) return;
    let live = true;
    const visible = () => document.visibilityState === "visible";
    const load = async () => {
      const n = ++seq.current;
      let data: T | null = null;
      try { data = (await fetchRef.current?.()) ?? null; } catch { data = null; }
      if (!live || n !== seq.current) return;
      setState((s) => {
        const prev = s.key === key ? s.p : { status: "loading" as const, data: null, at: null, stale: false };
        return data ? { key, p: { status: "ready", data, at: Date.now(), stale: false } }
          : { key, p: prev.data ? { ...prev, stale: true } : { ...prev, status: "down" } };
      });
    };
    load();
    const poll = setInterval(() => { if (visible()) load(); }, POLL_MS);
    const back = () => { if (visible()) load(); };
    document.addEventListener("visibilitychange", back);
    const giveUp = setTimeout(() => setState((s) => (s.key === key && s.p.status === "loading" ? { key, p: { ...s.p, status: "down" } } : s)), GIVE_UP_MS);
    return () => { live = false; clearInterval(poll); clearTimeout(giveUp); document.removeEventListener("visibilitychange", back); };
  }, [key]);
  return state.key === key ? state.p : { status: "loading", data: null, at: null, stale: false };
}

// a stale session token: ask again as a guest
async function withGuestFallback<T>(path: string, token: string | null): Promise<T | null> {
  try { return await api<T>(path, { token }); } catch (e) {
    if (token && (e as ApiError).status === 401) { try { return await api<T>(path); } catch { return null; } }
    return null;
  }
}

// ---- what each place pays ----
// A board that is not final has no prize_lamports yet, so each place is worked out from the pot and the split.
// "unset": the server has no pot figure yet (not even an estimate), so only percentages can be shown.
// "short": fewer than 3 entrants, so nothing is paid unless more join. Tied places share the prizes they cover.
const unsetPot = (c: Contest) => c.state !== "final" && c.state !== "rolled" && c.kind !== "blitz_week" && c.pot_lamports === 0;
const shortBoard = (c: Contest, entrants: number) => c.state !== "final" && c.state !== "rolled" && entrants < 3;
const solOf = (lamports: number) => `${sol(Math.floor(lamports))} SOL`;

function pays(c: Contest, place: number, n = 1): { text: string; usd: boolean } | null {
  if (place < 1 || place > 5) return null;
  const idx = Array.from({ length: n }, (_, k) => place - 1 + k).filter((i) => i < 5);
  const pct = idx.reduce((t, i) => t + SPLIT[i], 0);
  if (c.kind === "blitz_week" && c.state !== "final") return { text: `$${idx.reduce((t, i) => t + WEEKLY_USD[i], 0) / n}`, usd: true };
  if (unsetPot(c)) return { text: `${pct / n}%`, usd: false };
  return { text: solOf(c.pot_lamports * pct / 100 / n), usd: false };
}
// how many rows share this place (a tie)
const tied = (rows: BoardRow[], you: BoardRow | null, place: number) => {
  const all = you && !rows.some((r) => r.you) ? [...rows, you] : rows;
  return Math.max(1, all.filter((r) => r.place === place).length);
};
function prizeCell(c: Contest, r: BoardRow, rows: BoardRow[], you: BoardRow | null, entrants: number): string {
  if (c.state === "rolled") return "–";
  if (c.state === "final") return r.prize_lamports > 0 ? solOf(r.prize_lamports) : "–";
  if (r.place == null || r.place > 5 || shortBoard(c, entrants)) return "–";
  return pays(c, r.place, tied(rows, you, r.place))?.text ?? "–";
}

function Row({ c, r, paid, b }: { c: Contest; r: BoardRow; paid: boolean; b: Board }) {
  const name = r.username || shortWallet(r.wallet);
  return (
    <li className={`rk-row${paid ? " paid" : ""}${r.you ? " you" : ""}`}>
      <span className="rk">{r.place ?? "–"}</span>
      <span className="wl" title={r.username ? `${r.username} · ${shortWallet(r.wallet)}` : r.wallet}>
        <span className="nm">{name}</span>{r.you && <span className="you-tag">You</span>}
      </span>
      <span className="cp">{count(r.captain_points)}</span>
      <span className="pts">{count(r.points)}</span>
      <span className="pz">{prizeCell(c, r, b.rows, b.you, b.entrants)}</span>
    </li>
  );
}

function BoardTable({ b }: { b: Board }) {
  const c = b.contest;
  const noLine = c.state === "rolled" || shortBoard(c, b.entrants);
  const rows = b.rows;
  // the prize line sits after the last paid place shown; places can repeat on a tie, so use the place the API gives
  let lastPaid = -1;
  rows.forEach((r, i) => { if (r.place != null && r.place <= 5) lastPaid = i; });
  const youShown = rows.some((r) => r.you);
  return (
    <div className="e2-card rk-board">
      <div className="rk-head" aria-hidden="true">
        <span>Rank</span><span>Player</span><span className="cp">Captain pts</span><span className="pts">Points</span><span className="pz">{c.state === "final" ? "Prize" : "Pays"}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rk-empty">No entries yet. Be the first.</p>
      ) : (
        <ol className="rk-rows" aria-label="Ranking">
          {rows.map((r, i) => (
            <FragmentRow key={`${r.wallet}-${i}`} b={b} r={r} i={i} lastPaid={lastPaid} noLine={noLine} />
          ))}
        </ol>
      )}
      {b.you && !youShown && (
        <>
          <div className="rk-gap" aria-hidden="true">Your place</div>
          <ol className="rk-rows" aria-label="Your place"><Row c={c} b={b} r={b.you} paid={!noLine && b.you.place != null && b.you.place <= 5} /></ol>
        </>
      )}
      <div className="rk-foot">
        <span>{rows.length > 0 ? `Showing ${rows.length} of ${count(Math.max(b.entrants, rows.length))} ${b.entrants === 1 ? "player" : "players"}` : `${count(b.entrants)} ${b.entrants === 1 ? "player" : "players"}`}</span>
        {rows.length > 0 && <span>Places repeat on a tie</span>}
      </div>
    </div>
  );
}

function FragmentRow({ b, r, i, lastPaid, noLine }: { b: Board; r: BoardRow; i: number; lastPaid: number; noLine: boolean }) {
  return (
    <>
      <Row c={b.contest} b={b} r={r} paid={!noLine && r.place != null && r.place <= 5} />
      {i === lastPaid && !noLine && <li className="rk-pline" aria-label="Prize line: places above are paid"><span>Prize line</span></li>}
    </>
  );
}

// the line above the table: where the signed-in wallet stands
function YourLine({ b }: { b: Board }) {
  const you = b.you;
  if (!you || you.place == null) return null;
  const c = b.contest;
  const fifth = b.rows[4];   // by row, not by place: a tie can leave no row numbered 5
  const short = shortBoard(c, b.entrants);
  const my = short ? null : pays(c, you.place, tied(b.rows, you, you.place));
  let head = `You are ${ordinal(you.place)}`;
  let tail = "";
  if (c.state === "rolled") tail = "This pot rolled forward, so nothing is paid here.";
  else if (c.state === "final") tail = you.prize_lamports > 0 ? `You won ${solOf(you.prize_lamports)}. Collect it on Winnings.` : "Not in the prizes this time.";
  else if (short) tail = "Needs 3 players, or the pot rolls forward.";
  else if (you.place <= 5) { head += ", in the prizes"; tail = my ? `${ordinal(you.place)} pays ${my.text}${unsetPot(c) ? " of the pot" : ""}.` : ""; }
  else if (fifth) {
    const gap = fifth.points - you.points;
    const p5 = pays(c, 5, tied(b.rows, null, 5));
    tail = `${count(Math.max(0, gap))} ${gap === 1 ? "point" : "points"} behind 5th place (${count(fifth.points)})${p5 ? `, which pays ${p5.text}${unsetPot(c) ? " of the pot" : ""}` : ""}.`;
  }
  return (
    <div className="e2-card rk-you">
      <div><span className="e2-eyebrow">Your place</span><p className="big">{head}</p></div>
      <p className="e2-small e2-muted tail">{count(you.points)} points{tail ? `. ${tail}` : ""}{c.state === "final" && you.prize_lamports > 0 ? <> <Link className="rk-tl" href="/winnings">Open Winnings</Link></> : null}{c.kind === "blitz_matchday" && (c.state === "open" || c.state === "live") ? <> <Link className="rk-tl" href="/blitz">Open your squads</Link></> : null}</p>
    </div>
  );
}

function Prizes({ c, noun }: { c: Contest | null; noun: string }) {
  const weekly = c?.kind === "blitz_week";
  const rolled = c?.state === "rolled";
  const unset = c != null && unsetPot(c);
  const estimated = c != null && c.pot_estimated && c.state !== "final" && !weekly;
  return (
    <aside className="e2-glass rk-side" aria-label="Prizes">
      <span className="e2-eyebrow">{weekly ? "Weekly prize" : rolled ? "Pot rolled forward" : estimated ? "Estimated pot" : c?.state === "final" ? "Prize pot" : "What each place pays"}</span>
      {weekly ? (
        <p className="rk-pot">$500</p>
      ) : rolled ? (
        <p className="rk-pot">–</p>
      ) : unset ? (
        <p className="rk-pot rk-pot-set">Set at full time</p>
      ) : (
        <p className="rk-pot">{c ? sol(c.pot_lamports) : "–"}<small>SOL</small></p>
      )}
      <p className="e2-small e2-muted" style={{ margin: 0 }}>
        {weekly ? "Fixed, paid in SOL to the top 5. Tuesday to Monday UK time: a wallet's score is its best 3 matchday totals added up."
          : rolled ? "Fewer than 3 entered, so this pot moved on to the next board. Nothing is paid here."
          : unset ? `The pot is set when the ${noun} ends. The top 5 are paid.`
          : `${estimated ? "It firms up as the " + noun + " goes on" : "Pot for this " + noun}. The top 5 are paid.`}
      </p>
      <div className="rk-prz">
        {ORD.map((o, i) => (
          <div className="r" key={o}>
            <span className="p">{o}</span><span className="pc">{SPLIT[i]}%</span>
            <span className="am">{weekly ? `$${WEEKLY_USD[i]}` : rolled ? "–" : unset ? "" : c ? solOf(c.pot_lamports * SPLIT[i] / 100) : "–"}</span>
          </div>
        ))}
      </div>
      <p className="e2-small e2-steel2" style={{ margin: "16px 0 0" }}>
        Ties: more captain points wins, else the tied wallets share the prizes of the places they cover. A board needs at least 3 entrants, or its pot rolls forward.
        Results are final 15 minutes after the last match. Winners collect on <Link className="rk-tl" href="/winnings">Winnings</Link>: half at once, the other half is locked, and 20% of it can be withdrawn every 24 hours.
      </p>
    </aside>
  );
}

function stateNote(c: Contest): string | null {
  if (c.state === "rolled") return "Under 3 entrants: the pot rolled forward";
  if (c.state === "review") return "Result being checked. Winners can collect once it is released.";
  return null;
}

export default function RanksView() {
  const { wallet, token } = useAuth();
  const params = useSearchParams();
  const param = params.get("board");
  const tab = TABS.find((t) => t.key === param) ?? TABS[0];
  const signedIn = Boolean(wallet && token);
  const tk = signedIn ? token : null;

  const today = usePolled<Today>(useCallback(() => withGuestFallback<Today>("/today", tk), [tk]), `today:${tk ?? ""}`);
  const contest = today.data?.contests.find((c) => c.kind === tab.kind) ?? null;
  const cid = contest?.id ?? null;
  const board = usePolled<Board>(
    cid == null ? null : () => withGuestFallback<Board>(`/contests/${cid}/board?limit=50`, tk),
    `board:${cid}:${tk ?? ""}`,
  );
  // the contest's state moves with the board, which is polled as often as /today
  const c: Contest | null = board.data?.contest ?? contest;
  const b = cid != null ? board.data : null;

  const loading = today.status === "loading" || (cid != null && board.status === "loading");
  const down = today.data == null && today.status === "down";
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force((n) => n + 1), 10_000); return () => clearInterval(i); }, []);
  const at = board.at ?? today.at;
  const updated = loading ? "Loading the board"
    : down ? "Can't reach elevn right now. Trying again every 30 seconds."
    : board.stale || today.stale ? "Can't refresh right now. Showing the last update."
    : cid == null ? "" : `Updated ${at ? ago(Date.now() - at) : "just now"}`;

  const title = !c ? tab.label
    : c.kind === "blitz_matchday" && c.day ? longDay(c.day)
    : c.week_start ? `${longDay(c.week_start)} to ${longDay(plusDays(c.week_start, 6))}`
    : tab.label;
  const sub = c?.kind === "blitz_matchday" ? "Matchday total, three squads"
    : c?.kind === "blitz_week" ? "Best 3 matchday totals added up, Tuesday to Monday UK time"
    : "Draft team points, Friday to Monday";
  const note = c ? stateNote(c) : null;
  const needs = c != null && b != null && shortBoard(c, b.entrants);

  return (
    <div className="e2-page">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="e2-ph">
        <div>
          <span className="e2-eyebrow">Ranks · top 5 are paid</span>
          <p className="e2-small e2-muted">{updated}</p>
        </div>
        <div className="w"><h1 className="e2-word">Ranks</h1></div>
      </div>

      <nav className="rk-tabs" aria-label="Boards">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "matchday" ? "/ranks" : `/ranks?board=${t.key}`} scroll={false} replace
            aria-current={t.key === tab.key ? "page" : undefined} className={t.key === tab.key ? "on" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="e2-g" style={{ paddingBottom: 96, alignItems: "start" }}>
        <div className="e2-col" style={{ "--n": 8 } as React.CSSProperties}>
          {cid == null ? (
            <div className="e2-card rk-none">
              <h2 className="h">{tab.label}</h2>
              <p>{loading ? "Loading the board" : down ? "Can't reach elevn right now." : "No board yet"}</p>
              {!loading && !down && <p className="e2-small e2-muted">It appears here as soon as fixtures are loaded for this {tab.noun}.</p>}
            </div>
          ) : (
            <div className="e2-stack" style={{ "--gap": "24px" } as React.CSSProperties}>
              {b && <YourLine b={b} />}
              <div className="rk-title">
                <div><h2 className="h">{title}</h2><p className="e2-small e2-muted">{sub}</p></div>
                {c && <span className={`e2-badge ${BADGE[c.state].cls}`}>{BADGE[c.state].text}</span>}
              </div>
              {note && <p className="rk-note" role="status">{note}</p>}
              {needs && <p className="rk-note" role="status">Needs 3 players, or the pot rolls forward.</p>}
              {b ? <BoardTable b={b} />
                : <div className="e2-card rk-none"><p>{board.status === "down" ? "Can't load this board right now. Trying again every 30 seconds." : "Loading the board"}</p></div>}
            </div>
          )}
        </div>
        <div className="e2-col" style={{ "--n": 4 } as React.CSSProperties}>
          <Prizes c={cid == null ? null : c} noun={tab.noun} />
        </div>
      </div>
    </div>
  );
}
