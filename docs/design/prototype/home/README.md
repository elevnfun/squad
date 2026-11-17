# Home page: animated prototype

The glass match ball from `../ball/`, driven by scroll through the seven beats of
`docs/design/03-motion-and-hero.md`. One continuous page, a fixed canvas behind real HTML words.
Everything is made in code: no model files, no images, no generated imagery, no Blender. It is a
design prototype only; nothing in `web/` or the backend is touched.

## Run it

```
cd docs/design/prototype/home
npm install                       # three.js and the two fonts (Sora, Barlow Condensed)
cd ..                             # serve the prototype folder, because home/ loads ../ball/ball.js
python3 -m http.server 8772
```

Open `http://127.0.0.1:8772/home/`. Scroll, or use the dots at the right edge. In the hero, press
and hold the ball (or focus "Press and hold the ball to open it" and hold Space or Enter).

URL parameters, for captures: `still=1` (no time-based motion, no fades), `p=0..1` (story
position), `hold=0..1` (the ring), `open=1` (a completed hold), `reduced=1` (force the
reduced-motion path), `dpr=`. `window.home.set(p, hold, open)` draws any frame at once.

```
node capture.js beats             # shots/beat-1-hero.png ... beat-7-end.png, hold-mid.png, hold-open.png,
                                  # blitz-step-1..4.png, draft-step-1..4.png (1440x900)
node capture.js beats 1920 1080   # the same at 1920, saved with a -1920 suffix
node capture.js video             # shots/scroll.mp4, 1280x720, 30 fps (the two icon stretches are taken slowly)
```

## The beats

| Scroll | Beat | Words | What the ball does |
|---|---|---|---|
| 0% | Hero | elevn. Fantasy football with a result at full time. | Whole and closed, turning 6 degrees a second. The core is a dark bead. Hold to open |
| 20% | Full time | A week is too long to wait. Your points are banked at the final whistle. | Camera pushes in until the ball fills the right of the screen, its top edge still in view under the title word |
| 40% | Two | Two ways to play. One ball, two halves: Matchday Blitz and Draft. | The teardown: panels lift from the poles, the halves part, the core ignites gold |
| 56% | Blitz | Three squads of three, on any three fixtures. Your captain scores double. A prize every matchday. | Camera leans to the Blitz half, both halves in frame; the ball turns; the Blitz icon plays (below) |
| 72% | Draft | Open five packs of three and build a five-a-side. Your captain scores double. Paid weekly. | Camera leans to the Draft half, both halves in frame; the ball turns on; the Draft icon plays (below) |
| 88% | Access | Hold 150,000 $ELEVN to play Blitz. 300,000 adds Draft. Play free. | The teardown in reverse, stopping at "the one frame": panels back, halves 60 mm apart, core lit |
| 100% | End | Fantasy football with a result at full time. [Connect wallet] | The halves close, the core goes dark: the hero frame again |

After the story a plain prizes band scrolls up over the stage (top 5, 50 / 25 / 12 / 8 / 5).

## The two mode icons (`icons.js`)

Flat SVG in the site's style: steel rims, glass fill, one gold accent. They sit bottom right
with three short notes under them and one thin line to a gold stud on their half of the ball.
Each is a function of one number, so the scrollbar scrubs it both ways. It plays over the first
part of its beat (48.4 to 55.6% for Blitz, 64.4 to 71.6% for Draft) and rests on its last frame
from the beat's mark on. The notes light up as their step arrives.

| Step | Blitz | Draft |
|---|---|---|
| 1 | Nine player tokens appear | Five packs appear, stacked, and spread into a row |
| 2 | They group into three squads of three, one box per fixture | Each pack opens on three players |
| 3 | One captain per squad turns gold with a "×2" | Five of the fifteen are picked, the rest dim |
| 4 | Squad 1 locks (its box goes solid, a padlock) | The five settle into a five-a-side row: DEF DEF MID ATT ATT |
| 5 | Squad 2 locks | The captain turns gold with a "×2" |
| 6 | Squad 3 locks | The team locks |

Under reduced motion and on narrow screens the icons show their last frame.

## How it works

- `home.js` holds a table of poses (`POSE`) and a cue list (`CUES`: scroll position, pose). Every
  frame the scroll position is eased a little, the two neighbouring cues are blended with an
  ease-in-out, and the result is handed to the engine. Nothing is triggered by observers, so the
  story runs backwards exactly as it runs forwards. Two cues with nearly the same pose make a
  beat rest. No animation library: the interpolator is about 15 lines.
- Words are HTML, pinned to the left content edge. Each beat owns the scroll from halfway after
  the last mark to halfway before the next; its words fade in and rise 16 px once (700 ms).
  Without JavaScript the words are a normal readable page.
- Title cards are one outlined Barlow Condensed word drawn to a texture and placed at the back
  of the 3D scene, so the glass refracts it. Each sits above the ball and off to one side
  (the `CARD` table), so most of its letters are on clear background and the rest pass behind
  the glass: centred over the closed ball (ELEVN, HOLD), to the upper left when the ball is
  apart (TWO, BLITZ, DRAFT) and in the close-up (FULL TIME).
- The mode notes are HTML. Each mode has one 1 px leader line (SVG), from its icon to a gold
  stud on its half, re-projected every frame. Blitz has 3 studs, Draft has 5.
- Hold to open: the gold ring fills in 900 ms (on the wall clock), the seam cracks a little
  while it fills, then the halves part 60 mm and the camera comes round to the three-quarter
  frame. Release closes it in 350 ms. Works with the mouse, touch and the keyboard.
