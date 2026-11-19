# Home page: animated prototype

The glass match ball from `../ball/`, driven by scroll through the seven beats of
`docs/design/03-motion-and-hero.md`. One continuous page, a fixed canvas behind real HTML words.
Everything is made in code: no model files, no Blender. There are two pieces of generated
artwork, both in `art/` (below): the Draft pack with its hover video, and the blank Blitz
fixture card. What is written on the cards, the cards' hover glint, the ball and everything
else are drawn in code. The stills in `poster/` are screenshots of the page's own canvas. It is a design
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
reduced-motion path), `dpr=`, `quality=high|low|min` (fix the quality level), `stats=1` (a small
readout in the lower left corner: frame rate, frame time, quality level, timing method, pixel ratio,
canvas size, draw calls and triangles; see "Reading `?stats=1`"), `timing=gaps` (time frames by the
gaps between them even where the GPU timer exists), `smooth=` (how far the ball lags behind the
scrollbar, in milliseconds; 120 unless given), `nogl=1` (behave as if there were no WebGL), `demo=cardhover` (holds the hover on a fixture card once the cards
stand in their row: `card=0..2`, the middle one unless given; `glint=0..1` freezes the glint at
that point of its loop; use it with `p=0.56`). `window.home.set(p, hold, open)` draws any frame at once.

```
node capture.js beats             # shots/beat-1-hero.png ... beat-7-end.png, hold-mid.png, hold-open.png,
                                  # blitz-step-1..4.png, draft-step-1..4.png (1440x900)
node capture.js beats 1920 1080   # the same at 1920, saved with a -1920 suffix
node capture.js sizes             # hero, full time, Blitz and Draft at 1512x860 and 1728x1000
node capture.js hover             # shots/blitz-card-hover.png and draft-pack-hover.png: the pointer on a card, on a pack
node capture.js glint             # shots/blitz-card-glint-strip.png: one card, the hover glint at six points of its loop
node capture.js poster            # poster/beat-1.jpg to beat-6.jpg: the canvas alone, 2400x1080 (load poster, no-WebGL stills)
node capture.js modes             # shots/no-webgl-blitz.png (?nogl=1) and shots/quality-low-hero.png (?quality=low)
node capture.js titles            # prints every title word's box and its gap to the ball at four window sizes
node capture.js dpr2              # shots/dpr2-hero.png, dpr2-close-up.png: part of the ball on a 2x screen, pixel for pixel
node capture.js stats             # shots/stats-readout.png: the hero with ?stats=1
node capture.js video             # shots/scroll.mp4, 1280x720, 30 fps (the two icon stretches are taken slowly)
```

The captures print nothing for the 404s of missing `art/` files: the page looks for optional
artwork and falls back when it is not there.

## The beats

| Scroll | Beat | Words | What the ball does |
|---|---|---|---|
| 0% | Hero | elevn. Fantasy football with a result at full time. | Whole and closed, turning 6 degrees a second. The core is a dark bead. Hold to open |
| 20% | Full time | A week is too long to wait. Your points are banked 15 minutes after the final whistle. | A macro: the camera pushes in until the ball is about two screens tall. Glass and steel fill the lower right; the title word stands top left, over the dark |
| 40% | Two | Two ways to play. One ball, two halves: Matchday Blitz and Draft. | The teardown: panels lift from the poles, the halves part, the core ignites gold |
| 56% | Blitz | Three squads of three, on any three fixtures. Your captain scores double. A prize every matchday. | The panels close back on and the camera comes round to the left, level with the ball, so the two halves stack upright in the upper right: the Blitz half on top, its rim and three gold studs towards the viewer, the lit core in the 87 mm gap under it. The three fixture cards play below it (below) |
| 72% | Draft | Open five packs of three and build a five-a-side. Your captain scores double. Paid weekly. | The camera swings to the right and above: the Draft half's rim, with its five studs, faces the viewer as a ring at the lower left, the Blitz half behind it, 90 mm apart. The five packs play below it (below) |
| 88% | Access | Hold 150,000 $ELEVN to play Blitz. 300,000 adds Draft. Play free. | The ball comes back to the centre and grows, and the halves close to 13 mm: a nearly whole ball with the core fully lit, glowing through the seam and the glass |
| 100% | End | Fantasy football with a result at full time. [Connect wallet] | The seam closes, the core goes dark: the hero frame again |

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

Three tall cards (about 197 x 298 px each at 1440x900), the same family as the packs and built
the same way:

