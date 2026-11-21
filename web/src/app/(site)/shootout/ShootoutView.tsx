"use client";

// Penalty Shootout side game (docs/build/SHOOTOUT_PLAN.md, docs/design/mockups/shootout.html for the page frame).
// No prize, no holding. Five rounds: the player takes a penalty (aim left / centre / right, power low / medium / high)
// and then faces one (dive left / centre / right). The server rolls the dice and says where the keeper went and what
// happened; this page draws the goal, the keeper, the ball flight and the result. Ranked games need a connected wallet
// and are limited per day; practice is unlimited and works for guests (nothing is saved).
// Data: GET /api/shootout, POST /api/shootout/start, POST /api/shootout/{token}/shoot and /keep (all in lib/api.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import {
  ApiError, ShootoutGame, ShootoutInfo, ShootoutKick, ShootoutMode, ShootoutPower, ShootoutRow, ShootoutScore, ShootoutSide,
  fetchShootout, shootoutKeep, shootoutShoot, shortWallet, startShootout,
} from "@/lib/api";
import "./shootout.css";

type Result = ShootoutKick["result"];
type Hist = { kind: "shoot" | "keep"; result: Result };
type Game = {
  token: string; mode: ShootoutMode; round: number; turn: "shoot" | "keep"; score: ShootoutScore; done: boolean; outcome: "win" | "draw" | "loss" | null; rounds: number; history: Hist[];
};
type Stamp = { kind: "shoot" | "keep"; result: Result; over: boolean };

const SIDES: ShootoutSide[] = ["left", "centre", "right"];
const POWERS: { id: ShootoutPower; label: string; bars: number }[] = [
  { id: "low", label: "Low", bars: 1 }, { id: "medium", label: "Medium", bars: 2 }, { id: "high", label: "High", bars: 3 },
];
const HOLD_MS = 1400;       // how long a result stays up before the next kick
const BOARD_ROWS = 10;

// ---------------------------------------------------------------- the scene (one SVG, 800 x 480, seen from the penalty spot)
const GOAL = { l: 100, r: 700, t: 56, b: 262 };
const BACK = { l: 146, r: 654, t: 82, b: 246 };
const VB_Y = 24, VB_H = 420;     // the visible slice of the scene
const KS = 1.12;                  // the keeper's scale
const SPOT = { x: 400, y: 408, r: 17 };
const TX: Record<ShootoutSide, number> = { left: 200, centre: 400, right: 600 };
const TY: Record<ShootoutPower, number> = { low: 232, medium: 170, high: 102 };
const KEEPER_HOME = { x: 400, y: GOAL.b };
const PIVOT_Y = -48 * KS;          // the keeper's hips, in his own coordinates (feet at 0)
const ARM = 38;
const SHOULDER_X = 19;
const SHOULDER_Y = -86;

type Ball = { x: number; y: number; r: number; spin: number; shadow: number };
type Keeper = { dx: number; dy: number; rot: number; arms: number };
type Anim = { ball: Ball; k: Keeper; ripple: number; moving: boolean };
const IDLE: Anim = { ball: { x: SPOT.x, y: SPOT.y, r: SPOT.r, spin: 0, shadow: 1 }, k: { dx: 0, dy: 0, rot: 0, arms: 0 }, ripple: 0, moving: false };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut2 = (t: number) => 1 - (1 - t) * (1 - t);
const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);

// the keeper's two hands in scene coordinates for a pose
function hands(k: Keeper): [number, number][] {
  const th = (lerp(26, 168, k.arms) * Math.PI) / 180;
  const a = (k.rot * Math.PI) / 180;
  const cx = KEEPER_HOME.x + k.dx, cy = KEEPER_HOME.y + k.dy;
  return [-1, 1].map((s) => {
    const x = KS * (s * SHOULDER_X + s * Math.sin(th) * (ARM + 6));
    const y = KS * (SHOULDER_Y + Math.cos(th) * (ARM + 6));
    const rx = x * Math.cos(a) - (y - PIVOT_Y) * Math.sin(a);
    const ry = x * Math.sin(a) + (y - PIVOT_Y) * Math.cos(a) + PIVOT_Y;
    return [cx + rx, cy + ry] as [number, number];
  });
}

function keeperEnd(side: ShootoutSide): Keeper {
  if (side === "centre") return { dx: 0, dy: -4, rot: 0, arms: 1 };
  const s = side === "left" ? -1 : 1;
  return { dx: s * 165, dy: -14, rot: s * 72, arms: 1 };
}

