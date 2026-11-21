import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "FAQ | elevn" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "Does it cost anything to play?",
    a: "No. There are no entry fees. You need to hold $ELEVN in your wallet, and you keep it." },
  { q: "How much do I need to hold?",
    a: "150,000 $ELEVN unlocks Matchday Blitz, the main mode. 150,000 more (300,000 in all) also unlocks Draft. It is one entry per wallet, however much it holds." },
  { q: "What happens if I sell some tokens?",
    a: "If your wallet drops below 150,000 $ELEVN, your locked winnings and their withdrawal timer freeze until you hold enough again. Nothing is forfeited." },
  { q: "Is signing in safe?",
    a: "Signing in only asks your wallet to sign a message. It's free, sends no transaction and can't move your tokens." },
  { q: "Which wallets work?",
    a: "Any Solana wallet that appears when you press Sign in, such as Phantom." },
  { q: "Where does the prize money come from?",
    a: "From the trading fees on $ELEVN. Each week, 60% of the fees goes to prizes, 20% buys back and burns $ELEVN, 10% is a reserve for quiet weeks and 10% covers running costs." },
  { q: "How are prizes paid?",
    a: "In SOL. Every prize board pays its top 5: 50%, 25%, 12%, 8% and 5% of the pot. Winners press Collect on the Winnings page: half is yours at once, the other half is locked, and 20% of the locked balance can be withdrawn every 24 hours." },
  { q: "What is the test season?",
    a: "elevn is playable now on Solana devnet, a test network. Sign in with free test $ELEVN and play for real points. Prizes are paid in devnet SOL, at least 0.05 SOL per Blitz matchday and 0.1 SOL per Draft week, and have no real value. The test season resets when $ELEVN launches." },
  { q: "When do my picks lock?",
    a: <>Each Matchday Blitz squad locks at its own kickoff. Draft opens on Tuesday and locks at Friday&apos;s first kickoff. See <Link href="/how-to-play" className="link">How to play</Link> for the full rules.</> },
];

export default function Faq() {
  return (
    <InfoPage title="Questions and answers" intro="The short answers to what people ask most.">
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map((f) => (
          <details key={f.q} className="smooth group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold hover:text-link [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="text-2xl leading-none text-link transition-transform duration-300 ease-out group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-[65ch] leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