```
.pack.fx         its place in the row, driven by the scroll
  .pack-body     the hover state: lift, 3D tilt, gold rim glow
    .pack-art    art/card.png (the blank card), the glint canvas, then one SVG with the content
    .pack-sheen  the sheen sweep, used only when there is no artwork
```

**The card** is `art/card.png`: a blank smoked-glass card in a polished steel frame, faint
football panels and a centre circle embossed in it, one diagonal chrome stripe with a gold edge
from lower left to upper right (generated with Higgsfield, 738 x 1116, transparent). All three
cards use it. The image is decoded before it replaces the code-drawn card, so a card is never
blank; if the file does not load, the code-drawn card stays (`.has-art` marks a card that has
its artwork, as on the packs).

**The content** is drawn over it in code, in the card's own units (216 x 327), inside the steel
frame and to the left of the stripe: "FIXTURE 1" and an OPEN / LOCKED chip, "HOME v AWAY" in
Barlow Condensed, "KICKOFF" with its time (12:30, 15:00, 17:30) over a thin bar that runs out
as kickoff nears, three player tokens in a HOME column and an AWAY column either side of a
dashed centre line, the two labels at the bottom (the three cards split 2 + 1, 1 + 2 and 2 + 1,
so every squad has a player from each club; the captain is gold with "×2"), and a padlock on
the bottom edge whose shackle stands open until kickoff and then snaps shut with a ring; the
steel frame brightens when the card locks. The fixtures and kickoff times are placeholders on
purpose: no club names, no crests. No scrim was needed behind the text.

**Hover** keeps the packs' lift, 3D tilt towards the cursor, gold rim glow and dimming of the
other two (one function, `hoverable`, serves both), and adds a glint that remakes the pack's
hover video (`art/pack-hover.mp4`) in code, with no video:

- the loop is 4 seconds, starts from the beginning on every hover and fades out in 180 ms on
  leave; keyboard focus (Tab) starts it too;
- a warm, star-shaped glint (white core, warm halo, one long level ray, one along the stripe,
  short ones across) travels along the stripe's centre line, traced from `card.png` (`STRIPE`
  in `icons.js`, 15 points), from lower left to upper right, between about 0.4 s and 3 s;
- the stripe brightens where the glint is: the card's own bright pixels near the stripe are
  kept as a warm white picture (made once from the PNG) and shown through a soft window that
  moves with the glint;
- three small warm sparkles twinkle just under the stripe behind the glint; the last second is
  the card at rest.

It is one small 2D canvas per card (no WebGL), drawn only while its card is hovered, added to
the card's light (`mix-blend-mode: plus-lighter`, `screen` where that is missing) and cut to
the card's outline with `mask-image: url(art/card.png)`. The canvas lies between the artwork
and the content, so the glint passes behind the player tokens and never washes out the text.
Under reduced motion there is no glint, lift or tilt, only the gold rim. In capture mode
(`still=1`) the glint is held at 42% of its loop.