// where a kick ends up: the ball's end point and what it does after it gets there
function ballPlan(kick: ShootoutKick, kind: "shoot" | "keep", power: ShootoutPower | null, round: number) {
  const side = kick.shot_side;
  const key = keeperEnd(kick.keeper_side);
  const ty = power ? TY[power] : [TY.medium, TY.low, TY.high][(round + SIDES.indexOf(side)) % 3];
  let end = { x: TX[side], y: ty, r: 10 };
  let after = { x: end.x + (side === "left" ? 7 : side === "right" ? -7 : 0), y: end.y + 10, r: 8.5 };
  let over = false;
  if (kick.result === "missed") {
    over = side === "centre" || power === "high" || (power == null && round % 2 === 0);
    end = over ? { x: TX[side], y: 8, r: 8 } : { x: side === "left" ? 56 : 744, y: 150, r: 8 };
    after = { x: end.x + (over ? 0 : side === "left" ? -30 : 30), y: end.y - (over ? 30 : 0), r: 6 };
  } else if (kick.result === "saved") {
    const h = hands(key);
    const pick = side === "left" ? (h[0][0] < h[1][0] ? h[0] : h[1]) : side === "right" ? (h[0][0] > h[1][0] ? h[0] : h[1]) : (h[0][1] < h[1][1] ? h[0] : h[1]);
    end = { x: pick[0], y: pick[1], r: 10 };
    after = { x: end.x + (side === "left" ? -34 : side === "right" ? 34 : 0), y: end.y + 44, r: 11 };
  }
  void kind;
  return { end, after, key, over, ripple: kick.result === "goal" };
}

const NET_V = 20, NET_H = 9;
function Net({ ripple }: { ripple: number }) {
  const lines: React.ReactNode[] = [];
  for (let i = 0; i <= NET_V; i++) {
    const x = lerp(BACK.l, BACK.r, i / NET_V);
    lines.push(<line key={`bv${i}`} x1={x} y1={BACK.t} x2={x} y2={BACK.b} />);
  }
  for (let i = 0; i <= NET_H; i++) {
    const y = lerp(BACK.t, BACK.b, i / NET_H);
    lines.push(<line key={`bh${i}`} x1={BACK.l} y1={y} x2={BACK.r} y2={y} />);
  }
  for (let i = 0; i <= 18; i++) {   // the roof of the net
    lines.push(<line key={`t${i}`} x1={lerp(GOAL.l, GOAL.r, i / 18)} y1={GOAL.t} x2={lerp(BACK.l, BACK.r, i / 18)} y2={BACK.t} />);
  }
  for (let i = 0; i <= 8; i++) {    // the two side nets
    const f = i / 8;
    lines.push(<line key={`l${i}`} x1={GOAL.l} y1={lerp(GOAL.t, GOAL.b, f)} x2={BACK.l} y2={lerp(BACK.t, BACK.b, f)} />);
    lines.push(<line key={`r${i}`} x1={GOAL.r} y1={lerp(GOAL.t, GOAL.b, f)} x2={BACK.r} y2={lerp(BACK.t, BACK.b, f)} />);
  }
  for (let i = 1; i <= 4; i++) {
    const f = i / 5;
    lines.push(<line key={`tl${i}`} x1={lerp(GOAL.l, BACK.l, f)} y1={lerp(GOAL.t, BACK.t, f)} x2={lerp(GOAL.r, BACK.r, f)} y2={lerp(GOAL.t, BACK.t, f)} />);
  }
  return (
    <g className={`so-net${ripple ? ` rip${ripple % 2}` : ""}`} fill="none" stroke="rgba(244,244,241,.2)" strokeWidth="1">
      <polygon points={`${BACK.l},${BACK.t} ${BACK.r},${BACK.t} ${BACK.r},${BACK.b} ${BACK.l},${BACK.b}`} fill="rgba(6,7,9,.55)" stroke="none" />
      {lines}
    </g>
  );
}

