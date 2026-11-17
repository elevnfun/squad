# Home page: animated prototype

The glass match ball from `../ball/`, driven by scroll through the seven beats of
`docs/design/03-motion-and-hero.md`. One continuous page, a fixed canvas behind real HTML words.
Everything is made in code: no model files, no Blender. The one piece of generated artwork is
the Draft pack (`art/`, below); the Blitz fixture cards, the ball and everything else are drawn
in code. The stills in `poster/` are screenshots of the page's own canvas. It is a design
prototype only; nothing in `web/` or the backend is touched.

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
reduced-motion path), `dpr=`, `quality=high|low|min` (fix the quality tier), `nogl=1` (behave as
if there were no WebGL). `window.home.set(p, hold, open)` draws any frame at once.

```
node capture.js beats             # shots/beat-1-hero.png ... beat-7-end.png, hold-mid.png, hold-open.png,
                                  # blitz-step-1..4.png, draft-step-1..4.png (1440x900)
node capture.js beats 1920 1080   # the same at 1920, saved with a -1920 suffix
node capture.js sizes             # hero, full time, Blitz and Draft at 1512x860 and 1728x1000
node capture.js hover             # shots/blitz-card-hover.png and draft-pack-hover.png: the pointer on a card, on a pack
node capture.js poster            # poster/beat-1.jpg to beat-6.jpg: the canvas alone, 2400x1080 (load poster, no-WebGL stills)
node capture.js modes             # shots/no-webgl-blitz.png (?nogl=1) and shots/quality-low-hero.png (?quality=low)
node capture.js titles            # prints every title word's box and its gap to the ball at four window sizes
node capture.js video             # shots/scroll.mp4, 1280x720, 30 fps (the two icon stretches are taken slowly)
```

The captures print nothing for the 404s of missing `art/` files: the page looks for optional
artwork and falls back when it is not there.

## The beats

| Scroll | Beat | Words | What the ball does |
|---|---|---|---|
| 0% | Hero | elevn. Fantasy football with a result at full time. | Whole and closed, turning 6 degrees a second. The core is a dark bead. Hold to open |
| 20% | Full time | A week is too long to wait. Your points are banked at the final whistle. | A macro: the camera pushes in until the ball is about two screens tall. Glass and steel fill the lower right; the title word stands top left, over the dark |
| 40% | Two | Two ways to play. One ball, two halves: Matchday Blitz and Draft. | The teardown: panels lift from the poles, the halves part, the core ignites gold |
| 56% | Blitz | Three squads of three, on any three fixtures. Your captain scores double. A prize every matchday. | The panels close back on, the two halves stay 84 mm apart with the core lit, and the ball draws back to the upper right and turns. The three fixture cards play below it (below) |
| 72% | Draft | Open five packs of three and build a five-a-side. Your captain scores double. Paid weekly. | The same frame, leaning a little to the Draft half; the ball turns on; the five packs play below it (below) |
| 88% | Access | Hold 150,000 $ELEVN to play Blitz. 300,000 adds Draft. Play free. | The ball comes back to the centre and grows: "the one frame", halves 60 mm apart, core lit |
| 100% | End | Fantasy football with a result at full time. [Connect wallet] | The halves close, the core goes dark: the hero frame again |

After the story a plain prizes band scrolls up over the stage (top 5, 50 / 25 / 12 / 8 / 5).

## The two mode icons (`icons.js`)

Each mode has a row of cards at the lower right with its three notes under it; the ball stands
above the row, upper right, and only its lowest part is behind the cards' top edge. Each icon is
a function of one number, so the scrollbar scrubs it both ways. It plays over the first part of
its beat (48.4 to 55.6% for Blitz, 64.4 to 71.6% for Draft) and rests on its last frame from the
beat's mark on. The notes light up as their step arrives.

