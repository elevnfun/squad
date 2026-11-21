import type { Metadata } from "next";
import { InfoPage, Panel, PlayCta, Section } from "@/components/InfoPage";

export const metadata: Metadata = { title: "How to play | elevn" };

const POINTS = [
  ["Playing under 60 minutes", "2"], ["Playing 60 minutes or more", "4"],
  ["Goal", "8 to 20, by position"], ["Assist", "6"],
  ["Clean sheet", "8 for goalkeepers and defenders, 2 for midfielders"],
  ["Every 3 saves (goalkeepers)", "2"], ["Penalty save", "10"],
  ["Every 2 goals conceded (goalkeepers, defenders)", "−2"],
  ["Yellow card", "−2"], ["Red card", "−6"], ["Own goal or missed penalty", "−4"],
];

export default function HowToPlay() {
  return (
    <InfoPage title="How to play"
      intro="Pick real players, score points from their real matches and climb the leaderboard.">
      <Section title="Matchday Blitz">
        <p>
          Hold <strong>150,000 $ELEVN</strong> to play. Each matchday you build <strong>3 squads</strong> on any 3 matches you
          choose. A squad is 3 players from one match, with at least 1 from each club, and it locks at its own kickoff.
        </p>
        <p>
          Every squad has a <strong>captain</strong> who scores double points (negative points still count once).
          One live leaderboard runs all matchday.
        </p>
      </Section>
      <Section title="Draft">
        <p>
          Hold <strong>300,000 $ELEVN</strong> in all to play. Each week you open <strong>5 personal packs of 3 players</strong>,
          different for every wallet, and build a five-a-side from the 15: at least 1 defender, 1 midfielder and 1 attacker,
          no goalkeepers, at most 2 players from one club.
        </p>
        <p>
          Draft opens on Tuesday and locks at Friday&apos;s first kickoff. It scores from Friday to Monday, and a captain
          on double points is mandatory.
        </p>
      </Section>
      <Section title="Points">
        <Panel className="p-0">
          <ul className="divide-y divide-line text-sm">
            {POINTS.map(([what, pts]) => (
              <li key={what} className="flex justify-between gap-4 px-5 py-2.5">
                <span>{what}</span><span className="text-right font-semibold text-text">{pts}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="text-sm">
          Players also earn up to 4 small bonus points a match for passes, shots on target, tackles and duels won.
        </p>
      </Section>
      <Section title="Prizes">
        <p>
          Every prize board pays its <strong>top 5</strong> in SOL: 50%, 25%, 12%, 8% and 5% of the pot. A result is final
          15 minutes after the day&apos;s last match. Winners press <strong>Collect</strong> on the Winnings page: half is
          yours at once, and 20% of the locked half can be withdrawn every 24 hours while you hold 150,000 $ELEVN.
        </p>
      </Section>
      <PlayCta />
    </InfoPage>
  );
}