- The cursor turns the studio light (12 degrees of yaw, 6 of pitch), never the ball.
- Reduced motion: no scrubbed motion, no idle turn, no cursor light. Each beat is one still
  pose, swapped with a 200 ms fade as its words change; the hold becomes a button that toggles
  open and closed with the same fade.
- Narrow screens (900 px and under): the words flow as a normal page over a dimmed still of the
  closed ball. No scrub, no callout lines, no hold.
- Rendering stops in a hidden tab, when nothing has changed, and once the prizes band has
  covered the stage.

## Engine changes (`../ball/ball.js`)

All earlier setters and URL parameters still work.

- The core and the rim studs are dark while the ball is closed (one soft glint) and ignite to
  full gold as it opens, so opening is a reveal. `setIgnite(t)` overrides it; `null` follows the
  opening.
- `setCamera({ fit, dir, target, shift })`: a free camera for the story. `shift` slides the
  picture sideways without changing the perspective (the ball at 62% across).
- `setSplit` accepts up to 4 (1 is still 60 mm apart).
- `project(point, object)` and `pxPerMm()` for placing HTML against the ball.
- `pointer: false` in the options leaves drag and cursor to the page.
- Glass variant: the rim ring of each half is satin steel instead of mirror steel, which had
  read as a black band once the ball was apart.

## Where this departs from the spec

| Spec | Here | Why |
|---|---|---|
| Camera fit 60 mm for the close-up, 260 for Blitz and Draft | About 172 to 180, and 540 to 560 | The spec frames to the short side with nothing else on screen. Here the close-up keeps the ball's top edge in view so the title word can be read, and Blitz and Draft keep both halves in frame with room for the icon |
| Explode 1 at "apart": panels 30 mm out, halves 60 mm apart | Panels at 0.7 (pole panels fully out, the equator row still seated), halves 144 mm apart | At 60 mm with every panel lifted the gap closes up and it reads as one burst ball, not two halves |
| Access: explode 1 to 0 | Panels return and the halves stay 60 mm apart with the core lit; they close on the way to the end | Gives the access beat its own frame ("the one frame") and the end a last motion |
| Orbit of 40 degrees per mode | The ball turns about its own axis, 14 degrees during each rest and about 26 between beats; the camera slides to the half | Orbiting the camera foreshortens the diagonal split |
| Landscape: split axis horizontal, Blitz left | Diagonal, Blitz upper right, Draft lower left | The ball prototype's tilt and "the one frame" are diagonal; kept so the hero, the hold and the story share one axis |
| Callouts in two columns, each with a leader line | One icon with three notes per beat, bottom right, and one leader line | Three lines crossed the title word and the ball |
| Hold: release closes it | Same, and the seam cracks 10% while the ring fills | Feedback during the 900 ms |
| Keyboard: Space on the focused canvas | A real button under the ball takes Space or Enter | A canvas is a poor focus target for screen readers |
| Hero and end both carry the gold button | Outlined "Connect wallet" in the words; the one gold button is in the bar | One gold button per view, as in the approved mockup |
| Blueprint toggle, sound, tilt on phones, poster-first, quality tiers | Not built | Out of scope for this pass (sound was asked to stay off) |
| Rain, lanterns, wet ground, bokeh | Dropped by the owner | The video they came from is no longer a reference |
| Reduced motion uses pre-captured stills | The live canvas held still per beat | Same result on screen; real stills belong with the poster work |
| Devnet banner, glass nav "once scrolled" | Nav is always glass; no banner | Prototype of the motion, not the chrome |

## Known weak points

- **Title cards.** They now read at a glance, but the last letter or two still sit behind the
  glass by design: the Z of BLITZ, the T (and part of the F) of DRAFT, the O of TWO, the lower
  half of the middle letters of ELEVN and HOLD. At 1440x900 the word and the ball share a band
  only about 150 px tall, so there is little room to move either.
- **The close-up is no longer very close.** To leave the title word clear the camera stops
  further out (the ball is about 1.2 screens tall). The seam and the glass are still the
  subject, but the spec's 60 mm macro is gone.
- **Blitz and Draft still share one ball pose.** The beats now differ by their icon, their
  notes, the title word and a small lean of the camera; the object itself is the same two
  halves in both.
- **The icons are small**: about 300 px wide at 1440x900 and 370 px at 1920x1080. The player
  tokens inside the Draft packs are about 17 px across. They are flat SVG over the canvas, so
  the ball's glow does not fall on them.
- **The leader line** on Blitz crosses a corner of the Blitz half to reach its stud.
- **The icon plays while the camera is still arriving** (the first two thirds of it), so on a
  fast scroll the eye has two things to follow.
- **Hold to open** from the front shows the core partly behind a hexagon frame.
- Frame rate is unmeasured: everything here was checked in headless Chromium on software
  WebGL (about one frame a second), so timings were verified by state, not by eye. The video
  is made frame by frame in still mode, so it shows the scrubbed motion but not the idle turn,
  the word fades or the cursor light.
- Glass still does not see other glass, and the inside of the ball has no shadowing (see the
  ball README).
- The phone view is only "does not break": the icons sit under the words at their last frame.

## Files

- `index.html`, `home.css`, `home.js`: the page
- `icons.js`: the two mode icons
- `capture.js`: stills and the video through Playwright and ffmpeg
- `shots/`: `beat-1-hero.png` to `beat-7-end.png`, `hold-mid.png`, `hold-open.png`,
  `blitz-step-1.png` to `-4`, `draft-step-1.png` to `-4` (1440x900), the same seventeen with
  `-1920` (1920x1080), `scroll.mp4`