| Step | Blitz | Draft |
|---|---|---|
| 1 | Three fixture cards appear, fanned, and spread into a row | Five foil packs appear, fanned, and spread into a row |
| 2 | Three players drop into each card, the captain's place first | Each pack opens on three players (the pack dims behind them) |
| 3 | One captain per squad turns gold with a "×2" | Five of the fifteen are picked, the rest dim |
| 4 | Fixture 1's kickoff bar runs out and its lock snaps shut: OPEN becomes LOCKED, the rim goes bright | The five settle into a five-a-side row, DEF DEF MID ATT ATT, and the packs close again |
| 5 | Fixture 2 locks at its own kickoff | The captain turns gold with a "×2" |
| 6 | Fixture 3 locks | The team locks |

Under reduced motion and on narrow screens the icons show their last frame.

## The Blitz fixture cards

Three tall glass cards with a steel rim (about 205 x 286 px each at 1440x900), the same family
as the packs and built the same way (`.pack.fx` > `.pack-body` > `.pack-art` + `.pack-sheen`),
but drawn entirely in code: the artwork is one SVG per card. Top to bottom a card carries
"FIXTURE 1" and an OPEN / LOCKED chip, "HOME v AWAY" in Barlow Condensed, "KICKOFF" and a time
(12:30, 15:00, 17:30) over a thin bar that runs out as kickoff nears, a faint centre circle and
halfway line, three player tokens (the captain on top, gold, with "×2"), and a padlock on the
bottom edge whose shackle stands open until kickoff and then snaps shut with a ring. The fixtures
are placeholders on purpose: no club names, no crests.

The two beats are told apart at a glance by shape and content: rounded glass cards with players
on them against crimped foil packs with a five-a-side tray under them.

**Hover** is the packs' own (one function, `hoverable`, serves both): the card lifts, tilts in 3D
towards the cursor, a sheen sweeps across it once, its rim glows gold and the other two dim. It is
live from the moment the cards stand in their row. Keyboard focus (Tab) gives the same lifted
state. Under reduced motion there is no lift, tilt or sweep, only the gold rim.

## The Draft packs and the `art/` folder

The five packs are the subject of the Draft beat: tall foil packs, 2:3, standing in a row (about
125 x 188 px each at 1440x900, 137 x 206 at 1920x1080). Each is a layered HTML element:

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

**Hover** (shared with the fixture cards; desktop pointer, only while the packs stand closed in their row: for a short stretch
before they open, and from the point they close again, which includes the beat at rest): the pack
lifts, tilts in 3D towards the cursor, a sheen sweeps across it once, its rim glows gold and the
other four dim. Keyboard focus (Tab) gives the same lifted state. Under reduced motion there is
no lift, tilt or sweep, only the gold rim.

**Current artwork (2026-11-17).** `art/pack.png` is one shared design generated with Higgsfield (GPT Image, cut out locally, 800x1200 transparent PNG) and used for all five packs; the page tries `art/pack-N.png` first and falls back to `art/pack.png`. The "PACK N" label is drawn in code over the artwork (`.pack-num`). The hover video is likewise shared: `art/pack-N-hover.webm|mp4` first, then `art/pack-hover.webm|mp4`; it is masked by the PNG's alpha.

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
  closed ball (ELEVN, HOLD), and the ball is moved down by whatever is needed for its top to
  clear the word; to the left of the part of the ball that reaches into the band (MODES, BLITZ,
  DRAFT); or at the left content edge (FULL TIME, where the ball is a macro: the word goes where
  the ball is not, and the ball is still moved down if it would touch it). The word never
  overlaps the ball at rest (`node capture.js titles` prints the gap at four window sizes: 19 px
  at the least); it can cross it briefly while the camera travels between beats.
- Blitz and Draft: the ball's centre is placed 0.24 window heights in from the right end of the
  cards (`modeX`), so it stays over them whatever the window's shape.
- The copy column is 9.4 em of the headline size (`--copy`), so every headline wraps the same
  way at every width: three lines at most (checked from 1280 to 2560 wide).
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

## Loading and slower computers

- **Poster first.** `poster/beat-1.jpg` (the hero frame, 98 KB) is an `<img>` in the HTML and is
  preloaded, so it is on screen before any script has run. The canvas fades in over it (600 ms)
  once its first frame is drawn, and the poster is then taken away. A poster is the canvas alone
  at 2400x1080; it is shown at the window's height and slid sideways so the ball lands where
  the live ball will be (compared with the live canvas at 1440x900 and 1728x1000: no offset),
  so the cross-fade does not jump. Without JavaScript the poster simply stays behind the words.
