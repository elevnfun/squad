import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "FAQ | elevn" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "Does it cost anything to play?",
    a: "No. There are no entry fees. You need to hold $ELEVN in your wallet, and you keep it." },
  { q: "How many squads can I run?",
    a: "One squad for every 150,000 $ELEVN you hold. Each squad plays in one league, so you can run several in the same league or spread them across leagues." },
  { q: "What happens if I sell some tokens?",
    a: "Your squads are checked in real time. If your balance drops below what your squads need, your newest squads freeze straight away and stop scoring until you hold enough again." },
  { q: "Is signing in safe?",
    a: "Signing in only asks your wallet to sign a message. It's free, sends no transaction and can't move your tokens." },
  { q: "Which wallets work?",
    a: "Any Solana wallet that appears when you press Sign in, such as Phantom." },
  { q: "Where does the prize money come from?",
    a: "From the trading fees on $ELEVN. Each week, 60% of the fees goes to prizes, 20% buys back and burns $ELEVN, 10% is a reserve for quiet weeks and 10% covers running costs." },
  { q: "How are prizes paid?",
    a: "In SOL. The top three squads in each league get 50%, 30% and 20% of that league's pool, which is at least 1 SOL. 30% is sent when the gameweek settles, and the other 70% in 14 daily parts on days your wallet still holds the requirement." },
  { q: "What is the test season?",
    a: "elevn is playable now on Solana devnet, a test network. Sign in, get free test $ELEVN from the league page and play for real points. Prizes are paid in devnet SOL, at least 0.1 SOL per league, and have no real value. The test season resets when $ELEVN launches." },
  { q: "Can one wallet win more than one prize?",
    a: "Not in the same league. Each wallet can win one prize per league each gameweek, even with several squads there." },
  { q: "When does a gameweek lock?",
    a: <>Squads lock at the first kickoff of the gameweek. Each league page shows a countdown to the deadline. See <Link href="/how-to-play" className="link">How to play</Link> for the full rules.</> },
  { q: "Can I check the payouts?",
    a: <>Yes. Every payout goes out from one public fee wallet, and the <Link href="/admin" className="link">payouts page</Link> lists them.</> },
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
