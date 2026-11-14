"use client";

// The first screen of the home page: the folding "elevn." logo over taste-skill's grid-pulse. It stays
// pinned while you scroll and folds up into the top of the screen like a sheet of paper,
// revealing the rest of the page underneath.
import { useEffect, useRef, useState } from "react";
import FoldText from "@/components/fold-text/FoldText";
import GridPulse from "@/components/GridPulse";
import { INTRO_DONE } from "@/components/intro/Intro";
import Social from "./Social";
import { TEST_SEASON } from "./TestSeason";


// `teaser`: the stand-alone launch page (app/teaser): no scroll hint, nothing below it.
export default function OpeningScreen({ teaser = false }: { teaser?: boolean }) {
  const sheet = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  // While the intro plays, the logo waits (laid out but hidden, so the ball can find its dot),
  // then folds in as the ball lands.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.__elevnIntro !== "playing") { setReady(true); return; }
    const go = () => setReady(true);
    window.addEventListener(INTRO_DONE, go);
    return () => window.removeEventListener(INTRO_DONE, go);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const update = () => {
      frame = 0;
      // fully folded (and hidden) by three quarters of a screen, so nothing is left at the top by the hero
      const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.75)));
      const el = sheet.current;
      if (!el) return;
      if (reduce) {
        el.style.opacity = String(1 - p);
      } else {
        el.style.transform = `perspective(1400px) rotateX(${p * -90}deg)`;
        if (shade.current) shade.current.style.opacity = String(p * 0.35);
      }
      el.style.visibility = p >= 1 ? "hidden" : "visible";
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
    {/* the snap point for the top of the page: a sticky element's own snap point moves with it, so it never counts */}
    <div aria-hidden="true" className="h-0 [scroll-snap-align:start]" />
    <div className="pointer-events-none sticky top-0 z-10 ml-[calc(50%-50vw)] h-svh w-screen">
      <div ref={sheet} className="pointer-events-auto relative h-full origin-top bg-bg will-change-transform">
        <GridPulse className="absolute inset-0" />
          <div className="pointer-events-none relative flex h-full flex-col items-center justify-center">
            <h1 className="logo-fold pointer-events-auto" style={{ visibility: ready ? "visible" : "hidden" }}>
              <FoldText
                key={ready ? "go" : "wait"}
                text="elevn."
                foldStyle="paper"
                splitBy="char"
                hinge="top"
                trigger="mount"
                foldAngle={92}
                duration={0.65}
                stagger={0.06}
                staggerFrom="start"
                ease="power3.out"
                hoverRefold
                refoldRadius={140}
                refoldAngle={45}
                perspective={700}
                creaseShading={0.55}
                fontSize="clamp(5rem, 20vw, 12rem)"
                fontWeight={800}
              />
            </h1>
            {/* under the logo, once it has folded in: where the game stands (the teaser: not live yet; the full
                site during the devnet test season: playable with free test tokens), and where to follow it */}
            <div className={`pointer-events-auto mt-8 flex items-center gap-3 rounded-full border border-white/12 bg-white/[0.03] py-1.5 pl-4 pr-1.5 backdrop-blur-sm transition-[opacity,transform] delay-700 duration-700 ${
              ready ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-highlight" aria-hidden="true" />
                {!teaser && TEST_SEASON ? "Test season live on devnet. Free test tokens." : "Not live yet. Launching soon."}
              </span>
              <span className="h-5 w-px bg-white/12" aria-hidden="true" />
              <Social />
            </div>
            {!teaser && <a href="#start" className="pointer-events-auto absolute bottom-8 flex flex-col items-center gap-1 text-[13px] font-medium text-muted hover:text-text">
              Scroll
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 5l4 4 4-4" /></svg>
            </a>}
          </div>
        <div ref={shade} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      </div>
    </div>
    </>
  );
}