- **Quality tiers** (`BallEngine.setQuality`). The page starts at `high` and times the frames it
  draws for the first second and a half. If the middle frame took longer than 28 ms (under
  about 35 frames a second) it steps down one tier and times once more.
  `?quality=high|low|min` fixes the tier and switches the timing off.

  | Tier | Buffer pixels per CSS pixel | Bloom | Glass refraction | Multisampling |
  |---|---|---|---|---|
  | high | the screen's own, 2 at most | full | full-size copy of the scene | 4x |
  | low | 1 at most | worked out at half size | half-size copy | 2x |
  | min | 0.75 at most | off | half-size copy | off |

  `low` is hard to tell from `high` (the glass is a little softer). `min` is visibly plainer:
  without the bloom the highlights lose their glow and edges are rougher.
- **No WebGL** (the context cannot be made, or is lost later; `?nogl=1` to try it). The canvas,
  the title words and the hold are not shown. Each beat gets its own still instead,
  `poster/beat-1.jpg` to `beat-6.jpg` (the end frame reuses the hero's), cross-faded as the beat
  changes; the words, the cards and the packs work as usual because they are HTML. About
  580 KB for all six, and only the ones reached are loaded.

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
- `setQuality('high' | 'low' | 'min')`: see "Loading and slower computers".
- Glass variant: the rim ring of each half is satin steel instead of mirror steel, which had
  read as a black band once the ball was apart.

## Where this departs from the spec

| Spec | Here | Why |
|---|---|---|
| Camera fit 60 mm for the close-up | 76 to 80 | A true macro again (the ball is about two screens tall). The last step to 60 is not taken so that the ball's limb stays in frame; the title word stands top left where the ball is not |
| Explode 1 at "apart": panels 30 mm out, halves 60 mm apart | Panels at 0.7 (pole panels fully out, the equator row still seated), halves 144 mm apart | At 60 mm with every panel lifted the gap closes up and it reads as one burst ball, not two halves |
| Access: explode 1 to 0 | Panels return and the halves stay 60 mm apart with the core lit; they close on the way to the end | Gives the access beat its own frame ("the one frame") and the end a last motion |
| Orbit of 40 degrees per mode | The ball turns about its own axis, 14 degrees during each rest and about 26 between beats; the camera slides to the half | Orbiting the camera foreshortens the diagonal split |
| Landscape: split axis horizontal, Blitz left | Diagonal, Blitz upper right, Draft lower left | The ball prototype's tilt and "the one frame" are diagonal; kept so the hero, the hold and the story share one axis |
| Callouts in two columns, each with a leader line | One icon with three notes per beat, lower right, no leader lines | The lines crossed the title word and the ball; the icon now stands directly in front of its ball |
| Title word behind the ball, refracted by the glass | Title word in front of everything, never overlapping the ball at rest | The owner could not read the whole word: letters were hidden by the ball and dimmed by the wash. Legibility wins |
| Camera fit 260 for Blitz and Draft | 560, the ball in the upper right, above the cards | The cards and packs are the subject of those beats and need the room |
| Blitz and Draft show the ball fully torn down | Panels back on, halves 84 mm apart, core lit | Compact enough to be drawn larger (each half 354 px across at 1440x900, up from 267) without covering the cards |
| Hold: release closes it | Same, and the seam cracks 10% while the ring fills | Feedback during the 900 ms |
| Keyboard: Space on the focused canvas | A real button under the ball takes Space or Enter | A canvas is a poor focus target for screen readers |
| Hero and end both carry the gold button | Outlined "Connect wallet" in the words; the one gold button is in the bar | One gold button per view, as in the approved mockup |
| Blueprint toggle, sound, tilt on phones | Not built | Out of scope for this pass (sound was asked to stay off) |
| Three quality tiers chosen by device class | Three tiers chosen by timing the first frames | No device sniffing; the page measures what it actually gets |
| Rain, lanterns, wet ground, bokeh | Dropped by the owner | The video they came from is no longer a reference |
| Reduced motion uses pre-captured stills | The live canvas held still per beat | Same result on screen. The pre-captured stills are used when there is no WebGL |
| Devnet banner, glass nav "once scrolled" | Nav is always glass; no banner | Prototype of the motion, not the chrome |

## Known weak points

- **Nothing here has been seen on a real GPU.** Everything was checked in headless Chromium on
  software WebGL (about one frame a second). That matters most for this round's quality tiers:
  the 28 ms threshold, and how much each tier really saves, are reasoned, not measured. The
  timing itself was only seen to work in the sense that the software renderer steps down. The
  hover's easing and 900 ms sweep, the lock's snap and the poster cross-fade were checked as
  stills and by state, not by eye at speed.
- **Blitz, Draft and Access now show nearly the same ball**: panels on, halves apart, core lit.
  Blitz and Draft differ by a small lean and the turn; Access is the same thing larger and
  centred. The full teardown is only seen on the MODES beat and on the way out of it.
- **The fixture cards are flat.** They are clean and readable but they are SVG: no real glass,
  and the ball's light does not fall on them. Next to the photographed-looking pack they are
  the plainer of the two, though no longer by much.
- **The cards do not show "at least one player from each club".** The three tokens are not
  marked home or away; at this size a mark was unreadable.
- **The ball still passes behind the top edge of the cards and packs** (a few tens of pixels
  of its lowest part), most on Draft. It is not hidden, but it is not fully clear either.
- **The macro has little glass in it at rest**: mostly steel edges, a dark pane and the limb.
  The exact panel under the camera is whatever the turn gives; it was not art-directed.
- **The title word does not pass behind the glass.** It is flat HTML in front of the scene, and
  while the camera travels between beats it can sit over the moving ball for a moment. This
  follows the round-two decision (legibility first); the 2026-11-17 note in `CLAUDE.md` says
  the words sit behind the ball but offset, which this prototype does not do.
- **No WebGL means no title words and no hold**, and the stills are fixed pictures: fine at
  common window shapes, with dark side margins on windows wider than 20:9.
- **Packs "close again"** once the five are picked, so that the beat rests on five bright packs
  that can be hovered. It is a small liberty with what happens to an opened pack.
- **Missing `art/pack-N` files show as 404s in the browser console** (five on load, two more the
  first time a pack is hovered). Harmless, but noisy; a build step for the real site would
  remove them.
- **The icon plays while the camera is still arriving** (the first two thirds of it), so on a
  fast scroll the eye has two things to follow.
- **Hold to open** from the front shows the core partly behind a hexagon frame.
- The video is made frame by frame in still mode, so it shows the scrubbed motion but not the
  idle turn, the word fades, the cursor light, the hovers or the poster cross-fade.
- Glass still does not see other glass, and the inside of the ball has no shadowing (see the
  ball README).
- The phone view is only "does not break": no title words, the icons sit under the words at
  their last frame, and the cards and packs are small.

## Files

- `index.html`, `home.css`, `home.js`: the page
- `icons.js`: the Blitz fixture cards, the Draft packs and their shared hover
- `art/`: the Draft pack artwork and its hover video (see above)
- `poster/`: `beat-1.jpg` to `beat-6.jpg`, the canvas alone at 2400x1080: the load poster and the
  no-WebGL stills
- `capture.js`: stills, posters and the video through Playwright and ffmpeg
- `shots/`: `beat-1-hero.png` to `beat-7-end.png`, `hold-mid.png`, `hold-open.png`,
  `blitz-step-1.png` to `-4`, `draft-step-1.png` to `-4` (1440x900); the same seventeen with
  `-1920` (1920x1080); `beat-1-hero`, `beat-2-full-time`, `beat-4-blitz` and `beat-5-draft` with
  `-1512x860` and `-1728x1000`; `blitz-card-hover.png`, `draft-pack-hover.png`;
  `no-webgl-blitz.png`, `quality-low-hero.png`; `scroll.mp4`
