import type { Metadata } from "next";
import { InfoPage, Panel, PlayCta, Section } from "@/components/InfoPage";
import Reveal from "@/components/Reveal";
import { STEPS } from "@/lib/copy";
import StepVisual from "@/components/StepVisuals";

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
    <InfoPage title="Four steps to your first squad"
      intro="Pick real players, score points from their real matches and climb the leaderboard every gameweek.">
      <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i} className="flex gap-4">
            <span className="text-5xl font-extrabold leading-none tabular-nums text-link">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{s.title}</p>
              <p className="mt-1 text-muted">{s.text}</p>
              <div className="mt-4"><StepVisual step={i} /></div>
            </div>
          </Reveal>
        ))}
      </ol>
      <Section title="Your squad">
        <p>
          A squad has <strong>eleven players | 4 substitutions</strong>: 2 goalkeepers, 5 defenders, 5 midfielders and 3
          forwards in all, built with a <strong>100M budget</strong> and at most <strong>3 players from one club</strong>.
          The eleven start each gameweek. If a starter doesn&apos;t play, a substitute comes on automatically.
        </p>
        <p>
          Pick a <strong>captain</strong> to double their points (negative points still count once) and a vice-captain
          who takes over if the captain doesn&apos;t play.
        </p>
      </Section>
      <Section title="Transfers">
        <p>
          You get <strong>3 free transfers</strong> every gameweek. Unused ones don&apos;t carry over, and each extra
          transfer costs 8 points. Replacing an injured or suspended player is always free.
        </p>
        <p>Prices move with form, and players sell at today&apos;s price, so a rising player grows your budget.</p>
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
          The <strong>top three squads in each league</strong> share that league&apos;s prize pool: 50%, 30% and 20%.
          30% of a prize is sent when the gameweek settles, and the rest arrives in 14 daily parts while you keep holding.
        </p>
      </Section>
      <PlayCta />
    </InfoPage>
  );
}
