import type { Metadata } from "next";
import { InfoPage, PlayCta, Points, Section } from "@/components/InfoPage";

export const metadata: Metadata = { title: "About | elevn" };

const VALUES = [
  { title: "Free to play", text: "Holding $ELEVN is your entry. There are no entry fees, ever." },
  { title: "Real football", text: "Real players, real matches and live scores from every game." },
  { title: "Paid in SOL", text: "Prizes come from the token's trading fees and are paid in SOL." },
];

export default function About() {
  return (
    <InfoPage title="Fantasy football for holders"
      intro="elevn is a fantasy football game on Solana. Hold $ELEVN, play Matchday Blitz and the weekly Draft with real players, and win SOL.">
      <Section title="Why elevn">
        <p>
          Most fantasy games ask you to pay to enter. elevn doesn&apos;t: <strong>holding the token is your entry</strong>.
          Hold 150,000 $ELEVN to play Matchday Blitz, or 300,000 to play Draft too, and you keep the tokens.
        </p>
        <p>
          The prize money comes from the trading fees on $ELEVN. Each week, 60% of those fees becomes prizes for the best players,
          and 20% buys back $ELEVN and burns it.
        </p>
      </Section>
      <Points items={VALUES} />
      <Section title="The leagues">
        <p>
          Matches come from the <strong>Premier League, La Liga and the Bundesliga</strong>. Serie A and Ligue 1 come next.
        </p>
      </Section>
      <PlayCta />
    </InfoPage>
  );
}
