"use client";

import Link from "next/link";
import { useLayoutEffect } from "react";
import { useAuth } from "@/components/auth";
import OpeningScreen from "@/components/OpeningScreen";
import Intro from "@/components/intro/Intro";
import Slide from "@/components/Slide";
import SlideRail, { glideTo } from "@/components/SlideRail";

// The two ways to play, as the owner settled them (CLAUDE.md, blueprint section 5.1).
const MODES = [
  { href: "/blitz", name: "Matchday Blitz", need: "Hold 150,000 $ELEVN",
    text: "Pick 3 squads of 3 players on any 3 matches. Each squad locks at its own kickoff, and your captain scores double." },
  { href: "/draft", name: "Draft", need: "Hold 300,000 $ELEVN",
    text: "Open 5 personal packs of 3 players each week and build a five-a-side. Your captain scores double." },
];

export default function Home() {
  const { token } = useAuth();
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
      <SlideRail />

      <Slide id="start" label="Start" innerClassName="pb-12 pt-24">
        <div className="max-w-4xl">
          <h1 data-rise style={{ "--i": 0 } as React.CSSProperties} className="text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
            Fantasy football for $ELEVN holders<span className="text-highlight">.</span>
          </h1>
          <p data-rise style={{ "--i": 1 } as React.CSSProperties} className="mt-6 max-w-[34rem] text-xl leading-relaxed text-muted">
            Play free. Hold $ELEVN, pick real players and win SOL. You can try everything without a wallet.
          </p>
          <div data-rise style={{ "--i": 2 } as React.CSSProperties} className="mt-8 flex flex-wrap gap-3">
            <Link href="/today" className="btn btn-primary">{token ? "Play" : "Try it now"}</Link>
            <a href="#modes" onClick={(e) => glideTo("modes", e)} className="btn btn-secondary">The two modes</a>
            <Link href="/how-to-play" className="btn btn-secondary">How to play</Link>
          </div>
        </div>
      </Slide>

      <Slide id="modes" label="Modes" innerClassName="space-y-10 pb-12 pt-24">
        <h2 data-rise className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.02em]">Two ways to play</h2>
        <ul className="grid gap-8 md:grid-cols-2">
          {MODES.map((m, i) => (
            <li key={m.name} data-rise style={{ "--i": i + 1 } as React.CSSProperties} className="rounded-3xl border border-white/10 bg-bg/55 p-6 backdrop-blur-md">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{m.need}</p>
              <h3 className="mt-3 text-2xl font-bold tracking-[-0.01em]">{m.name}</h3>
              <p className="mt-3 text-muted">{m.text}</p>
              <Link href={m.href} className="link mt-5 inline-block">Open {m.name}</Link>
            </li>
          ))}
        </ul>
        <p data-rise style={{ "--i": 3 } as React.CSSProperties} className="max-w-xl text-muted">
          Every prize board pays its top 5 in SOL. <Link href="/faq" className="link">Read how prizes work</Link>
        </p>
      </Slide>
    </div>
  );
}
