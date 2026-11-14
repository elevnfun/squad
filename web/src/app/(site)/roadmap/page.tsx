import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = { title: "Roadmap | elevn" };

// No dates on purpose: each stage starts when the one before it is done.
const STAGES = [
  { label: "Now", title: "Testing", status: "now", items: [
    "The full game running on Solana devnet with test tokens",
    "Squads, live scoring, leaderboards and prize payouts end to end",
  ] },
  { label: "Launch", title: "elevn goes live", status: "next", items: [
    "$ELEVN launches on Solana",
    "Premier League, La Liga and the Bundesliga open",
    "Weekly SOL prizes from trading fees",
    "Buyback and burn from day one",
  ] },
  { label: "Next", title: "More football", status: "later", items: [
    "Serie A and Ligue 1",
    "Match bonus points and defensive contribution points",
    "A Dark Horse squad slot",
  ] },
  { label: "Later", title: "New ways to play", status: "later", items: [
    "Squad Battles: play other squads head to head with attack, defend and control tactics",
    "Off-season events to keep playing between seasons",
    "Faster, richer match data as elevn grows",
  ] },
];

export default function Roadmap() {
  return (
    <InfoPage title="Where elevn is going"
      intro="What we're building now, what comes at launch and what follows.">
      <ol className="relative space-y-10 pl-6">
        {/* the line draws down as the stages arrive */}
        <Reveal as="span" aria-hidden="true" className="road-line absolute left-0 top-0 h-full w-0.5 rounded-full bg-line" />
        {STAGES.map((s, i) => (
          <Reveal as="li" key={s.label} delay={i + 1} className="relative">
            <span className={`absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-2 border-bg ${
              s.status === "now" ? "bg-highlight" : s.status === "next" ? "bg-info" : "bg-line"}`} />
            <p className={`text-sm font-semibold ${s.status === "now" ? "text-highlight-ink" : "text-muted"}`}>{s.label}</p>
            <p className="mt-0.5 text-xl font-bold">{s.title}</p>
            <ul className="mt-3 max-w-[65ch] list-disc space-y-1.5 pl-5 text-muted marker:text-link">
              {s.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </Reveal>
        ))}
      </ol>
    </InfoPage>
  );
}
