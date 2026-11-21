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
- **Prompt rules (owner, 2026-11-21): the restrictions on broadcaster logos, competition logos, trophies, sponsor names and names on shirts are lifted.**
  Garbled or invented text is still checked in every frame.
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
nothing more); "Blitz matchday", never "daily"; no blue grade; real teams and players allowed (owner, 2026-11-21), no logo, trophy, sponsor or shirt-name restrictions; no promises of earnings; no dollar value beside any prize.

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

## Section: from the goal to the platform (8.0-14.0 s, 6 s, 8 beats)
Replaces old shots 4, 5 and 6. Beats are 0.75 s: 8.0, 8.75, 9.5, 10.25, 11.0, 11.75, 12.5, 13.25, 14.0.
The 10 s already made (clips A+B) fill 0-8 s; their goal moment is at about 8.4 s of raw footage, so the join trims
about 0.4 s from the start so the ball is in the net on 8.0. The exact frame is measured when I cut it.

| Sec | What is seen | Move and transition | Music | Effects |
|---|---|---|---|---|
| 8.0-8.75 | Clip B's goal view, net, floodlights. Slow motion (about 35% speed), the broadcast score graphic drops in, drawn in code | Speed ramp: slow on the goal | Drop lands, then ducked about 7 dB under the roar (not cut) | Crowd roar rises over the goal, net thump |
| 8.75-9.5 | The same picture rushes backwards: the picture shrinks into a TV, gaining its frame, screen glow, reflections on the couch and table, with radial motion blur and a 3 degree rotation that settles | Fast pull-back, snap on **9.5** with a 3-frame overshoot and a glow flash | Ducked | Rising whoosh, a snap on 9.5 |
| 9.5-10.25 | Student dorm room at evening, lit mainly by the TV. A 19-year-old student alone on a couch, laptop on his knees showing his Blitz squad with Haaland as captain (real elevn screen). The TV plays a broadcast replay of the strike | Locked camera, small parallax drift | Ducked | Room tone, muffled crowd from the TV |
| 10.25-11.0 | He jumps up and celebrates, arms up, shouting. The laptop stays visible, left open on the cushion | Hold | Ducked, roar and shout clear | Viewer's shout and cheer, couch thump |
| 11.0-12.5 | Camera drops from the celebrating viewer down and **through** the laptop screen, the real elevn screen swelling until it fills the frame | Push-in with motion blur, a flash as it passes the glass, **lands on 12.5** | Music back to full on 11.0 (the bar line) | Whoosh, soft glass pass, low swell |
| 12.5-14.0 | Blitz screen: Haaland's points climb, the captain double (x2) applies, the viewer's place rises on the Blitz matchday board | Counters tick on beats 12.5, 13.25; a rank roll lands on **14.0** | Full | Clean interface ticks, one chime on the rank change |

Then the platform section starts on 14.0 with the tabs (old shot 7) and continues as in the first brief.

### How each part is made
- **Join with clip B.** The pull-back starts from clip B's last frame at full size. The same frame becomes the TV picture
  once the move lands, so teams, kits, stadium and angle match exactly. The TV then plays a replay of the strike cut from
  clips A+B, so after the reveal the match keeps playing from footage already paid for.
- **The room (new generation).** One still of the room first, then one 5 s locked-camera clip from it (viewer from behind and
  to the side so the laptop screen faces the camera, TV across the room on the right, viewer on the left so he does not cross the TV).
  The model draws the TV and laptop screens; I cover both with the real pictures, so it never invents the interface or its text.
  No blue light: the room is lit warm white from the TV.
- **Screens.** Copies of the real mockup pages (`blitz-pick`, `today`, `ranks`) in a browser, with a Man City v Chelsea
  fixture, Haaland as captain and counting numbers, using web/DESIGN.md colours and type. The mockups are not edited.
- **Done in code (free):** speed ramp, pull-back, TV frame and glow, push through the screen, score graphic, counters, sound mix.
- **Sound:** crowd roar, shout and cheer, whooshes and ticks. Whooshes, hits and ticks come from Katana's free library. Crowd and
  the viewer's shout are generated at about 1 credit per clip.

### Price (live quotes)
| Item | Credits |
|---|---|
| Room still, gpt_image_2_6 at 0.75, up to 3 takes | up to 2.25 |
| Room clip, Seedance 2.5, 5 s, 720p (1080p quoted at 80, not needed) | 35 |
| One retry of the room clip, if the first is unusable | 35 |
| Crowd roar, shout, cheer: about 5 clips, rerolls included | about 8 |
| **Section total with the retry** | **about 80** |
Without the retry about 45. Balance now about 1,025, so about 945 after the section with the retry.

### What may go wrong
- The match on the TV after the reveal is reused footage (a replay), not new action.
- The viewer's arms may cross the TV or laptop in the clip. I will cover the screens in order, and if it fails
  I will report the frame. A cutout of the viewer would cost extra (not quoted).
