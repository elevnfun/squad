# Home page: animated prototype

The glass match ball from `../ball/`, driven by scroll through the seven beats of
`docs/design/03-motion-and-hero.md`. One continuous page, a fixed canvas behind real HTML words.
Everything is made in code: no model files, no images, no generated imagery, no Blender. The one
place artwork can be dropped in is the five Draft packs (`art/`, below); until then they are drawn
in code. It is a design prototype only; nothing in `web/` or the backend is touched.

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
node capture.js sizes             # hero, Blitz and Draft at 1512x860 and 1728x1000
node capture.js hover             # shots/draft-pack-hover.png: the Draft beat with the pointer on a pack
node capture.js titles            # prints every title word's box and its gap to the ball at four window sizes
node capture.js video             # shots/scroll.mp4, 1280x720, 30 fps (the two icon stretches are taken slowly)
```

The captures print nothing for the 404s of missing `art/` files: the page looks for optional
artwork and falls back when it is not there.

## The beats

| Scroll | Beat | Words | What the ball does |
|---|---|---|---|
| 0% | Hero | elevn. Fantasy football with a result at full time. | Whole and closed, turning 6 degrees a second. The core is a dark bead. Hold to open |
| 20% | Full time | A week is too long to wait. Your points are banked at the final whistle. | Camera pushes in until the ball fills the right of the screen, its top edge just under the title word |
| 40% | Two | Two ways to play. One ball, two halves: Matchday Blitz and Draft. | The teardown: panels lift from the poles, the halves part, the core ignites gold |
| 56% | Blitz | Three squads of three, on any three fixtures. Your captain scores double. A prize every matchday. | The ball draws back to the upper right, both halves in frame, and turns; the Blitz icon plays in front of it (below) |
| 72% | Draft | Open five packs of three and build a five-a-side. Your captain scores double. Paid weekly. | The same frame, leaning to the Draft half; the ball turns on; the five packs stand in front of it and play (below) |
| 88% | Access | Hold 150,000 $ELEVN to play Blitz. 300,000 adds Draft. Play free. | The teardown in reverse, stopping at "the one frame": panels back, halves 60 mm apart, core lit |
| 100% | End | Fantasy football with a result at full time. [Connect wallet] | The halves close, the core goes dark: the hero frame again |

After the story a plain prizes band scrolls up over the stage (top 5, 50 / 25 / 12 / 8 / 5).

## The two mode icons (`icons.js`)

Steel rims, glass fill, one gold accent. Each icon is a wide panel at the lower right, in front of
the ball, with its three notes in a row under it. Each is a function of one number, so the
scrollbar scrubs it both ways. It plays over the first part of its beat (48.4 to 55.6% for Blitz,
64.4 to 71.6% for Draft) and rests on its last frame from the beat's mark on. The notes light up
as their step arrives.

| Step | Blitz | Draft |
|---|---|---|
| 1 | Nine player tokens appear | Five foil packs appear, fanned, and spread into a row |
| 2 | They group into three squads of three, one box per fixture | Each pack opens on three players (the pack dims behind them) |
| 3 | One captain per squad turns gold with a "×2" | Five of the fifteen are picked, the rest dim |
| 4 | Squad 1 locks (its box goes solid, a padlock) | The five settle into a five-a-side row, DEF DEF MID ATT ATT, and the packs close again |
| 5 | Squad 2 locks | The captain turns gold with a "×2" |
| 6 | Squad 3 locks | The team locks |

Under reduced motion and on narrow screens the icons show their last frame.

## The Draft packs and the `art/` folder

The five packs are the subject of the Draft beat: tall foil packs, 2:3, standing in a row (about
122 x 183 px each at 1440x900, 150 x 225 at 1920x1080). Each is a layered HTML element:

```
.pack            its place in the row, driven by the scroll
  .pack-body     the hover state: lift, 3D tilt, gold rim glow
    .pack-art    the artwork: art/pack-N.png if it exists, else the pack drawn in code
    video        art/pack-N-hover.webm or .mp4 if one exists
    .pack-sheen  the foil sheen that sweeps across on hover