The two beats are told apart at a glance by shape and content: framed glass cards with players
on them against crimped foil packs with a five-a-side tray under them.

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
| `card.png` | The blank Blitz fixture card, straight on, shared by the three cards | PNG with a transparent background, 738 x 1116 (the card's box is 216:327). The card fills the frame edge to edge. The content is laid out for a steel frame about 4% of the width and one stripe from lower left to upper right; a new image with the stripe somewhere else needs its centre line traced again (`STRIPE` in `icons.js`) and the header checked against it |
| `pack-1-hover.webm` to `pack-5-hover.webm`, or `.mp4` | Optional. A short loop cross-faded in over the pack while it is hovered | Same 2:3 frame and the same framing as the PNG, 2 to 4 seconds, loops cleanly, no sound needed (it is played muted). WebM (VP9) may carry transparency; MP4 (H.264) cannot, so it is cut to the PNG's outline. If both exist the browser takes the WebM when it can play it |

Left to right the packs are 1 to 5. A pack with no PNG keeps its code-drawn foil, so a partial
set works. The hover video is only looked for the first time a pack is hovered.

## How it works

- `home.js` holds a table of poses (`POSE`) and a cue list (`CUES`: scroll position, pose). Every
  frame the ball's position in the story follows the scrollbar like a critically damped spring
  (it lags 120 ms behind a steady scroll, starts and stops without a jerk and never overshoots,
  so a wheel step does not make the camera jump; `?smooth=` tries other values), the two
  neighbouring cues are blended with an ease-in-out, and the result is handed to the engine. Nothing is triggered by observers, so the
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
- Narrow screens (900 px and under) get a phone layout: one block per beat with that beat's
  still (`poster/beat-N.jpg`) above its words, the cards and the packs in a row that scrolls
  sideways and snaps a card at a time, no title words, no hold and no live canvas. The 3D engine
  is not started at all on a narrow window; it starts if the window grows past 900 px, and
  stops drawing if it shrinks again.
- A frame is drawn only when something has changed (the scroll, the hero's idle turn, the
  cursor light, the hold, the window). Nothing is drawn in a hidden tab or once the prizes band
  has covered the stage.
- Nothing is measured while a frame is drawn. The window, the story's height and the canvas are
  measured when the window is sized; the scroll handler only notes where the page is; every
  write to the page happens in the animation frame and is skipped when its value has not
  changed. The frame loop makes no new objects.

## Loading and slower computers

- **Poster first.** `poster/beat-1.jpg` (the hero frame, 98 KB) is an `<img>` in the HTML and is
  preloaded, so it is on screen before any script has run. The canvas fades in over it (600 ms)
  once its first frame is drawn, and the poster is then taken away. A poster is the canvas alone
  at 2400x1080; it is shown at the window's height and slid sideways so the ball lands where
  the live ball will be (compared with the live canvas at 1440x900 and 1728x1000: no offset),
  so the cross-fade does not jump. Without JavaScript the poster simply stays behind the words.
- **Quality levels** (`LEVELS` in `ball.js`, `BallEngine.setLevel`). Seven, best first. Going
  down, the cheaper effects go before any sharpness:

  | Level | Name | Buffer pixels per CSS pixel, at most | Multisampling | Picture the glass refracts | Bloom |
  |---|---|---|---|---|---|
  | 0 | high | the screen's own, 2 at most | 4x | full size | on |
  | 1 | high-1 | 2 | 4x | 1 pixel per CSS pixel | worked out at half size |
  | 2 | high-2 | 2 | 2x | 1 per CSS pixel | off |
  | 3 | low | 1.5 | 2x | 1 per CSS pixel | off |
  | 4 | low-1 | 1.25 | 2x | 1 per CSS pixel | off |
  | 5 | low-2 | 1 | 2x | half | off |
  | 6 | min | 0.75 | off | half | off |

  The page starts at level 0 (or at the level it settled on earlier in the same tab) and keeps
  watching how long frames take. `makeWatch` in `home.js` decides; the timing feeds it.

  **How a frame is timed**, in order of preference:

  | Method | Used when | What it costs | How often |
  |---|---|---|---|
  | GPU timer (`EXT_disjoint_timer_query_webgl2`) | the browser offers it (Chrome and Edge on a desktop) | nothing: the graphics card reports each frame's time a few frames later, the page never waits | every drawn frame while a decision is pending; 1 in 30 once settled; every frame again after a slow reading, a resize or a level change |
  | Frame gaps | no timer (Safari, Firefox), or the timer stopped answering (three frames with no answer after 1.5 s, or none at all in its first 40) | nothing: the time between two animation frames, when the first of them was drawn | every drawn frame |
  | Read-back (`readPixels`, which waits for the graphics card) | only with frame gaps, and only when the real cost is needed: the level is below `high` and settled, so the page must know there is room before stepping up; or `?stats=1` is on | one short wait | 1 drawn frame in 30, never more |

  So at `high` without `?stats=1` the page never waits for the graphics card, whichever
  method is in use. `?timing=gaps` forces the second method.

  With frame gaps the page also needs the screen's own frame interval (a browser may hold a
  page to 30 frames a second to save power, which is not the ball's fault). It is measured over
  eight frames with nothing drawn as the canvas fades in, and again whenever the page is at
  rest. The limit between frames is never under 1.4 times that interval.

  **How it decides:**
  - readings are thrown away for one second after the ball starts, for 500 ms after a resize, a
    move to another screen or the tab coming back, and for 250 ms after a level change: those
    frames pay for new buffers;
  - a lot is at least 10 readings and 300 ms of drawing, and its middle reading decides. With
    frame gaps a fifth of the frames at over twice the limit also counts as slow: a renderer
    that cannot keep up can show as on-time frames with a long one every few;
  - over 18 ms of cost (20 ms between frames): it cannot hold 60 frames a second, so one level
    down. Levels 0 and 1 go on one lot, because the next step costs no sharpness. A step that
    lowers the resolution needs two lots in a row that are clearly slow (15% over the limit);
    a middle reading only just over the limit never costs sharpness;
  - over twice the limit: two levels down, on one lot, so a slow computer settles in a few
    seconds;
  - below 1.5 pixels per CSS pixel the limit is 30 ms (35 between frames), so a 2x screen is
    only taken under 1.5 when it cannot hold 30 frames a second;
  - under 7 ms of cost three lots in a row: one level back up. A level that has proved too slow
    twice is not tried again in that visit;
  - three readings in a row over 100 ms is a stall (or a software renderer): straight to `low`
    (1.5 pixels per CSS pixel), never lower, and judged again from there by the rules above.
    After such a drop, each lot under the limit of the level above climbs one level, until the
    page is back where it was; and if the page is at rest it draws up to 300 probe frames so
    that this does not wait for a scroll. One long frame (a tab switch, a collection pause) is
    one reading and changes nothing. Two more stalls within 10 s of each other are no one-off:
    the quick climb is switched off and the usual rule for stepping up applies;
  - three lots in a row with no change: settled. The level is written to `sessionStorage`
    (`elevn.home.level`) and the next load in that tab starts there.

  Levels that come to the same thing on the screen in use are skipped (a 1x screen has no 1.5
  to drop to). `?quality=high|low|min` fixes the level (0, 3 or 6) and switches the watching
  off. Bloom is always worked out from a picture the size of the window in CSS pixels, so the
  glow is as wide on a 2x screen as on a 1x one.

  Fed with simulated frame times (`home.makeWatch`, a 2x screen): steady 8 ms stays at `high`
  and the timing drops to 1 frame in 30 after 0.9 s; one 900 ms frame changes nothing; a 900 ms
  stall spread over three frames goes to `low` and is back at `high` 1.7 s later; steady 40 ms
  whatever the level reaches `min` in 3.1 s and stays; a computer that takes 40 ms at `high`
  and less lower down settles on `low` in 1.3 s; 16 to 20 ms noise makes two changes (to
  `high-2`, still 2 pixels per CSS pixel) and stops.

  **Why this was rebuilt (the owner's Mac showed a soft ball).** The first version timed six
  frames in the first second of the page's life and, if the middle one was over 22 ms, went
  straight to a level with one buffer pixel per CSS pixel and a half-size picture for the glass
  to refract. On a 2x screen that is a quarter of the pixels, and the inside of the ball at a
  sixteenth: `shots/sharpness-dpr2-hero.png` and `sharpness-dpr2-close-up.png` show that level
  beside `high`. Once stepped down it never stepped back up.
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
- `setLevel(0..6)` and `LEVELS`; `setQuality` takes the named ones.
- `setPose(split, explode, turn, ignite)`: all four in one call.
- `precompile()`: compiles every shader before the first frame.
- Every repeated part is one instanced mesh, so the ball is 15 draw calls where it was 149
  (see the ball README).

## Reading `?stats=1`

Open the page with `?stats=1` added to the address (or `#stats` on the published link). Six
lines appear in the lower left corner and refresh twice a second:

```
fps 120 · redraws 120 a second · longest gap 9 ms
frame 6.1 ms median · 9.8 worst (last 40 timed frames)
tier high (level 0 of 6, automatic, settled)
timing GPU timer (no stall), 1 frame in 30 · level unchanged since load (41 s)
DPR 2 in use · screen 2 · canvas 2880 × 1800
draw calls 41 · triangles 134,907
```

(The frame rate and frame time above are an example, not a measurement.)

- **fps** is how often the browser offers a frame (60 or 120 on a Mac); **redraws** is how many
  of those the ball was actually drawn for (0 when the page is at rest on a beat, which is
  right); **longest gap** is the longest wait between two frames in the last three seconds: a
  stutter shows here as 50 ms or more.
- **frame** is the real cost of drawing the ball once, graphics card included, for the middle
  and the worst of the last 40 timed frames. Under 16 ms holds 60 frames a second, under 8 ms
  holds 120. In Safari and Firefox the line reads `frame to frame 8.3 ms median · ... · cost
  5.9 ms`: the time between drawn frames (8.3 is a steady 120 a second, 16.7 is 60), then the
  real cost from the read-back.
- **tier** is the quality level in use. It should say `high` on a recent Mac. `settled` means
  three lots in a row asked for no change; `deciding` means it is still measuring; `climbing
  back after a stall` means it dropped to `low` after three very long frames and is on its
  way back up.
- **timing** is the method in use (see "Quality levels"): `GPU timer (no stall)`, or `frame
  gaps (no stall) + read-back 1 frame in 30`. With `?stats=1` on, the read-back always runs
  under frame gaps, so that the cost can be shown; without it, it runs only below `high`. Then
  how long ago the level last changed and how many changes there have been. A level that
  keeps changing is the thing to report.
- **DPR** is buffer pixels per CSS pixel in use, beside the screen's own. On a Retina screen
  both should be 2, and the canvas twice the window's size each way.
- **draw calls** and **triangles** are for the whole frame, every pass.

The numbers worth sending back: all six lines in the hero, in the close-up (FULL TIME), and
while scrolling from the hero to MODES.

## Where this departs from the spec

| Spec | Here | Why |
|---|---|---|
| Camera fit 60 mm for the close-up | 76 to 80 | A true macro again (the ball is about two screens tall). The last step to 60 is not taken so that the ball's limb stays in frame; the title word stands top left where the ball is not |
| Explode 1 at "apart": panels 30 mm out, halves 60 mm apart | Panels at 0.7 (pole panels fully out, the equator row still seated), halves 144 mm apart | At 60 mm with every panel lifted the gap closes up and it reads as one burst ball, not two halves |
| Access: explode 1 to 0 | Panels return and the halves close to 13 mm with the core fully lit; the seam closes and the core goes dark on the way to the end | Gives the access beat its own frame, unlike Blitz and Draft, and the end a last motion |
| Orbit of 40 degrees per mode | The camera goes to the left of the ball for Blitz and to the right and above for Draft (91 degrees between the two); the ball also turns about its own axis, 14 degrees during each rest | Each mode's half faces the viewer in its own beat |
| Landscape: split axis horizontal, Blitz left | Diagonal, Blitz upper right, Draft lower left | The ball prototype's tilt and "the one frame" are diagonal; kept so the hero, the hold and the story share one axis |
| Callouts in two columns, each with a leader line | One icon with three notes per beat, lower right, no leader lines | The lines crossed the title word and the ball; the icon now stands directly in front of its ball |
| Title word behind the ball, refracted by the glass | Title word in front of everything, never overlapping the ball at rest | The owner could not read the whole word: letters were hidden by the ball and dimmed by the wash. Legibility wins |
| Camera fit 260 for Blitz and Draft | 560, the ball in the upper right, above the cards | The cards and packs are the subject of those beats and need the room |
| Blitz and Draft show the ball fully torn down | Panels back on, halves 87 mm (Blitz) and 90 mm (Draft) apart, core lit, each seen from its own side | Compact enough to be drawn larger without covering the cards; the two angles tell the beats apart |
| Hold: release closes it | Same, and the seam cracks 10% while the ring fills | Feedback during the 900 ms |
| Keyboard: Space on the focused canvas | A real button under the ball takes Space or Enter | A canvas is a poor focus target for screen readers |
| Hero and end both carry the gold button | Outlined "Connect wallet" in the words; the one gold button is in the bar | One gold button per view, as in the approved mockup |
| Blueprint toggle, sound, tilt on phones | Not built | Out of scope for this pass (sound was asked to stay off) |
| Three quality tiers chosen by device class | Seven levels chosen by timing frames, down and back up, without waiting for the graphics card | No device sniffing; the page measures what it actually gets |
| Rain, lanterns, wet ground, bokeh | Dropped by the owner | The video they came from is no longer a reference |
| Reduced motion uses pre-captured stills | The live canvas held still per beat | Same result on screen. The pre-captured stills are used when there is no WebGL |
| Devnet banner, glass nav "once scrolled" | Nav is always glass; no banner | Prototype of the motion, not the chrome |

## Known weak points

- **The owner has seen it on a real GPU once (a Mac); nothing since has been.** His report (a
  soft ball, lag between beats) led to this round, but the fixes were again only checked in
  headless Chromium on software WebGL. What is measured: draw calls, triangles, the page's own
  layout and style work, and that the stills are unchanged. What is reasoned, not measured: the
  frame time on a real graphics card at each level, and so the 18, 30 and 7 ms limits. The
  `?stats=1` readout exists so that he can read the real numbers.
- **The GPU timer is unproven.** Headless Chromium on software WebGL offers
  `EXT_disjoint_timer_query_webgl2` but answers only the first few frames (one to four in
  some runs, none in others) and then stops; the page noticed each time and fell back to
  frame gaps by itself, which is the path every browser check here then used. Whether the timer
  answers reliably in Chrome on the owner's Mac is not known: the `timing` line of `?stats=1`
  says which method is in use. Frame gaps are also weaker in headless Chromium than they
  should be in a real browser: with no real screen to wait for, a 250 ms frame showed as
  16.7 ms gaps with a one-second pause every few frames, which is why a fifth of the frames
  being very late counts as slow. The decisions themselves were tested with simulated frame
  times, not real ones.
- **The lag may not be all gone.** The ball's own cost on a 2x screen is two full passes over
  the scene at 4x multisampling plus the glass, and that is unchanged at level 0; the page now
  steps to cheaper effects by itself if that is too much. Two things outside the ball were
  seen in the code and not changed here (they belong to `home.css` and `icons.js`): the cards
  and packs carry CSS `filter: drop-shadow(...) brightness(...)` that changes while their
  icons play, which is repainted every frame; and the bar's `backdrop-filter` blurs the canvas
  under it every time the ball is redrawn.
- **Blitz and Draft swing the camera a long way** (68 degrees into Blitz, 91 into Draft, 23
  into access), so the title word is crossed by the moving ball for a little longer between
  those beats than before.
- **The stills are out of date for three beats.** `poster/beat-4.jpg`, `beat-5.jpg` and
  `beat-6.jpg` (no WebGL, and the phone layout) still show the old Blitz, Draft and access
  poses. `node capture.js poster` remakes them, but the phone layout places each still by
  where the ball is in the picture (`--fx`, `--fy` in `home.css`), so the two go together.
- **The quality levels 1 to 5 have not been looked at one by one** on a 2x screen, only `high`,
  `low` (in `shots/quality-low-hero.png`) and `min`.
- **The card glint is a remake, not the video.** Its path, timing, warmth, rays and sparkles
  match the pack video in stills (`shots/blitz-card-glint-strip.png`), but the card's stripe is
  much thinner than the pack's, so the lit stretch of stripe is a line where the pack's is a
  broad band, and the video's slight shimmer of the rays is not there. It has only been seen
  as stills and as numbers on the software renderer, never at speed.
- **The glint passes behind the player tokens**, so it is hidden for a moment as it crosses the
  captain and the lower-left player (its halo shows around them). On the pack nothing is in
  its way.
- **The kickoff bar is short** (it stops before the stripe) and the header is a little smaller
  than before, to keep every word clear of the stripe.
- **The cards' content is still flat SVG** on photographed-looking artwork: the tokens do not
  pick up the card's light.
- **The cards do not show "at least one player from each club".** The three tokens are not
  marked home or away; at this size a mark was unreadable.
- **The ball still passes behind the top edge of the cards and packs** (its lowest part, most
  on Blitz, where the lower half stands behind the third card). It is not hidden, but it is not
  fully clear either.
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
- The phone view is a layout of its own but a still one: no 3D, no title words, no hold; the
  icons rest on their last frame.

## Files

- `index.html`, `home.css`, `home.js`: the page
- `icons.js`: the Blitz fixture cards and their hover glint, the Draft packs, and the hover they share
- `art/`: the Draft pack artwork and its hover video, and the Blitz card artwork `card.png` (see above)
- `poster/`: `beat-1.jpg` to `beat-6.jpg`, the canvas alone at 2400x1080: the load poster and the
  no-WebGL stills
- `capture.js`: stills, posters and the video through Playwright and ffmpeg
- `shots/`: `beat-1-hero.png` to `beat-7-end.png`, `hold-mid.png`, `hold-open.png`,
  `blitz-step-1.png` to `-4`, `draft-step-1.png` to `-4` (1440x900); the same seventeen with
  `-1920` (1920x1080); `beat-1-hero`, `beat-2-full-time`, `beat-4-blitz` and `beat-5-draft` with
  `-1512x860` and `-1728x1000`; `blitz-card-hover.png`, `blitz-card-glint-strip.png`, `draft-pack-hover.png`;
  `no-webgl-blitz.png`, `quality-low-hero.png`; `dpr2-hero.png`, `dpr2-close-up.png` (a 2x screen,
  pixel for pixel), `sharpness-dpr2-hero.png`, `sharpness-dpr2-close-up.png` (the old stepped-down
  level, the old `high` and the new `high`, side by side), `stats-readout.png`; `scroll.mp4`