- The pull-back and the push are built from one still room, so room depth is faked with scale and slight rotation, not true 3D.
- The room is one generated clip, so the same viewer, clothes and room hold in every shot by construction.
- The Katana session expires at 03:11 UTC; I will open a new one if it has lapsed.
- Music is ducked at the goal as you asked, so the drop is quieter than the track's own peak; the drop is still audible under the roar.

## Room still and room clip C (2026-11-21)
Room still `docs/design/video/room/room-still-1.png`: 0.75 credits. Room clip `docs/design/video/room/room-clip-C.mp4`: 35 credits (720p, 5 s).
Spent in this section so far: 35.75. Balance about 989. Sound effects not yet generated.
Good: the student reads as an ordinary 19-year-old, same room and clothes throughout, TV clear on the right, he does not cross the TV, the celebration is energetic with a real grin at the camera.
Weak: (1) the laptop leaves the frame, it slides to the bottom edge and only a sliver is visible from about 1.5 s on, so the push into the screen cannot start from the clip after the jump; (2) the camera is not fully locked, the frame drifts slightly, so the screens need tracking; (3) he jumps in place and turns to camera rather than standing up from the couch; (4) the TV and laptop screens show generic content that I cover with the real pictures.

## Section v1 built (2026-11-21): 0-14 s preview, music only
File: `docs/design/video/sections/section_goal_to_platform_v1.mp4` (1280x720, 24 fps, 14 s, music only, no effects yet).
0-8 s is clips A+B trimmed so the ball is in the net at 8.0; 8.0-14.0 is the new section. Built in the Higgsfield sandbox
(tracking, pull-back, push-in, score graphic, screens, mix). Screens: `docs/design/video/screens/` (copies in the mockup style).
Join checks (mean pixel difference between neighbouring frames, normal footage step is about 12): lead-in to goal 10.5, slow-mo to pull-back
0.6 (picture on the TV is the same frame), room to push 14.6 (a whip), push to full-screen screen 0.0, screen to goal effect 0.0.
Intentional bright frames: snap flash at 9.5, glass flash at 12.0-12.2.
Music: -5 dB overall, ducked 7 dB from 8.2 to 11.0 (back up by 11.25), 0.4 s fade-in, limited.
Credits so far this section: 35.75 (balance about 989). Sound effects (crowd, shout, whooshes, ticks) not yet made.

## Section v3 with free sound effects (2026-11-21)
File: `docs/design/video/sections/section_goal_to_platform_v3_sfx.mp4` (0-14 s). Free CC0 effects from Katana's library, placed on the beats:
boom + hit at 8.0 (goal), long whoosh 8.75 into a hit on 9.5 (pull-back snap), whoosh 11.0 (whip), riser 11.55, flash 12.0 (glass), hit and blip 12.5,
blips 13.0 and 13.25, typing ticks 13.5 and 13.75, power-on chime 13.95 (rank). Licences: listed by the library (all CC0).
Mix: true peak -2.1 dBTP, loudness -16.5 LUFS (a little quiet against the -14 target; raise later with the final limiter).
An earlier mix (v2) peaked above 0 dBFS after AAC encoding and was replaced. Still missing: the crowd roar and the viewer's shout (generated, about 8 credits, not yet approved).

## Change request, viewer shot and push into the laptop (owner, 2026-11-21)
Keep the football part unchanged. Redo the viewer: he stays seated, leans forward, clenches a fist and shouts (slight slow motion allowed),
same viewer, clothes and room, and the laptop stays steady on his knees, screen facing the camera, for the whole shot.
Redo the move into the laptop: one smooth camera move from the fist pump down to the screen, push in until the elevn interface fills the frame, landing on a beat.
Sound: remove every effect on that move (no whoosh, riser, flash or hit); music only, back up on the beat; keep the crowd roar and the shout during the fist pump.
Plan awaiting approval: one new room clip (35 credits, 720p, 5 s, from room-still-1.png), crowd roar and shout (about 8 credits).
Timing proposal: room phase 9.5-12.5 (one bar longer), push 12.5-14.0 landing on the bar line, goal effect on the board 14.0-17.0, platform section from 17.0.

## Room clip D and sound clips (2026-11-21)
Approved 43 credits; spent 41.25 (room clip D 35, five sound clips 6.25). Balance 948.53.
Room clip D: `docs/design/video/room/room-clip-D.mp4` (720p, 5 s). He stays seated and does a fist pump; camera locked (TV moves at most 4 px).
Laptop measured against frame 0: steady 0-0.9 s; from 1.0 to 2.5 s it shifts 20-36 px and tilts 12-16 degrees (screen turns partly away) while his arm rises;
then steady again from about 3.75 s to the end (about 25 px left and 12 px up of its start). So the "laptop never moves" rule is NOT met during the fist pump.
Sound clips in `docs/design/video/audio/`: crowd_build (8 s), crowd_roar (6 s), crowd_tail (4 s), shout (3 s), boots_ball (4 s). Not yet listened to or mixed; the shout is quiet (mean -24.7 dB).

