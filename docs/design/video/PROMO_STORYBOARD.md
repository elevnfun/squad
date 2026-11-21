# elevn promo for X: shot-by-shot storyboard (2026-11-21)

Draft for approval. Nothing generated. No credits spent (balance 1,130.53).
Replaces the older "Katana waits" note: the owner decided to make it now.

## Spine
A player beats two defenders and scores top corner. Pull back: it is on a TV, the viewer jumps up.
Cut to the laptop in their hands: points climb, rank rises, winnings go up. Every other football
scene follows the same rule: football first, product as payoff.

## Treatment taken from the references
- Nike "Winner Stays": pace, street-to-stadium energy, cuts landing on the beat. Nothing copied.
- Desert Eagle clip (seen frame by frame): black vignette, hard studio light, one-word title cards
  ("Live."), fast macro cuts with motion blur, thin blueprint callouts with leader lines, one slow-motion
  hero moment. Only the treatment; elevn's object is the glass ball.
- Tokyo: nothing.

## Shots (36 s, 16:9, 720p draft)
G = generated football clip. S = real elevn screen from `docs/design/mockups/shots/`, composited. M = motion graphics in code.

| # | Sec | What is seen | Screen | Transition out | Text |
|---|---|---|---|---|---|
| 1 | 0-2 | G: night street pitch, dribbler beats first defender, low camera | | whip pan with motion blur | none |
| 2 | 2-4 | G: beats second defender, strikes | | ball blur fills frame | none |
| 3 | 4-6 | G: top corner, net ripples, slow motion | | camera pulls back through the net | none |
| 4 | 6-9 | G: it is a TV in a small flat; the viewer jumps up, arms raised | | push into the laptop in their hands | none |
| 5 | 9-11 | S on laptop: Today | `today.png` | screen slides up, ball glint wipe | "elevn. Redesigned." |
| 6 | 11-14 | M+S: Today, Ranks, Chat, one second each, tab bar highlighted, callouts | `today.png`, `ranks.png`, `chat.png` | tab flips like a card | "Today. Ranks. Chat." |
| 7 | 14-18 | G: striker cuts inside, then S: pick 3 from a fixture, captain flagged x2 | `blitz-pick.png` | gold glint passes, hard cut | "BLITZ. Pick 3. Captain scores double." |
| 8 | 18-22 | Existing Higgsfield pack art and hover video, five packs flip, then the five-a-side | `art/pack.png`, `pack-hover.mp4`, `draft.png` | pack bursts into pitch lines | "DRAFT. Open 5 packs. Build your five." |
| 9 | 22-27 | G: keeper dives, ball in, crowd. Then S: Blitz matchday board, rank climbs, then the weekly board | `ranks.png` | rank number counts up and rolls out | "Blitz matchday. Weekly boards." |
| 10 | 27-32 | M+S: points rising, a win, Winnings page, Collect pressed (the only gold button) | `winnings-1.png` | glass ball swells to full frame | "Top 5 paid. Weekly $500." |
| 11 | 32-36 | Glass ball, logo, elevn.fun | | end | "Play free." |

Checks against the rules: SOL only (the $500 weekly is the one exception, and shot 10 shows no dollar
amount beside a prize); "Blitz matchday" never "daily"; no blue grade; no real players, clubs, kits,
badges or sponsors; no promises of earnings. The $500 line says it is a weekly prize and nothing more.

## Price
Live quote (`estimate_video_cost`, Seedance 2.5, 16:9): 35 credits for 5 s, 70 for 10 s: **7 credits per second**.
The quote did not state resolution, so 720p is assumed and not confirmed.

| Item | Credits |
|---|---|
| Test shot (shot 1, 5 s) | 35 |
| Generated football clips: shots 1-4, 7, 9 as 6 clips of 5 s | 210 |
| Location and subject stills (about 8 at 0.25) | about 2 |
| Retry reserve (about 40%) | about 85 |
| **Total with reserve** | **about 330** |

Proposed hard cap: **350 credits**. Screens, text, transitions, callouts and the end card are code and cost 0.
Katana's own rules want a cap set before the first paid job; I will set it at whatever you approve.

## Things to decide
1. **Music.** Katana says to use real recorded music, not tracks made in code. You asked for original and
   driving. Options: a royalty-free stock track I choose and name with its licence (free), or you supply one.
2. **get_katana_config.** It only opens a session for a published preset. This is a custom remix with no preset, so
   I did not call it and the free-run balance is unknown. Say if you want me to open one on a preset anyway.
3. **Screens are still images.** The mockups are screenshots, so screens move by camera, slides and callouts, not live clicks.
4. Length and format: 36 s, 16:9 as proposed?
