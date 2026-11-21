# elevn promo for X: shot-by-shot storyboard (v2, 2026-11-21, retimed to the supplied track)

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

## The track (measured from the owner's mp3)
42.06 s, stereo, 44.1 kHz, loud (-8.2 LUFS). 80 BPM: a beat every 0.75 s, a bar every 3.0 s.
Quiet intro 0-7.9 s (about -15 dB, with a near-silent gap at 7.0-7.4 s), then the **drop at 7.9-8.0 s**
(jumps about 11 dB and stays loud). Loud to 40.4 s, then a 1.6 s tail. Bars start at 8, 11, 14, 17, 20,
23, 26, 29, 32, 35, 38 s. Nothing is replaced; I only trim, duck and fade it. The video runs the whole
track: **42 s**.

## Football style (owner's change, 2026-11-21: replaces the street football and the Nike look)
A top-level night match filmed like a live TV final: wide main camera, pitch-side close-ups, behind-the-goal
angle, slow-motion replay, crowd shots, a referee, a packed stadium under floodlights. Nike "Winner Stays" is
now a reference for pace and energy only. The Desert Eagle clip stays the reference for motion graphics.
- **Teams (owner's change, 2026-11-21, replaces the invented teams).** Real teams and real players, for
  example Manchester City v Chelsea, in their real kits and colours. Same realistic top-level match, full
  stadium, live-TV look. The spine is unchanged. The scorer is the player in the viewer's Blitz squad on the
  laptop, with his real name on the elevn screen.
- **Prompt rules kept as defaults** (the owner did not lift them): no broadcaster logos, no competition
  logos or trophies, no sponsor names on shirts, no anthem. Every frame is checked for stray text.
- **Swappable.** Camera angles, timing and transitions do not depend on the kits, so the same storyboard can
  be remade with other or invented teams.
- **If Higgsfield refuses** a real face or badge, I do not work around it. I report which shot was blocked and
  offer it with the real kit colours and no recognisable face (from behind or wide).
- **Files** are named `DRAFT_not-for-posting_...` and nothing is published, until the owner says otherwise.
- **Tie to the product.** The scorer is the player in the viewer's Blitz squad. Each
  action is followed by its screen effect: goal, then points climb; captain double; rank rises; prize.
- **Score graphic.** Drawn in code in elevn's style (steel and glass, gold), invented team codes, no real names.

## Shots (42 s, 16:9, 720p draft; cuts land on the beat grid above)
G = generated football clip. S = real elevn screen from `docs/design/mockups/shots/`, composited. M = code motion graphics.

| # | Sec | What is seen | Screen | Transition out | Text |
|---|---|---|---|---|---|
| 1 | 0-2.6 | G: wide TV main camera, packed stadium at night, the scorer takes a pass and beats the first defender | | whip pan, motion blur | broadcast score bug (elevn style) |
| 2 | 2.6-5.6 | G: pitch-side close-up, beats the second defender, referee in frame, crowd swell | | ball blur | none |
| 3 | 5.6-8.0 | G: behind-the-goal angle, the strike lands in the music's gap (7.0-7.4); ball in the top corner at **8.0** | | hard cut on the drop | none |
| 4 | 8.0-9.5 | G: slow-motion replay, net ripples, stadium erupts | | camera pulls back through the net | none |
| 5 | 9.5-11.0 | G: it is a TV in a small flat, the viewer jumps up, arms raised | | push into the laptop in their hands | none |
| 6 | 11.0-14.0 | S on laptop: Today. Reveal on the bar line | `today.png` | glint wipe | "elevn. Redesigned." |
| 7 | 14.0-17.0 | M+S: Today 14.0, Ranks 15.5, Chat 16.25, tab bar highlighted | `today.png`, `ranks.png`, `chat.png` | tab flips like a card | "Today. Ranks. Chat." |
| 8 | 17.0-20.0 | G: broadcast wide, a second attack, striker cuts inside | | gold glint, hard cut | none |
| 9 | 20.0-23.0 | S: pick 3 from a fixture, captain flagged x2 | `blitz-pick.png` | slide | "BLITZ. Pick 3. Captain scores double." |
| 10 | 23.0-26.0 | Existing Higgsfield pack art and hover video, five packs flip | `art/pack.png`, `pack-hover.mp4` | packs burst into pitch lines | "DRAFT. Open 5 packs." |
| 11 | 26.0-29.0 | S: the Draft five-a-side | `draft.png` | slide | "Build your five." |
| 12 | 29.0-32.0 | G: behind-the-goal, keeper dives, ball in, crowd on its feet | | rank number rolls out | none |
| 13 | 32.0-35.0 | S: Blitz matchday board, rank climbs, then the weekly board | `ranks.png` | count-up | "Blitz matchday. Weekly boards." |
| 14 | 35.0-38.0 | M+S: points rise, a win, Winnings page | `winnings-1.png` | Collect press on 38.0 | "Top 5 paid." |
| 15 | 38.0-42.0 | Glass ball swells, logo, elevn.fun | | end | "Weekly $500. Play free." |

Checks against the rules: SOL only (the $500 weekly is the one exception, named as a weekly prize and
nothing more); "Blitz matchday", never "daily"; no blue grade; no real players, clubs, kits, badges or
sponsors; no promises of earnings; no dollar value beside any prize.

## Sound plan
M = the owner's track. Mix target: about -14 LUFS, true peak under -1.5 dBTP, checked on a phone-speaker
simulation (band-limited to about 150 Hz-8 kHz) so the effects still read. The track is already loud, so it
is lowered about 5 dB overall to leave room, then limited. Music is never cut dead: every dip is a duck of
at most 0.3 s down and 0.2-0.4 s back up, on a beat.

| Shot | Music | Effects |
|---|---|---|
| 1 0-2.6 | Intro, full (it is quiet), starts with a 0.5 s fade-in | Crowd murmur rising, boots on grass, ball touches |
| 2 2.6-5.6 | Intro, full | Crowd swell, quick breaths, second tackle whoosh, ball touches |
| 3 5.6-8.0 | Ducked 6 dB from 6.5 s to the natural gap, then full on the drop at 8.0 | Crowd rising to a peak, the strike at 7.2 (in the gap), a held breath, net hit and **crowd roar exactly at 8.0** |
| 4 8.0-9.5 | Full | Roar tails off, net rustle; the roar is ducked under the music, not over it |
| 5 9.5-11.0 | Lowered 8 dB for the room, back to full on the bar line at 11.0 | Muffled TV commentary-free crowd, couch thump, the viewer's shout and cheer |
| 6 11.0-14.0 | Full | Clean interface hit on "Redesigned.", a soft riser into the tabs |
| 7 14.0-17.0 | Full | Three quiet interface clicks on 14.0, 15.5, 16.25 |
| 8 17.0-20.0 | Full | Boots, a quick whoosh, a ball strike |
| 9 20.0-23.0 | Full | Captain "x2" blip |
| 10 23.0-26.0 | Full | Pack foil flip and burst, light |
| 11 26.0-29.0 | Full | Soft tick as each of the five lands |
| 12 29.0-32.0 | Full | Dive thud, net, a smaller crowd lift |
| 13 32.0-35.0 | Full | Soft rising tick while the rank counts up |
| 14 35.0-38.0 | Lowered 5 dB under the Collect press, back to full on 38.0 | Count-up ticks, one clean click and a chime at Collect |
| 15 38.0-42.0 | Full to 40.4, then the track's own tail | Low swell on the ball, nothing over the final tail |

No commentary voices, no broadcast audio, no chants, no other songs, nothing from the Nike ad.

## Price
Live quote (`estimate_video_cost`, Seedance 2.5, 16:9): 35 credits for 5 s, 70 for 10 s: **7 credits per second**.
The quote did not state the resolution, so 720p is assumed and not confirmed.

| Item | Credits |
|---|---|
| Test shot (shot 1, 5 s) | 35 |
| Generated football clips: shots 1-5 as 3 clips of 5 s, plus shots 8 and 12 as 2 clips of 5 s | 175 plus 35 for the 6th clip = 210 |
| Location and subject stills (about 8 at 0.25) | about 2 |
| Retry reserve (about 40%) | about 85 |
| Video total with reserve | about 330 |
| Generated sound effects: Mirelo text-to-audio quoted at **1 credit per clip**, about 14 clips, with rerolls about 25 | about 25 |
| **Grand total with reserve** | **about 355** |

Proposed hard caps: **350 credits for video, 30 for sound effects**. Screens, text, transitions, callouts and
the end card are code and cost 0. The Katana CC0 library has whooshes, hits, risers and interface sounds
for free (it has no crowd, ball or boots), so only the football sounds are generated. If the generated
sounds are weak I will say so and suggest a royalty-free source instead; I will not spend more first.
The sound model's own catalogue line says "game pipeline only", so it may refuse a request; I will tell you if it does.

## Things to decide
1. Do you approve the 35-credit test shot, the 350 video cap and the 30-credit sound cap?
2. **get_katana_config** only opens a session for a published preset. This is a custom remix with no preset, so I did not call it
   and your free-run balance is unknown. Say if you want me to open one on a preset anyway.
3. **Screens are still images**, so they move by camera, slides and callouts, not live clicks.
4. The video is now 42 s because it follows your whole track. Cut it shorter, or keep 42 s?

## Test shot 1 (2026-11-21)
Cost 35 credits (Seedance 2.5, 5 s, 16:9, 1280x720). Balance after: about 1,095. File: `docs/design/video/tests/test-shot-1.mp4`.
Good: night street, floodlit fog, low tracking camera, first defender beaten. Weak: the player looks like a
child (must be an adult for a prize product), the ball looks cream not white, the defender goes to the floor
instead of being left behind, and the clip carries its own audio, which I will mute and replace.

## Screens with real names (2026-11-21)
The mockups already show real clubs and players, which now fits. They do not contain a Man City v Chelsea
fixture (they show Liverpool v Man City and Chelsea v Newcastle) or the scorer in a Blitz squad. For the video
I render a copy of the pick, Today and Ranks pages in a browser with that fixture and scorer filled in (free).
Only sample text changes; the mockups themselves are not touched. Club crests on the screens stay as the
mockups draw them (three-letter codes), not real badges.

## Test shot 2: Man City v Chelsea (2026-11-21)
Cost 35 credits. Balance after: about 1,060. File: `docs/design/video/tests/test-shot-2-city-chelsea.mp4` (1280x720, 5 s).
Higgsfield did not refuse. Good: broadcast look, wide then close tracking camera, sky-blue number 9 with a
Haaland-like build and hair, first defender beaten, referee in frame. Weak: garbled text on the pitch-side
boards and on the shirt chest (reads as fake sponsors), the stadium resembles a real ground, the ball is yellow,
the second defender is not shown yet. Fix: ask for blank boards and a plain chest, a white ball, and mask any
leftover text when compositing.

## Katana session (2026-11-21)
Opened on request: preset `/katana/chrome-noir-style-edit`, paid tracking (free_generation false), no credits spent.
The session expires 03:11 UTC on 2026-11-21 and is passed with every later generation. Note: this preset's own
reference is a black-and-white fashion edit, not the Desert Eagle clip, and its form asks for 1-10 images. The
Desert Eagle clip and the football plan stay the creative brief; the preset was the closest published chrome-on-black match.

## Clip B (2026-11-21)
Cost 35 credits (Seedance 2.5, from the last frame of test shot 2, via the Katana session). Balance after: about 1,025.
File: `docs/design/video/tests/test-clipB-goal.mp4` (1280x720, 5 s). Good: the second defender slides in and is beaten,
the run, the right-foot strike, then a behind-the-goal view of the net under floodlights. Weak: the ball is never seen
entering the net and the net does not clearly ripple; there is no crowd eruption on camera. Clips A+B join into 10 s
for the opening 8 s (timeline 0-8 s).

## Desert Eagle analysis, first pass (sandbox, not yet frame by frame)
25.7 s, 25 fps, 720x900 with a Higgsfield prompt header above the picture. Automatic cut points at about 1.6, 2.6,
4.6, 5.6, 6.4, 12.6, 13.1, 15.5, 18.6, 20.6, 21.5, 25.6 s: most land on whole seconds, with a long held hero section from 6.4 to 12.6 s.
