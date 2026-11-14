"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, fmtSol, LEAGUE_NAMES, LeagueSummary, Prize } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { DeadlineClock, Select } from "@/components/ui";
import { LeagueFan } from "@/components/league-fan/LeagueFan";
import OpeningScreen from "@/components/OpeningScreen";
import Intro from "@/components/intro/Intro";
import ShowcaseSquad from "@/components/pitch/ShowcaseSquad";
import AnimatedContent from "@/components/animated-content/AnimatedContent";
import Slide from "@/components/Slide";
import SlideRail, { glideTo } from "@/components/SlideRail";
import { STEPS } from "@/lib/copy";
import CountUp from "@/components/count-up/CountUp";
import StepVisual from "@/components/StepVisuals";

// League cards: elevn's own emblem for each league on a white card (web/public/fan, emblems in
// web/public/leagues). Live leagues link to their squad page; the others open after launch.
const AREAS = [
  { slug: "premier-league", name: "Premier League", live: true },
  { slug: "la-liga", name: "La Liga", live: true },
  { slug: "bundesliga", name: "Bundesliga", live: true },
  { slug: "serie-a", name: "Serie A", live: false },
  { slug: "ligue-1", name: "Ligue 1", live: false },
];
const FAN = AREAS.map((a) => ({
  src: `/fan/${a.slug}.svg`,
  alt: a.live ? `${a.name}: build your squad` : `${a.name}: coming soon`,
  href: a.live ? `/${a.slug}` : undefined,
  label: a.name,
  note: a.live ? "Build your squad" : undefined,
  soon: !a.live,
}));

// Where each week's trading fees go (the same split as the FAQ and About pages).
const FEES = [
  { label: "Prizes", share: 60, className: "bg-highlight" },
  { label: "Buyback and burn", share: 20, className: "bg-text" },
  { label: "Reserve", share: 10, className: "bg-pitch" },
  { label: "Running costs", share: 10, className: "bg-surface-2 border border-line" },
];

