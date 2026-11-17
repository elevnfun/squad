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
node capture.js beats             # shots/beat-1-hero.png ... beat-7-end.png, hold-mid.png, hold-open.png (1440x900)
node capture.js beats 1920 1080   # the same at 1920, saved with a -1920 suffix
node capture.js video             # shots/scroll.mp4, 1280x720, 30 fps
```

## The beats

| Scroll | Beat | Words | What the ball does |
|---|---|---|---|
| 0% | Hero | elevn. Fantasy football with a result at full time. | Whole and closed, turning 6 degrees a second. The core is a dark bead. Hold to open |
| 20% | Full time | A week is too long to wait. Your points are banked at the final whistle. | Camera pushes in to one seam; the title card shows through the glass |
| 40% | Two | Two ways to play. One ball, two halves: Matchday Blitz and Draft. | The teardown: panels lift from the poles, the halves part, the core ignites gold |
| 56% | Blitz | Three squads of three, on any three fixtures. Your captain scores double. A prize every matchday. | Camera moves to the Blitz half; the ball turns; three callouts with leader lines |
| 72% | Draft | Open five packs of three and build a five-a-side. Your captain scores double. Paid weekly. | Camera moves to the Draft half; the ball turns on; three callouts |
| 88% | Access | Hold 150,000 $ELEVN to play Blitz. 300,000 adds Draft. Play free. | The teardown in reverse, stopping at "the one frame": panels back, halves 60 mm apart, core lit |
| 100% | End | Fantasy football with a result at full time. [Connect wallet] | The halves close, the core goes dark: the hero frame again |

After the story a plain prizes band scrolls up over the stage (top 5, 50 / 25 / 12 / 8 / 5).

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
  of the 3D scene, so the glass refracts it. They thin out towards the words.
- Callouts are HTML; their 1 px leader lines are SVG, re-projected from a point on the ball
  every frame (a rim stud, a point on the rim, the pole panel). Blitz has 3 studs, Draft has 5.
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
| Camera fit 60 mm for the close-up, 260 for Blitz and Draft | About 105 to 118, and 440 to 480 | The spec frames to the short side with nothing else on screen. With words on the left of a 16:9 screen the tighter frames put the ball under the copy |
| Explode 1 at "apart": panels 30 mm out, halves 60 mm apart | Panels at 0.7 (pole panels fully out, the equator row still seated), halves 144 mm apart | At 60 mm with every panel lifted the gap closes up and it reads as one burst ball, not two halves |
| Access: explode 1 to 0 | Panels return and the halves stay 60 mm apart with the core lit; they close on the way to the end | Gives the access beat its own frame ("the one frame") and the end a last motion |
| Orbit of 40 degrees per mode | The ball turns about its own axis, 14 degrees during each rest and about 26 between beats; the camera slides to the half | Orbiting the camera foreshortens the diagonal split |
| Landscape: split axis horizontal, Blitz left | Diagonal, Blitz upper right, Draft lower left | The ball prototype's tilt and "the one frame" are diagonal; kept so the hero, the hold and the story share one axis |
| Callouts in two columns | One column of three per beat, at the right content edge | Each beat shows one half |
| Hold: release closes it | Same, and the seam cracks 10% while the ring fills | Feedback during the 900 ms |
| Keyboard: Space on the focused canvas | A real button under the ball takes Space or Enter | A canvas is a poor focus target for screen readers |
| Hero and end both carry the gold button | Outlined "Connect wallet" in the words; the one gold button is in the bar | One gold button per view, as in the approved mockup |
| Blueprint toggle, sound, tilt on phones, poster-first, quality tiers, rain, bokeh, ground | Not built | Out of scope for this pass (sound was asked to stay off) |
| Reduced motion uses pre-captured stills | The live canvas held still per beat | Same result on screen; real stills belong with the poster work |
| Devnet banner, glass nav "once scrolled" | Nav is always glass; no banner | Prototype of the motion, not the chrome |

## Known weak points

- **Title cards.** Behind a ball that fills a third of the screen most of the word is hidden:
  ELEVN and HOLD show only their outer letters. They read best in the close-up (through the
  glass) and at 1920. They may want to be smaller and off to one side, or dropped from the
  closed-ball beats.
- **Blitz and Draft look alike.** The two beats differ by which half is centred, the callouts
  and the stud count (3 and 5). Nothing in the object itself says "three squads" or "five
  packs" yet.
- **Leader lines** cross the object and, on Blitz, land close together. The anchors are real
  points on the ball, so they move as it turns; that is correct but busy.
- **The close-up** has little in it while the core is dark: it is steel, glass and the title
  card. The spec's "gold showing through a window" was traded away for the reveal.
- **Hold to open** from the front shows the core partly behind a hexagon frame.
- **The far half** runs under the bar or off the bottom edge on Blitz and Draft at 1440x900.
- Frame rate is unmeasured: everything here was checked in headless Chromium on software
  WebGL (about one frame a second), so timings were verified by state, not by eye. The video
  is made frame by frame in still mode, so it shows the scrubbed motion but not the idle turn,
  the word fades or the cursor light.
- Glass still does not see other glass, and the inside of the ball has no shadowing (see the
  ball README).
- The phone view is only "does not break".

## Files

- `index.html`, `home.css`, `home.js`: the page
- `capture.js`: stills and the video through Playwright and ffmpeg
- `shots/`: `beat-1-hero.png` to `beat-7-end.png`, `hold-mid.png`, `hold-open.png` (1440x900),
  the same nine with `-1920` (1920x1080), `scroll.mp4`