```

The code-drawn pack (`packArt` in `icons.js`) is an SVG: saw-tooth sealed edges top and bottom
with a ridged strip, brushed foil, one diagonal swoosh with a thin echo and a gold hairline, the
"elevn." wordmark with its gold full stop, "DRAFT" and "PACK 1" to "PACK 5" in Barlow Condensed,
and the pack's number very large and outlined behind the swoosh. Three tones of the same night
and steel: packs 1 and 5 night, 2 and 4 smoked, 3 bright steel with a black swoosh.

**Hover** (desktop pointer, only while the packs stand closed in their row: for a short stretch
before they open, and from the point they close again, which includes the beat at rest): the pack
lifts, tilts in 3D towards the cursor, a sheen sweeps across it once, its rim glows gold and the
other four dim. Keyboard focus (Tab) gives the same lifted state. Under reduced motion there is
no lift, tilt or sweep, only the gold rim.

**Swapping in artwork.** Put files in `docs/design/prototype/home/art/`. Nothing else changes;
the page looks for them when it loads and uses whichever exist, pack by pack.

| File | What | Format |
|---|---|---|
| `pack-1.png` to `pack-5.png` | The pack, closed, straight on | PNG with a transparent background, portrait 2:3, 800 x 1200 px (600 x 900 at least). The pack should fill the frame edge to edge: the page fits the whole image inside the pack's 2:3 box, and the sheen and the gold glow follow the image's own outline |
| `pack-1-hover.webm` to `pack-5-hover.webm`, or `.mp4` | Optional. A short loop cross-faded in over the pack while it is hovered | Same 2:3 frame and the same framing as the PNG, 2 to 4 seconds, loops cleanly, no sound needed (it is played muted). WebM (VP9) may carry transparency; MP4 (H.264) cannot, so it is cut to the PNG's outline. If both exist the browser takes the WebM when it can play it |

Left to right the packs are 1 to 5. A pack with no PNG keeps its code-drawn foil, so a partial
set works. The hover video is only looked for the first time a pack is hovered.

## How it works

- `home.js` holds a table of poses (`POSE`) and a cue list (`CUES`: scroll position, pose). Every
  frame the scroll position is eased a little, the two neighbouring cues are blended with an
  ease-in-out, and the result is handed to the engine. Nothing is triggered by observers, so the
  story runs backwards exactly as it runs forwards. Two cues with nearly the same pose make a
  beat rest. No animation library: the interpolator is about 15 lines.
- Words are HTML, pinned to the left content edge. Each beat owns the scroll from halfway after
  the last mark to halfway before the next; its words fade in and rise 16 px once (700 ms).
  Without JavaScript the words are a normal readable page.
- Title words are one outlined Barlow Condensed word per beat, as HTML above the canvas and above
  the dark wash, so every letter is drawn at the same strength and nothing in the 3D scene can
  dim or cover part of it. The word sits in a band under the bar (capitals 12.5% of the window
  height). It is placed against the ball's outline on screen, measured at the beat's resting
  pose each time the window is sized (`layoutTitles`), not by fixed numbers: centred over the
  closed ball (ELEVN, FULL TIME, HOLD), and the ball is moved down by whatever is needed for its
  top to clear the word; or to the left of the part of the ball that reaches into the band
  (TWO, BLITZ, DRAFT). The word never overlaps the ball at rest; it can cross it briefly while
  the camera travels between beats.
- The mode notes are HTML, in a row under each icon.
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
| Callouts in two columns, each with a leader line | One icon with three notes per beat, lower right, no leader lines | The lines crossed the title word and the ball; the icon now stands directly in front of its ball |
| Title word behind the ball, refracted by the glass | Title word in front of everything, never overlapping the ball at rest | The owner could not read the whole word: letters were hidden by the ball and dimmed by the wash. Legibility wins |
| Camera fit 260 for Blitz and Draft | 740, the ball in the upper right | The packs and the Blitz squads are the subject of those beats and need the room |
| Hold: release closes it | Same, and the seam cracks 10% while the ring fills | Feedback during the 900 ms |
| Keyboard: Space on the focused canvas | A real button under the ball takes Space or Enter | A canvas is a poor focus target for screen readers |
| Hero and end both carry the gold button | Outlined "Connect wallet" in the words; the one gold button is in the bar | One gold button per view, as in the approved mockup |
| Blueprint toggle, sound, tilt on phones, poster-first, quality tiers | Not built | Out of scope for this pass (sound was asked to stay off) |
| Rain, lanterns, wet ground, bokeh | Dropped by the owner | The video they came from is no longer a reference |
| Reduced motion uses pre-captured stills | The live canvas held still per beat | Same result on screen; real stills belong with the poster work |
| Devnet banner, glass nav "once scrolled" | Nav is always glass; no banner | Prototype of the motion, not the chrome |

## Known weak points

- **The title word no longer passes behind the glass.** It is flat HTML in front of the scene, so
  the refraction through the ball is gone, and while the camera travels between beats the word
  can sit over the moving ball for a moment.
- **The ball is small on Blitz and Draft** (about 45% of the window height, upper right) and its
  lower half is behind the icon. That was the trade for making the packs the subject.
- **The packs are drawn, not photographed.** The code-drawn foil reads as a pack but is flat next
  to the ball: no crumple, no real reflections, and the ball's light does not fall on it. The
  `art/` images are meant to fix this.
- **Packs "close again"** once the five are picked, so that the beat rests on five bright packs
  that can be hovered. It is a small liberty with what happens to an opened pack.
- **Hover has not been seen at real speed.** The lift, tilt and sweep were checked as stills in
  headless Chromium; the easing and the 900 ms sweep need a look on a real GPU. The image and
  hover-video paths were tried once with throwaway test files (both swapped in correctly), not
  with real artwork.
- **Missing `art/` files show as 404s in the browser console** (five on load, two more the first
  time a pack is hovered). Harmless, but noisy; a build step for the real site would remove them.
- **The close-up is not very close.** To leave the title word clear the camera stops further out
  (the ball is about 1.2 screens tall). The spec's 60 mm macro is gone.
- **Blitz and Draft still share one ball pose.** The beats differ by their icon, their notes, the
  title word and a small lean of the camera.
- **The Blitz icon is large and plain** next to the packs: nine tokens in three boxes, scaled up
  to match the packs' width.
- **The icon plays while the camera is still arriving** (the first two thirds of it), so on a
  fast scroll the eye has two things to follow.
- **Hold to open** from the front shows the core partly behind a hexagon frame, and the opened
  ball can cross the title word while it is held.
- Frame rate is unmeasured: everything here was checked in headless Chromium on software
  WebGL (about one frame a second), so timings were verified by state, not by eye. The video
  is made frame by frame in still mode, so it shows the scrubbed motion but not the idle turn,
  the word fades, the cursor light or the pack hover.
- Glass still does not see other glass, and the inside of the ball has no shadowing (see the
  ball README).
- The phone view is only "does not break": no title words, the icons sit under the words at
  their last frame, and the packs are small.

## Files

- `index.html`, `home.css`, `home.js`: the page
- `icons.js`: the two mode icons and the Draft packs
- `art/`: optional pack artwork (see above); empty for now
- `capture.js`: stills and the video through Playwright and ffmpeg
- `shots/`: `beat-1-hero.png` to `beat-7-end.png`, `hold-mid.png`, `hold-open.png`,
  `blitz-step-1.png` to `-4`, `draft-step-1.png` to `-4` (1440x900); the same seventeen with
  `-1920` (1920x1080); `beat-1-hero`, `beat-4-blitz` and `beat-5-draft` with `-1512x860` and
  `-1728x1000`; `draft-pack-hover.png`; `scroll.mp4`