## Room clip E (2026-11-21, second redo)
Cost 35 credits. Balance about 913.5. File: `docs/design/video/room/room-clip-E.mp4` (720p, 5 s). Livelier: shouting, two fist pumps, grin, laughing, fairy lights, TV flicker, a curtain edge on the right.
Camera locked (TV moves at most 3 px). Laptop, measured against frame 0: steady only 0-1.3 s, then it shifts up to 66 px and tilts up to 20 degrees as he moves
(he holds it with his left hand but it still moves with him). The "laptop never moves" rule is still NOT met.
Proposed next try: laptop on a low coffee table in front of the couch, screen facing the camera (new still 0.75 + clip 35).

## Section v4 (2026-11-21): 0-17 s, clip E used (owner chose option 2)
File: `docs/design/video/sections/section_goal_to_platform_v4.mp4` (1280x720, 24 fps, 17 s; replaces v1 and v3).
Timing: goal 8.0, pull-back snap 9.5, room 9.5-12.5 (fist pumps about 10.5 and 11.6), push 12.5-14.0 landing on the bar line, goal effect on the board 14.0-17.0 (chip 14.0, C x2, count 54 to 70, rank 8th to 6th landing 17.0).
Laptop: in the room shots it moves with him during the fist pumps (accepted, option 2); the elevn screen is tracked onto it and left off his hand. During the push the laptop is held steady
(the frame is stabilised on its start position); the push is one continuous smoothstep move with no flash and no sound effect.
Sound: music ducked 7 dB 8.2-12.5 and back up by 12.75; reversed crowd build 0-8.0, crowd roar from 8.0 fading by 12.5, crowd tail 10-14, his shout at 9.5 (+12 dB), boots and ball from 3.65 (peak at 6.9, the strike),
library effects: boom and hit 8.0, long whoosh 8.75, hit 9.5, blips 14.0 and 14.75, ticks 15.5 and 16.25, chime 16.9. Nothing on the move into the laptop.
Mix: -14.5 LUFS, true peak -4.0 dBFS after encoding. The generated sounds were not listened to (no way to listen here); the shout and the boots clip are the least certain.
Frame joins (mean difference between neighbours, normal about 2-12): slow-mo to pull-back 0.6, room to push 3.0, push to full screen 2.0, screen to goal effect 0.0; snap flash at 9.5 is intended.
Credits: 948.5 before clip E, about 913.5 after; spent in total about 217.

## Section v5 (2026-11-21): audio fix for 7-12 s (replaces v4)
File: `docs/design/video/sections/section_goal_to_platform_v5.mp4`. Picture is identical to v4.
Cause found by measuring each sound: the mix before limiting peaked at 1.73 (1.0 is full scale) at 8-9 s, with several sounds stacking (music drop, boom, roar, shout), so the limiter pumped and distorted; the shout (boosted +12 dB) was the loudest sound at 9.5-10.5 s;
the music duck began 0.2 s after the drop and cut it off.
Changes: shout trimmed to its loud part, much quieter (+6 dB instead of +12) and placed so its peak is on the first fist pump (10.7 s); crowd build, roar, tail and library effects lowered; boots clip faded out before the roar;
music duck now gentler (4.4 dB, starting 8.45 over 0.5 s); no limiter squeeze, the whole mix is scaled down in one linear step. Result -13.7 LUFS, true peak -1.8 dBFS.
Not verified by ear.

## Full video v1 (2026-11-21): 42 s, 1280x720
File: `docs/design/video/final/elevn_promo_v1_full.mp4` (replaces the 17 s section preview). 0-17 s as section v5. 17-42 s is the platform section, all built in code (no new paid footage), 24 fps, from the real mockup screens
(`docs/design/video/platform/`: `platform.html`, `render.js`, assets).
Desert Eagle treatment used: black stage with vignette and floor reflection, one-word title cards that blur in and out behind the screens (Today. Ranks. Chat. Blitz. Pick 3. Draft. Your five. Boards. Collect.),
blueprint callouts (square markers, thin leader lines, labels typed on, tiny coordinate tags), fast whip cuts with motion blur, a punch-in, a rotate-whip, a black-and-orange thermal pass into Draft (no navy), a flash on the Collect press, and the end card.
Timeline: Today 17.0, Ranks 18.5, Chat 19.25, Blitz 20.0 (3 squads, captain scores double), Pick 3 23.0, Draft 26.0 (thermal), Your five 29.0, Boards 32.0 (matchday and weekly, top 5 paid, your place), Collect 35.0 (half now, half locked; Collect pulses and flashes on 38.0), end card 38.0 (elevn., elevn.fun, Play free).
Sound: music throughout; library whooshes on the cuts, quiet blips as each callout appears, hit and chime on Collect. Mix -14.0 LUFS, true peak -2.3 dBFS.
Open points: the mockup screens show other fixtures and real names (Leverkusen v Leipzig on the pick screen, Kane, Mbappe and others on Draft); the Today and Ranks screens show the sample numbers from the mockups; screens are stills so they move by camera only.