function KeeperFigure({ k, moving }: { k: Keeper; moving: boolean }) {
  const th = (lerp(26, 168, k.arms) * Math.PI) / 180;
  const arm = (s: -1 | 1) => {
    const sx = s * SHOULDER_X, sy = SHOULDER_Y;
    const hx = sx + s * Math.sin(th) * ARM, hy = sy + Math.cos(th) * ARM;
    return (
      <g key={s}>
        <line x1={sx} y1={sy} x2={hx} y2={hy} stroke="#7d8591" strokeWidth="11" strokeLinecap="round" />
        <line x1={sx} y1={sy} x2={hx} y2={hy} stroke="#c9ccd1" strokeWidth="8" strokeLinecap="round" />
        <circle cx={hx + s * Math.sin(th) * 5} cy={hy + Math.cos(th) * 5} r="8" fill="#f4f4f1" stroke="#0a0b0d" strokeWidth="1.5" />
        <path d={`M${hx - 4},${hy + Math.cos(th) * 5 - 1} h8`} stroke="#858b95" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${s * (180 - (th * 180) / Math.PI) * -1} ${hx} ${hy})`} />
      </g>
    );
  };
  return (
    <g transform={`translate(${KEEPER_HOME.x + k.dx} ${KEEPER_HOME.y + k.dy}) rotate(${k.rot} 0 ${PIVOT_Y}) scale(${KS})`}>
      <g className={moving ? undefined : "so-sway"}>
        {/* legs, socks, boots */}
        {[-1, 1].map((s) => (
          <g key={s}>
            <line x1={s * 8} y1={-48} x2={s * 11} y2={-8} stroke="#1b1e23" strokeWidth="13" strokeLinecap="round" />
            <line x1={s * 11} y1={-30} x2={s * 11.5} y2={-6} stroke="#e9e8e3" strokeWidth="9" strokeLinecap="round" />
            <ellipse cx={s * 12.5} cy={-2} rx="9" ry="4.2" fill="#0a0b0d" stroke="#858b95" strokeWidth="1" />
          </g>
        ))}
        {/* shirt, with a steel yoke and the number */}
        <path d="M-19,-90 Q0,-97 19,-90 L18,-50 L-18,-50 Z" fill="url(#so-shirt)" stroke="#0a0b0d" strokeWidth="1.2" />
        <path d="M-19,-90 Q0,-97 19,-90 L18.5,-82 Q0,-88 -18.5,-82 Z" fill="#f4f4f1" opacity=".55" />
        <text x="0" y="-60" textAnchor="middle" fontFamily="var(--e2-display)" fontWeight="700" fontSize="17" fill="#0a0b0d" opacity=".78">1</text>
        {/* shorts */}
        <path d="M-18,-52 L18,-52 L19,-40 L2,-40 L0,-45 L-2,-40 L-19,-40 Z" fill="#14161a" stroke="#858b95" strokeWidth="1" />
        {arm(-1)}{arm(1)}
        {/* head */}
        <rect x="-4" y="-98" width="8" height="8" fill="#cfc8bb" />
        <circle cx="0" cy="-106" r="11" fill="#d9d3c7" stroke="#0a0b0d" strokeWidth="1.2" />
        <path d="M-11,-108 Q0,-120 11,-108 L11,-110 Q0,-123 -11,-110 Z" fill="#2a2e35" />
      </g>
    </g>
  );
}

function BallFigure({ b }: { b: Ball }) {
  const pent = Array.from({ length: 5 }, (_, i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return `${(6.2 * Math.cos(a)).toFixed(2)},${(6.2 * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <g>
      <ellipse cx={b.x} cy={SPOT.y + 16} rx={15} ry={4} fill="#000" opacity={0.45 * b.shadow} />
      <g transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) scale(${(b.r / 17).toFixed(3)}) rotate(${b.spin.toFixed(0)})`}>
        <circle r="17" fill="url(#so-ball)" stroke="#0a0b0d" strokeWidth="1" />
        <polygon points={pent} fill="#14161a" />
        {Array.from({ length: 5 }, (_, i) => {
          const a = ((-90 + i * 72) * Math.PI) / 180;
          return <line key={i} x1={6.2 * Math.cos(a)} y1={6.2 * Math.sin(a)} x2={11.5 * Math.cos(a)} y2={11.5 * Math.sin(a)} stroke="#14161a" strokeWidth="1.4" />;
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const a = ((-54 + i * 72) * Math.PI) / 180;
          return <circle key={i} cx={15 * Math.cos(a)} cy={15 * Math.sin(a)} r="3.6" fill="#14161a" />;
        })}
      </g>
    </g>
  );
}

function Scene({ anim, aim, power, mode }: { anim: Anim; aim: ShootoutSide | null; power: ShootoutPower; mode: "idle" | "shoot" | "keep" }) {
  const stripes = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let i = -14; i < 14; i += 2) {
      const xt = (n: number, y: number) => 400 + n * 60 * ((y - 120) / 142);
      out.push(<polygon key={i} points={`${xt(i, 236)},236 ${xt(i + 1, 236)},236 ${xt(i + 1, 480)},480 ${xt(i, 480)},480`} fill="rgba(255,255,255,.028)" />);
    }
    return out;
  }, []);
  return (
    <svg className="so-svg" viewBox={`0 ${VB_Y} 800 ${VB_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="so-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#181b21" /><stop offset=".5" stopColor="#12151a" /><stop offset="1" stopColor="#0c0e11" /></linearGradient>
        <linearGradient id="so-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c0e11" /><stop offset="1" stopColor="#14171c" /></linearGradient>
        <radialGradient id="so-flood" cx=".5" cy=".18" r=".62"><stop offset="0" stopColor="#dfe3ea" stopOpacity=".2" /><stop offset="1" stopColor="#dfe3ea" stopOpacity="0" /></radialGradient>
        <linearGradient id="so-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f4f4f1" /><stop offset=".55" stopColor="#c9ccd1" /><stop offset="1" stopColor="#7d8591" /></linearGradient>
        <linearGradient id="so-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f4f1" /><stop offset=".55" stopColor="#c9ccd1" /><stop offset="1" stopColor="#7d8591" /></linearGradient>
        <linearGradient id="so-shirt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#dde0e5" /><stop offset="1" stopColor="#8d949f" /></linearGradient>
        <radialGradient id="so-ball" cx=".38" cy=".32" r=".8"><stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#d9dce1" /><stop offset="1" stopColor="#8d949f" /></radialGradient>
      </defs>
      <rect y="0" width="800" height="480" fill="url(#so-sky)" />
      <rect y="0" width="800" height="480" fill="url(#so-flood)" />
      {/* the pitch: far grass behind the goal line, then the strip in front of it */}
      <rect y="236" width="800" height="244" fill="url(#so-ground)" />
      {stripes}
      <rect y="236" width="800" height="26" fill="rgba(255,255,255,.035)" />
      <line x1="0" y1={GOAL.b} x2="800" y2={GOAL.b} stroke="rgba(244,244,241,.5)" strokeWidth="3" />
      <ellipse cx={SPOT.x} cy={SPOT.y + 16} rx="9" ry="3.6" fill="rgba(244,244,241,.55)" />
      {/* the goal: net behind the keeper, frame over him */}
      <Net ripple={anim.ripple} />
      <ellipse cx={KEEPER_HOME.x + anim.k.dx * 0.9} cy={GOAL.b + 3} rx="30" ry="5" fill="#000" opacity=".5" />
      <KeeperFigure k={anim.k} moving={anim.moving} />
      <g>
        <rect x={GOAL.l - 5} y={GOAL.t - 4} width="10" height={GOAL.b - GOAL.t + 4} rx="3" fill="url(#so-post)" stroke="#0a0b0d" strokeWidth="1" />
        <rect x={GOAL.r - 5} y={GOAL.t - 4} width="10" height={GOAL.b - GOAL.t + 4} rx="3" fill="url(#so-post)" stroke="#0a0b0d" strokeWidth="1" />
        <rect x={GOAL.l - 5} y={GOAL.t - 4} width={GOAL.r - GOAL.l + 10} height="10" rx="3" fill="url(#so-bar)" stroke="#0a0b0d" strokeWidth="1" />
      </g>
      {mode === "shoot" && aim && (
        <g className="so-aim" transform={`translate(${TX[aim]} ${TY[power]})`}>
          <circle r="17" fill="none" stroke="#f2c14e" strokeWidth="2.2" />
          <circle r="4" fill="#f2c14e" />
          <path d="M-25,0H-11M11,0H25M0,-25V-11M0,11V25" stroke="#f2c14e" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      <BallFigure b={anim.ball} />
    </svg>
  );
}

// ---------------------------------------------------------------- small pieces
function Mark({ n, h, label }: { n: number; h: Hist | undefined; label: string }) {
  const cls = h ? (h.result === "goal" ? "g" : h.result === "saved" ? "s" : "m") : "p";
  const word = h ? (h.result === "goal" ? "goal" : h.result === "saved" ? "saved" : "missed") : "not played yet";
  return (
    <span className={`so-mk ${cls}`} role="img" aria-label={`${label} round ${n}: ${word}`}>
      {h?.result === "goal" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.7 2.7L12 5.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {h?.result === "saved" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>}
      {h?.result === "missed" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
    </span>
  );
}

function Arrow({ side }: { side: ShootoutSide }) {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      {side === "left" && <path d="M26 8L12 20l14 12M12 20h22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {side === "right" && <path d="M14 8l14 12-14 12M28 20H6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {side === "centre" && <><circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="20" cy="20" r="3.4" fill="currentColor" /></>}
    </svg>
  );
}

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

// ---------------------------------------------------------------- the page
export default function ShootoutView() {
  const { wallet, token, signIn, signingIn } = useAuth();
  const signedIn = Boolean(wallet && token);

  const [info, setInfo] = useState<ShootoutInfo | null>(null);
  const [infoDown, setInfoDown] = useState(false);
  const [mode, setMode] = useState<ShootoutMode>("practice");
  const picked = useRef(false);              // the player chose a tab: stop choosing for them
  const [game, setGame] = useState<Game | null>(null);
  const [aim, setAim] = useState<ShootoutSide | null>(null);
  const [power, setPower] = useState<ShootoutPower>("medium");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [anim, setAnim] = useState<Anim>(IDLE);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  const [live, setLive] = useState("");
  const alive = useRef(true);
  const raf = useRef(0);
  const gameRef = useRef<Game | null>(null);
  gameRef.current = game;
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelAnimationFrame(raf.current); }; }, []);

  // ---- data
  const loadInfo = useCallback(async () => {
    let data: ShootoutInfo | null = null;
    try { data = await fetchShootout(token); }
    catch (e) {
      if (token && (e as ApiError).status === 401) { try { data = await fetchShootout(); } catch { data = null; } }
    }
    if (!alive.current) return;
    if (data) { setInfo(data); setInfoDown(false); } else setInfoDown(true);
  }, [token]);
  useEffect(() => { loadInfo(); }, [loadInfo]);

  const rounds = game?.rounds ?? info?.rules.rounds ?? 5;
  const perDay = info?.rules.ranked_games_per_day ?? 10;
  const left = signedIn && typeof info?.ranked_left === "number" ? info.ranked_left : null;
  const limitReached = signedIn && left === 0;

  // the tab follows what is possible until the player picks one
  useEffect(() => {
    if (picked.current || game) return;
    setMode(signedIn && !limitReached ? "ranked" : "practice");
  }, [signedIn, limitReached, game]);

  const playing = Boolean(game && !game.done);
  const turn = playing ? game!.turn : null;
  const inKick = busy || stamp != null;

  // ---- the kick: ask the server, then draw it
  const playKick = useCallback((kick: ShootoutKick, kind: "shoot" | "keep", pw: ShootoutPower | null, round: number) => new Promise<void>((resolve) => {
    const plan = ballPlan(kick, kind, pw, round);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finalAnim: Anim = {
      ball: { x: plan.after.x, y: plan.after.y, r: plan.after.r, spin: 0, shadow: 0 }, k: plan.key, ripple: plan.ripple ? 1 : 0, moving: true,
    };
    if (reduce) { setAnim(finalAnim); resolve(); return; }
    const T_BALL = 620, T_KEEP_AT = 90, T_KEEP = 520, T_END = 840;
    const t0 = performance.now();
    const arc = pw === "low" ? 14 : pw === "high" ? 46 : 30;
    const frame = (now: number) => {
      if (!alive.current) { resolve(); return; }
      const el = now - t0;
      const p = clamp01(el / T_BALL), e = easeOut2(p);
      let x = lerp(SPOT.x, plan.end.x, e), y = lerp(SPOT.y, plan.end.y, e) - arc * Math.sin(Math.PI * e), r = lerp(SPOT.r, plan.end.r, e);
      if (el > T_BALL) {
        const q = easeOut2(clamp01((el - T_BALL) / (T_END - T_BALL)));
        x = lerp(plan.end.x, plan.after.x, q); y = lerp(plan.end.y, plan.after.y, q); r = lerp(plan.end.r, plan.after.r, q);
      }
      const ke = easeOut3(clamp01((el - T_KEEP_AT) / T_KEEP));
      const kp = kick.keeper_side === "centre"
        ? { dx: 0, dy: -4 * ke - 22 * Math.sin(Math.PI * ke), rot: 0, arms: Math.min(1, ke * 1.7) }
        : { dx: ke * plan.key.dx, dy: ke * plan.key.dy - 22 * Math.sin(Math.PI * ke), rot: ke * plan.key.rot, arms: Math.min(1, ke * 1.7) };
      setAnim({
        ball: { x, y, r, spin: e * 380, shadow: Math.max(0, 1 - e * 5) }, k: kp,
        ripple: plan.ripple && el >= T_BALL - 40 ? 1 : 0, moving: true,
      });
      if (el < T_END) raf.current = requestAnimationFrame(frame);
      else { setAnim(finalAnim); resolve(); }
    };
    raf.current = requestAnimationFrame(frame);
  }), []);

  const kick = useCallback(async (side: ShootoutSide) => {
    const g = gameRef.current;
    if (!g || g.done || busy || stamp) return;
    setBusy(true); setErr(null); setAim(side);
    const kind = g.turn;
    const pw = kind === "shoot" ? power : null;
    try {
      const res = kind === "shoot" ? await shootoutShoot(g.token, side, power, token) : await shootoutKeep(g.token, side, token);
      if (!alive.current) return;
      const k = res.kick ?? res.kicks[res.kicks.length - 1];
      await playKick(k, kind, pw, g.round);
      if (!alive.current) return;
      const over = k.result === "missed" && (k.shot_side === "centre" || pw === "high" || (pw == null && g.round % 2 === 0));
      const hist = [...g.history, { kind, result: k.result }];
      setStamp({ kind, result: k.result, over });
      setGame({ ...g, history: hist, score: res.score });
      setLive(stampWords({ kind, result: k.result, over }).join(". "));
      await wait(HOLD_MS);
      if (!alive.current) return;
      setStamp(null); setAnim(IDLE); setAim(null);
      setGame({ ...g, history: hist, score: res.score, round: res.round, turn: res.turn ?? g.turn, done: res.state === "done", outcome: res.result ?? null });
      if (res.state === "done" && g.mode === "ranked") loadInfo();
    } catch (e) {
      if (alive.current) { setErr(errText(e)); setStamp(null); setAnim(IDLE); }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, stamp, power, token, playKick, loadInfo]);

  const start = useCallback(async (m: ShootoutMode) => {
    if (busy) return;
    setBusy(true); setErr(null); setAim(null); setAnim(IDLE); setStamp(null);
    try {
      const res = await startShootout(m, m === "ranked" ? token : null);
      if (!alive.current) return;
      setGame({ token: res.token, mode: res.mode, round: res.round, turn: res.turn ?? "shoot", score: res.score, done: res.state === "done", outcome: res.result ?? null, rounds: res.rounds, history: [] });
      if (m === "ranked") setInfo((i) => (i && typeof i.ranked_left === "number" ? { ...i, ranked_left: Math.max(0, i.ranked_left - 1) } : i));
      setLive(`Game started. Round 1 of ${rounds}. ${res.turn === "shoot" ? "You take the first penalty." : "You keep first."}`);
    } catch (e) {
      if (alive.current) { setErr(errText(e)); if (m === "ranked") loadInfo(); }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, token, rounds, loadInfo]);

  function chooseMode(m: ShootoutMode) { picked.current = true; setMode(m); setErr(null); if (game?.done) setGame(null); }

  // ---- keyboard on the goal: arrows move the choice, Enter takes the kick (a shot needs an aim first)
  function onGoalKey(ev: React.KeyboardEvent) {
    if (!playing || inKick) return;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      const i = aim ? SIDES.indexOf(aim) : ev.key === "ArrowLeft" ? 1 : 1;
      const n = Math.max(0, Math.min(2, i + (ev.key === "ArrowLeft" ? -1 : 1)));
      setAim(SIDES[n]);
      radios.current[n]?.focus();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (aim) kick(aim);
    }
  }

  // ---- the board
  const rows = info?.board ?? [];
  const label = (r: ShootoutRow) => r.name || shortWallet(r.wallet);
  const myIdx = wallet ? rows.findIndex((r) => r.wallet === wallet) : -1;
  const shown = rows.slice(0, BOARD_ROWS);
  const mineBelow = myIdx >= BOARD_ROWS ? rows[myIdx] : null;
  const gd = (r: ShootoutRow) => { const d = r.goals_for - r.goals_against; return d > 0 ? `+${d}` : `${d}`; };

  // ---- the strip
  const mine = game?.history.filter((h) => h.kind === "shoot") ?? [];
  const theirs = game?.history.filter((h) => h.kind === "keep") ?? [];
  const score = game?.score ?? { for: 0, against: 0 };
  const roundNo = Math.min(game?.round ?? 1, rounds);
  const gameMode: "idle" | "shoot" | "keep" = playing ? game!.turn : "idle";
  const outcome = game?.done ? ({ win: "Won", draw: "Drew", loss: "Lost" } as const)[game.outcome ?? (score.for > score.against ? "win" : score.for < score.against ? "loss" : "draw")] : null;
  const goalLabel = (s: ShootoutSide) => (gameMode === "keep" ? (s === "centre" ? "Stay in the centre" : `Dive ${s}`) : `Aim ${s}`);
  const tabIndexFor = (i: number) => (aim ? (SIDES[i] === aim ? 0 : -1) : i === 1 ? 0 : -1);

  function side() {
    if (game?.done && outcome) {
      const rankedOut = game.mode === "ranked" && (left === 0);
      return (
        <div className="so-end">
          <span className="e2-eyebrow">Full time · {game.mode === "ranked" ? "ranked" : "practice"}</span>
          <p className="so-big" aria-live="polite">{outcome}</p>
          <p className="so-bigscore">{score.for} – {score.against}</p>
          <p className="e2-small e2-muted">{outcome === "Won" ? "A win." : outcome === "Drew" ? "Level after five rounds." : "Beaten this time."} {game.mode === "ranked" ? "It counts on today's board." : "Practice games are not on the board."}</p>
          <div className="so-act">
            {rankedOut
              ? <button type="button" className="e2-btn e2-btn-line" onClick={() => { picked.current = true; setMode("practice"); setGame(null); }}>Practice instead</button>
              : <button type="button" className="e2-btn e2-btn-gold" onClick={() => start(game.mode)} disabled={busy}>Play again</button>}
          </div>
          {rankedOut && <p className="e2-small e2-muted">No ranked games left today.</p>}
          {err && <p className="so-err" role="alert">{err}</p>}
        </div>
      );
    }
    if (!game) {
      if (mode === "ranked" && !signedIn) {
        return (
          <div className="so-pre">
            <span className="e2-eyebrow">Ranked</span>
            <p className="so-lead">Ranked games count on today&apos;s board and need a connected wallet. No $ELEVN needed.</p>
            <div className="so-act">
              <button type="button" className="e2-btn e2-btn-line" onClick={signIn} disabled={signingIn}>{signingIn ? "Check your wallet…" : "Connect wallet"}</button>
              <button type="button" className="so-link" onClick={() => chooseMode("practice")}>Try practice instead</button>
            </div>
          </div>
        );
      }
      if (mode === "ranked" && limitReached) {
        return (
          <div className="so-pre">
            <span className="e2-eyebrow">Ranked</span>
            <p className="so-lead" role="status">You have played all {perDay} ranked games for today. The count resets at midnight, UK time.</p>
            <p className="e2-small e2-muted">Practice is unlimited and does not touch the board.</p>
            <div className="so-act"><button type="button" className="e2-btn e2-btn-line" onClick={() => chooseMode("practice")}>Play practice</button></div>
          </div>
        );
      }
      return (
        <div className="so-pre">
          <span className="e2-eyebrow">{mode === "ranked" ? "Ranked game" : "Practice game"}</span>
          <ul className="so-rules">
            <li>Five rounds. In each you take a penalty, then face one.</li>
            <li>Aim at a third of the goal and choose a power. Then dive the right way.</li>
            <li>Most goals wins. {mode === "ranked" ? "It counts on today's board." : "Practice is not on the board."}</li>
          </ul>
          <div className="so-act"><button type="button" className="e2-btn e2-btn-gold" onClick={() => start(mode)} disabled={busy}>{busy ? "Starting…" : mode === "ranked" ? "Start ranked game" : "Start practice game"}</button></div>
          {!signedIn && mode === "practice" && <p className="e2-small e2-muted">As a guest nothing is saved. Connect a wallet for ranked games.</p>}
          {err && <p className="so-err" role="alert">{err}</p>}
        </div>
      );
    }
    // a game is on
    return (
      <div className="so-ctl">
        <span className="e2-eyebrow">{turn === "shoot" ? `Round ${roundNo} · your penalty` : `Round ${roundNo} · their penalty`}</span>
        {turn === "shoot" ? (
          <>
            <p className="so-lead">{aim ? `Aiming ${aim === "centre" ? "down the middle" : aim}.` : "Choose a third of the goal to aim at."}</p>
            <div>
              <div className="so-ph"><span id="so-power">Power</span><b>{POWERS.find((p) => p.id === power)?.label}</b></div>
              <div className="so-pw" role="radiogroup" aria-labelledby="so-power">
                {POWERS.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={power === p.id} className={`so-pb${power === p.id ? " on" : ""}`}
                    disabled={inKick} onClick={() => setPower(p.id)}>
                    <span className="so-bars" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={n <= p.bars ? "f" : ""} />)}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
              <p className="e2-small e2-muted so-hint">Low is the safest. High is hardest to save but can go over.</p>
            </div>
            <div className="so-act">
              <button type="button" className="e2-btn e2-btn-gold so-shoot" disabled={!aim || inKick} onClick={() => aim && kick(aim)} aria-label={aim ? `Shoot ${aim}, ${power} power` : "Shoot (choose where to aim first)"}>
                {busy ? "Shooting…" : "Shoot"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="so-lead">{aim && inKick ? "Diving…" : "Choose where to dive."}</p>
            <p className="e2-small e2-muted">Click a third of the goal. You can also use the arrow keys and Enter.</p>
          </>
        )}
        <p className="e2-small e2-muted so-kb">Keyboard: left and right arrows to choose{turn === "shoot" ? ", Enter to shoot" : ", Enter to dive"}.</p>
        {err && <p className="so-err" role="alert">{err}</p>}
      </div>
    );
  }

  const stampWordsNow = stamp ? stampWords(stamp) : null;

  return (
    <div className="e2-page so">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="e2-ph">
        <div>
          <span className="e2-eyebrow">Penalty · side game · no prize</span>
          <p className="so-intro">Pick a corner and a power, five rounds, against another player&apos;s earlier picks. No holding needed. Practice is unlimited.</p>
          {signedIn && left != null
            ? <p className="so-meta">{left} <small>of {perDay} ranked games left today</small></p>
            : <p className="so-meta"><small>{signedIn ? "Ranked games count on today's board" : "Practice is open to everyone · ranked needs a wallet"}</small></p>}
        </div>
        <div className="w"><h1 className="e2-word"><span className="so-sr">Penalty </span>Shootout</h1></div>
      </div>

      <section className="e2-card so-card" aria-label="Penalty shootout game">
        <div className="so-top">
          <div className="so-tabs" role="group" aria-label="Game type">
            {(["ranked", "practice"] as ShootoutMode[]).map((m) => (
              <button key={m} type="button" className={mode === m ? "on" : ""} aria-pressed={mode === m} disabled={playing || busy} onClick={() => chooseMode(m)}>
                {m === "ranked" ? "Ranked" : "Practice"}
              </button>
            ))}
          </div>
          {playing && <span className="e2-small e2-muted">Game on. Finish it to switch.</span>}
        </div>

        <div className="so-strip">
          <div className="so-side" aria-label="Your penalties">
            <span className="so-who">You</span>
            <span className="so-mks">{Array.from({ length: rounds }, (_, i) => <Mark key={i} n={i + 1} h={mine[i]} label="Your penalty" />)}</span>
          </div>
          <div className="so-mid">
            <span className="e2-eyebrow">Round {roundNo} of {rounds}</span>
            <span className="so-score" aria-label={`Score ${score.for} to ${score.against}`}>{score.for} – {score.against}</span>
          </div>
          <div className="so-side r" aria-label="Their penalties">
            <span className="so-who">Them</span>
            <span className="so-mks">{Array.from({ length: rounds }, (_, i) => <Mark key={i} n={i + 1} h={theirs[i]} label="Their penalty" />)}</span>
          </div>
        </div>

        <div className="so-play">
          <div className="so-stagewrap">
            <div className="so-stage" data-mode={gameMode} data-busy={inKick ? "1" : "0"}>
              <Scene anim={anim} aim={aim} power={power} mode={gameMode} />
              <div className="so-thirds" role="radiogroup" aria-label={gameMode === "keep" ? "Where to dive" : "Where to aim"} onKeyDown={onGoalKey}>
                {SIDES.map((s, i) => (
                  <button key={s} type="button" role="radio" aria-checked={aim === s} aria-label={goalLabel(s)} data-side={s}
                    ref={(el) => { radios.current[i] = el; }} tabIndex={tabIndexFor(i)}
                    className={`so-third${aim === s ? " on" : ""}`} disabled={!playing || inKick}
                    onClick={() => { if (gameMode === "keep") kick(s); else setAim(s); }}>
                    <span className="so-cue" aria-hidden="true">
                      {gameMode === "keep" ? <><Arrow side={s} /><b>{s === "centre" ? "Stay" : `Dive ${s}`}</b></> : <b>{s === "centre" ? "Centre" : s === "left" ? "Left" : "Right"}</b>}
                    </span>
                  </button>
                ))}
              </div>
              {stamp && stampWordsNow && (
                <div className={`so-stamp ${stamp.result}`} aria-hidden="true">
                  <span className="so-word">{stampWordsNow[0]}</span>
                  <span className="so-sub">{stampWordsNow[1]}</span>
                </div>
              )}
              {!game && <div className="so-hush" aria-hidden="true" />}
            </div>
          </div>
          <div className="so-aside">{side()}</div>
        </div>
        <p className="so-sr" role="status" aria-live="polite">{live}</p>
      </section>

      <section className="e2-card so-board" aria-label="Shootout ranks today">
        <div className="so-bhd"><span className="e2-eyebrow">Shootout ranks · today</span><span className="e2-small e2-muted">Ranked games only</span></div>
        <div className="so-head" aria-hidden="true"><span>#</span><span>Player</span><span className="c">W–D–L</span><span className="c">Goal diff</span><span className="c">Games</span></div>
        <ul className="so-rows">
          {!info && !infoDown && [0, 1, 2].map((i) => <li key={i} className="so-row sk" aria-hidden="true"><span /><span /><span /><span /><span /></li>)}
          {infoDown && <li className="so-empty">The ranks can&apos;t be loaded right now. The game still works.</li>}
          {info && shown.length === 0 && <li className="so-empty">No ranked games yet today. Be the first on the board.</li>}
          {shown.map((r, i) => <BoardRow key={r.wallet} r={r} n={i + 1} you={r.wallet === wallet} name={label(r)} gd={gd(r)} />)}
          {mineBelow && (<><li className="so-gap" aria-hidden="true">Your place</li><BoardRow r={mineBelow} n={myIdx + 1} you name={label(mineBelow)} gd={gd(mineBelow)} /></>)}
        </ul>
        <p className="so-foot e2-small e2-muted">Today&apos;s ranked games, by wins, then goal difference, then goals. No prize.</p>
      </section>
    </div>
  );
}

function BoardRow({ r, n, you, name, gd }: { r: ShootoutRow; n: number; you: boolean; name: string; gd: string }) {
  return (
    <li className={`so-row${you ? " you" : ""}`}>
      <b className="rk">{n}</b>
      <span className="nm">{name}{you && <span className="so-you">You</span>}</span>
      <span className="c">{r.wins}–{r.draws}–{r.losses}</span>
      <span className="c">{gd}</span>
      <span className="c m">{r.games}</span>
    </li>
  );
}

function stampWords(s: Stamp): [string, string] {
  if (s.kind === "shoot") {
    if (s.result === "goal") return ["Goal", "You scored"];
    if (s.result === "saved") return ["Saved", "The keeper got there"];
    return ["Missed", s.over ? "Over the bar" : "Wide of the post"];
  }
  if (s.result === "goal") return ["Goal", "They scored"];
  if (s.result === "saved") return ["Saved", "You saved it"];
  return ["Missed", "They missed"];
}
