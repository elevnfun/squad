"use client";

// The pitch on the home page's second slide: an example Premier League squad in its clubs' kits.
// The first time it scrolls into view the pitch drops into place on a soft spring, the shirts drop
// onto it one after another, and once they've landed a band of light sweeps across it once and is
// gone (React Bits' GlareHover, played a single time instead of on hover). Transform and opacity only,
// so it runs on the compositor. The points are made up (plausible gameweek scores), so the footer
// calls it an example squad.
import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { fmtPts } from "@/lib/api";
import { Pitch, Shirt, type Kit } from "@/components/pitch/Pitch";

const badge = (club: number) => `https://media.api-sports.io/football/teams/${club}.png`;

// API-Football team ids and home kits
const CLUBS: Record<string, { id: number; kit: Kit }> = {
  city: { id: 50, kit: { body: "#6cabdd" } },
  chelsea: { id: 49, kit: { body: "#034694" } },
  newcastle: { id: 34, kit: { body: "#ffffff", stripes: "#111111" } },
  liverpool: { id: 40, kit: { body: "#c8102e" } },
  brighton: { id: 51, kit: { body: "#ffffff", stripes: "#0057b8" } },
  arsenal: { id: 42, kit: { body: "#ef0107", sleeves: "#ffffff" } },
  fulham: { id: 36, kit: { body: "#ffffff", sleeves: "#111111" } },
  coventry: { id: 1346, kit: { body: "#77bfe6" } },
};

type Pick = { name: string; club: keyof typeof CLUBS; pts: number; captain?: boolean; vice?: boolean };

// forwards at the top down to the goalkeeper, as on every pitch; the captain's points are doubled
const XI: Pick[][] = [
  [{ name: "Haaland", club: "city", pts: 16, captain: true }, { name: "Pedro", club: "chelsea", pts: 6.2 }],
  [{ name: "Barnes", club: "newcastle", pts: 4.1 }, { name: "Cherki", club: "city", pts: 7.4, vice: true },
    { name: "Neto", club: "chelsea", pts: 5.3 }, { name: "Wirtz", club: "liverpool", pts: 8.6 }],
  [{ name: "Dunk", club: "brighton", pts: 6 }, { name: "Konsa", club: "arsenal", pts: 7.1 },
    { name: "Robinson", club: "fulham", pts: 3.2 }, { name: "DaSilva", club: "coventry", pts: 2.4 }],
  [{ name: "Raya", club: "arsenal", pts: 6.8 }],
];
const TOTAL = Math.round(XI.flat().reduce((s, p) => s + p.pts, 0) * 10) / 10;

// the pitch settles like a card laid down; the shirts are lighter and land with a small bounce
const PITCH_SPRING = { type: "spring", stiffness: 90, damping: 18, mass: 1 } as const;
const SHIRT_SPRING = { type: "spring", stiffness: 420, damping: 20, mass: 0.6 } as const;
const STAGGER = 0.06;
const FIRST_SHIRT = 0.3;   // seconds after the pitch starts, while it is still settling

const card: Variants = {
  hidden: { opacity: 0, y: -72, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { ...PITCH_SPRING, delayChildren: FIRST_SHIRT, staggerChildren: STAGGER } },
};
const shirt: Variants = {
  hidden: { opacity: 0, y: -36, scale: 0.8 },
  shown: { opacity: 1, y: 0, scale: 1, transition: SHIRT_SPRING },
};

export default function ShowcaseSquad() {
  const still = useReducedMotion();
  const [glare, setGlare] = useState<"waiting" | "queued" | "sweeping" | "done">("waiting");

  const rows = XI.map((row) => row.map((p) => (
    <motion.span key={p.name} variants={shirt} className="flex">
      <Shirt name={p.name} points={fmtPts(p.pts)} captain={p.captain} vice={p.vice}
        badge={badge(CLUBS[p.club].id)} kit={CLUBS[p.club].kit} />
    </motion.span>
  )));
  const last = XI.flat().length - 1;

  return (
    <motion.div className="relative rounded-xl shadow-[0_40px_60px_rgba(0,0,0,.6)]"
      variants={card} initial={still ? false : "hidden"} whileInView="shown" viewport={{ once: true, amount: 0.6 }}
      // the sweep starts as the last shirt lands
      onAnimationStart={() => {
        if (still || glare !== "waiting") return;
        setGlare("queued");
        setTimeout(() => setGlare("sweeping"), (FIRST_SHIRT + last * STAGGER + 0.35) * 1000);
      }}>
      <Pitch rows={rows} footer={
        <div className="flex items-baseline justify-between gap-3">
          <span>Example squad, Premier League</span>
          <span className="whitespace-nowrap text-lg font-bold">{fmtPts(TOTAL)} pts</span>
        </div>
      } />
      {glare === "sweeping" && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <motion.div className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(-45deg,transparent_30%,rgba(255,255,255,.35)_47%,rgba(255,241,201,.5)_50%,rgba(255,255,255,.35)_53%,transparent_70%)]"
            initial={{ x: "-100%", opacity: 0 }} animate={{ x: "200%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], opacity: { times: [0, 0.15, 0.75, 1], duration: 0.9 } }}
            onAnimationComplete={() => setGlare("done")} />
        </div>
      )}
    </motion.div>
  );
}