export default function Home() {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  // smaller cards on shorter screens, so the whole "Pick your league" slide fits on one screen
  const [cardW, setCardW] = useState(220);
  useEffect(() => {
    const fit = () => setCardW(Math.round(Math.min(260, Math.max(170, (window.innerHeight - 380) * 0.62))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => { api<LeagueSummary[]>("/leagues").then(setLeagues).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (token) api<Prize[]>("/me/prizes", { token }).then(setPrizes).catch(() => {}); else setPrizes([]); }, [token]);
  // the home page scrolls as slides (globals.css html.slides). A layout effect, so the snapping is off
  // before Next scrolls the next page to its top: mandatory snapping would pull that scroll straight back.
  useLayoutEffect(() => {
    document.documentElement.classList.add("slides");
    return () => document.documentElement.classList.remove("slides");
  }, []);

  return (
    <div>
      <Intro />
      <OpeningScreen />
      <SlideRail key={prizes.length > 0 ? "with-prizes" : "plain"} />

      <Slide id="start" label="Start" innerClassName="grid items-center gap-12 pb-12 pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div>
          <h1 data-rise style={{ "--i": 0 } as React.CSSProperties} className="text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
            Fantasy football for $ELEVN holders<span className="text-highlight">.</span>
          </h1>
          <p data-rise style={{ "--i": 1 } as React.CSSProperties} className="mt-6 max-w-[34rem] text-xl leading-relaxed text-muted">
            No entry fee. Hold 150,000 $ELEVN for each squad, pick real players and win SOL every gameweek.
          </p>
          <div data-rise style={{ "--i": 2 } as React.CSSProperties} className="mt-8 flex flex-wrap gap-3">
            <a href="#leagues" onClick={(e) => glideTo("leagues", e)} className="btn btn-primary">Build a squad</a>
            <Link href="/how-to-play" className="btn btn-secondary">How to play</Link>
          </div>
        </div>
        <div data-rise style={{ "--i": 1 } as React.CSSProperties} className="[perspective:1600px]">
          <div className="origin-bottom [transform:rotateX(10deg)]"><ShowcaseSquad /></div>
        </div>
      </Slide>

      <Slide id="leagues" label="Leagues" innerClassName="pb-10 pt-20">
        <div className="grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-12">
          <div className="min-w-0">
            <h2 data-rise className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.02em]">Pick your league</h2>
            <p data-rise style={{ "--i": 1 } as React.CSSProperties} className="mt-2 max-w-xl text-muted">Each league has its own leaderboard and its own SOL prizes.</p>
            <div className="mt-6">
              <LeagueFan items={FAN} cardWidth={cardW} ariaLabel="League areas" />
            </div>
            {error && <p className="mt-6 text-danger">{error}</p>}
          </div>
          <div data-rise style={{ "--i": 3 } as React.CSSProperties}><Matchday leagues={leagues} failed={Boolean(error)} /></div>
        </div>
      </Slide>

      {prizes.length > 0 && (
        <Slide id="prizes" label="Your prizes" innerClassName="pb-8 pt-20">
          <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.02em]">Your prizes</h2>
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {prizes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                <span>{["", "1st", "2nd", "3rd"][p.place] ?? `${p.place}th`} in {LEAGUE_NAMES[p.league] ?? p.league}, gameweek {p.gameweek}</span>
                <span className="text-right">
                  <span className="text-lg font-bold">{fmtSol(p.sol)}</span>
                  <span className="block text-sm text-muted">
                    {fmtSol(p.sent_sol)} sent, day {p.days_paid} of {p.days}
                    {p.paused && ". Paused: hold 150,000 $ELEVN to keep receiving"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">30% is sent when the gameweek settles; the rest arrives daily over 14 days while you hold.</p>
        </Slide>
      )}

      <Slide id="how-it-works" label="How it works" innerClassName="space-y-16 pb-12 pt-24">
        <div>
        <h2 data-rise className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.02em]">Four steps to your first squad</h2>
        <AnimatedContent role="list" className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
          distance={32} duration={0.7} stagger={0.12} threshold={0.2}>
          {STEPS.map((s, i) => (
            <div role="listitem" key={s.title}>
              {/* short laptop screens drop the pictures, so this slide still fits on one screen */}
              <div className="mb-5 [@media(min-width:1024px)_and_(max-height:860px)]:hidden"><StepVisual step={i} /></div>
              <span className="block text-[13px] font-medium text-muted">Step {i + 1}</span>
              <p className="mt-1 text-xl font-semibold tracking-[-0.01em]">{s.title}</p>
              <p className="mt-2 text-muted">{s.text}</p>
            </div>
          ))}
        </AnimatedContent>
        </div>

        <div data-rise style={{ "--i": 2 } as React.CSSProperties} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
          <div>
            <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.02em]">Where the prize money comes from</h2>
            <p className="mt-3 max-w-md text-muted">
              Every $ELEVN trade pays a small fee. Each week the fees are split as shown, and the top three squads in
              each league share its prize pool: 50%, 30% and 20%, paid in SOL.
            </p>
            <Link href="/faq" className="link mt-4 inline-block">Read how payouts work</Link>
          </div>
          <FeeBar />
        </div>
      </Slide>
    </div>
  );
}

// Where the fees go: the bar fills from left to right, one share after another, as it comes into view,
// and each share counts up with React Bits' CountUp.
function FeeBar() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  let before = 0;
  return (
    <div ref={ref}>
      <div className="relative h-14 overflow-hidden rounded-xl bg-surface" role="img" aria-label={FEES.map((f) => `${f.label} ${f.share}%`).join(", ")}>
        {FEES.map((f, i) => {
          const left = before; before += f.share;
          return (
            <div key={f.label} className={`absolute inset-y-0 ${f.className} transition-[clip-path] ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none`}
              style={{ left: `calc(${left}% + ${i * 4}px)`, width: `calc(${f.share}% - 4px)`, transitionDuration: "700ms",
                transitionDelay: `${i * 450}ms`, clipPath: shown ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }} />
          );
        })}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {FEES.map((f, i) => (
          <div key={f.label}>
            <dt className="text-sm text-muted">{f.label}</dt>
            <dd className="text-2xl font-bold tabular-nums">
              <CountUp to={f.share} startWhen={shown} delay={i * 0.45} duration={1.1} suffix="%" />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}


// "This gameweek": the board beside the cards. A dropdown picks the league; below it, that league's
// gameweek, a clock to its deadline (counting up again on each switch) and the way in.
function Matchday({ leagues, failed }: { leagues: LeagueSummary[] | null; failed: boolean }) {
  const { me } = useAuth();
  const [slug, setSlug] = useState(AREAS[0].slug);
  const area = AREAS.find((a) => a.slug === slug) ?? AREAS[0];
  const lg = leagues?.find((l) => l.slug === slug);
  const gw = lg?.window ?? lg?.next ?? null;
  const mine = me?.squads.filter((s) => s.league === slug).length ?? 0;
  return (
    <aside className="rounded-3xl border border-white/10 bg-bg/55 p-6 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">This gameweek</span>
        <Select label="League" value={slug} onChange={setSlug} size="sm" align="right"
          options={AREAS.map((a) => ({ value: a.slug, label: a.name, tag: a.live ? undefined : "Soon" }))} />
      </div>
      <div className="mt-6 flex items-center gap-4">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-text p-2.5 ${area.live ? "" : "opacity-50"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/leagues/${area.slug}.svg`} alt="" width={36} height={36} className="h-full w-full object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block font-[family-name:var(--font-display)] text-[30px] font-bold uppercase leading-none">{area.name}</span>
          <span className="mt-1 block text-[13px] text-muted">
            {!area.live ? "Opens after launch" : failed ? "Couldn't load this gameweek" : !leagues ? "Loading…" : gw ? `Gameweek ${gw.number}${lg?.current ? ", matches on now" : ""}` : "Season break"}
          </span>
        </span>
      </div>
      <div className="mt-6 border-t border-white/10 pt-5">
        {!area.live ? <p className="text-muted">This league opens after launch, with its own leaderboard and prizes.</p>
          : failed ? <p className="text-muted">The clock is unavailable right now. Refresh to try again.</p>
          : !leagues ? <p className="text-muted">Loading the deadline…</p>
          : lg?.current ? <span className="inline-flex items-center gap-2 rounded-full bg-live px-3 py-1 text-[13px] font-bold text-black"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />Live now</span>
          : gw?.deadline ? (
            <>
              <span className="block text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Deadline in</span>
              <span className="mt-2 block"><DeadlineClock key={slug} to={gw.deadline} label={false} /></span>
            </>
          ) : <p className="text-muted">No deadline yet.</p>}
      </div>
      {area.live && (
        <Link href={`/${area.slug}`} className="btn btn-primary mt-6 w-full justify-center">
          {mine > 0 ? `Open your ${mine > 1 ? `${mine} squads` : "squad"}` : "Build a squad"}
        </Link>
      )}
    </aside>
  );
}
