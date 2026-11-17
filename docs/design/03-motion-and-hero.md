# 03. Motion and the hero object

Written 2026-11-17. A spec only: nothing here is built. Sizes are calculated, not measured; the
bundle and frame-rate figures are estimates to check on a real phone. The rive.app study
(`01-reference-study.md`) did not exist when this was written, so section 7 does not use it.

**Three decisions**

- **Object:** the match ball, as a machined object: 32 steel and glass panels over two shells,
  with a gold core. It splits along its zigzag equator into exactly two halves, Blitz and Draft.
  Weighed and dropped: a trophy (metal, but one piece, and it promises a prize rather than a
  game); a referee's whistle (fits "full time", but three parts and no way to become two modes);
  a referee's watch (many parts, but every 3D site has a watch).
- **Verb:** open. Press and hold the ball and it parts to show the gold core.
- **The one frame:** three-quarter view, halves 60 mm apart on a diagonal, the core lit in the
  gap, on night black, "elevn." small at lower left.

## 1. The object

One scene unit is 1 mm. The ball is a size 5: 220 mm across.

| Part | Count | Size (mm) | Moves | Built from |
|---|---|---|---|---|
| Hex panel | 20 | 44.4 edge, 76.9 across flats, 6 thick | Lifts 6 radially, in order from pole to equator | One 2D hexagon, inset 0.75 for the seam, extruded, vertices pushed onto the 110 radius; one instanced mesh |
| Pentagon window | 12 | 44.4 edge, 68.3 high, 6 thick | Lifts with its neighbours | Same route from a pentagon |
| Shell (liner) | 2 | Hemisphere, 103 radius, 2 thick | Travels 90 along the axis, one each way | Lathe profile, drawn counter-clockwise |
| Core | 1 | Sphere, 64 across | Still; turns slowly | Sphere, 48 segments |
| Studs | 3 + 5 | 10 across, 2 proud | Ride inside their shell | Lathe; 3 inside the Blitz shell, 5 inside the Draft shell |

Each half holds 16 panels (6 pentagons, 10 hexagons). Bevel: 0.6 mm polished. The guide's
0.05 mm is for watch-sized objects and would not catch light at this size. Seam: 1.5 mm.

| Part | Face | Edge |
|---|---|---|
| Hex panel | color `#C9CCD1`, metalness 1, roughness 0.38, anisotropy 0.6 (brushed outward from the panel centre; direction texture made at start-up) | color `#E8EAED`, metalness 1, roughness 0.06 |
| Pentagon | color `#0E1014`, metalness 0, roughness 0.05, transmission 0.9, thickness 6, ior 1.5, attenuationColor `#1B1E23`, attenuationDistance 12; lit by the environment only | Same, roughness 0.25 (ground glass) |
| Shell | color `#131519`, metalness 0.9, roughness 0.55 | Rim: roughness 0.1 |
| Core, studs | color `#F2C14E`, metalness 1, roughness 0.18, clearcoat 0.6, clearcoatRoughness 0.03, emissive `#F2C14E` at 0.4 | None |

The gold core is the full stop in "elevn.": gold still appears once.

## 2. The studio

Baked into the environment map at start-up (PMREM from a small scene, no HDR file).

| Panel | Size (mm) | Position (x, y, z) | Job |
|---|---|---|---|
| Softbox (key) | 600 × 400 | 350, 400, 300 | The main highlight, upper right |
| Strip, left | 80 × 900 | -420, 100, 150 | Edge line on the steel |
| Strip, back | 80 × 900 | 300, 150, -400 | Rim, separates ball from black |
| Wet ground | 3000 × 3000 | y = -125 | Roughness 0.12, ripple normal map made in code; long reflections |

The cursor turns the studio, not the ball: 12° of yaw and 6° of pitch at most, eased at 0.06 per
frame. On a phone, tilt does the same once the hold has granted permission; before that the
light drifts 4° over 8 seconds.

## 3. The scroll story

The canvas is fixed; seven HTML sections scroll over it. Camera framing is the width that fits
the short side of the screen. On landscape the split axis is horizontal (Blitz left, Draft
right); on portrait it is vertical.

| Scroll | Section | Fit (mm) | Explode | Time | Title card | Words | The one motion |
|---|---|---|---|---|---|---|---|
| 0% | Hero | 300 | 0 | 1 | ELEVN | elevn. Fantasy football with a result at full time. [Connect wallet] | Reveal: the ball comes up out of the poster, turning 6° a second |
| 20% | Close-up | 60 | 0.08 | 0.25 | FULL TIME | A week is too long to wait. Your points are banked at the final whistle. | Slow push along one seam, gold showing through a window |
| 40% | Apart | 460 | 1 | 1 | TWO | Two ways to play. | Teardown: panels lift, the halves part |
| 56% | Blitz | 260 | 1 | 1 | BLITZ | Matchday Blitz. Three squads of three, on any three fixtures. A prize every matchday. | Orbit, first 40° |
| 72% | Draft | 260 | 1 | 1 | DRAFT | Draft. Open five packs of three and build a five-a-side. Paid weekly. | Orbit, next 40° |
| 88% | Access | 300 | 1 to 0 | 1 | HOLD | Hold 150,000 $ELEVN to play Blitz. 300,000 adds Draft. Play free. | The teardown in reverse |
| 100% | End | 300 | 0 | 1 | ELEVN | [Connect wallet] | None: the hero frame again |

Cues blend and ease every frame from scroll position, never from observers. Explode 0 to 0.35
lifts the panels; 0.35 to 1 parts the halves.

## 4. Three moments, and what stays still

The reveal, the teardown (and its reverse), the labelled orbit. Touch is the visitor's, not
scripted. The close-up is a held frame. Between cues the ball only turns. Words fade and rise
16 px once, driven by scroll. Nothing else on the home page animates: no side rays, no counters.

## 5. Labels, blueprint, hold, sound

- **Title cards:** one word in outlined Barlow Condensed 700 capitals (1 px warm white stroke, no
  fill), drawn to a texture and placed behind the ball. Decoration only; the real copy is HTML.
- **Labels** (beats 4 and 5): HTML, Board label style, 1 px leader lines at 28% white, two
  columns; three per half. Blitz: "3 squads × 3 players", "Locks at kickoff", "Daily prize, top
  5". Draft: "5 packs × 3 players", "Five-a-side", "Weekly prize, top 5". On a phone, one column
  under the object.
- **Blueprint toggle:** a small button at the canvas corner (key B). Surfaces swap for edge
  lines over 400 ms, warm white at 60%, the core gold, with part callouts ("Ø 220 mm", "Hex
  panel × 20, 44 mm").
- **Hold to open:** press the ball; a gold ring fills in 900 ms; the halves part 60 mm. Release
  closes it in 350 ms. The first completed hold unlocks sound and asks for tilt. Keyboard: hold
  Space on the focused canvas.
- **Sound** (Web Audio, no files, off until a completed hold or a tap on the speaker button;
  the choice is remembered):

| Sound | When | Made from |
|---|---|---|
| Rise | During the hold | Sine, 110 to 220 Hz, gain follows the ring |
| Latch | Halves part or close | 30 ms filtered noise at 2.4 kHz plus an 80 Hz thump, 120 ms |
| Ticks | Panels lift | Sixteen 4 ms clicks, in panel order |
| Bell | Core first shown | Sines at 880 and 1320 Hz, 600 ms decay |

## 6. Rendering and fallbacks

- **Post chain:** MSAA HDR target, bloom on glints only (threshold 1.0, strength 0.35, half
  resolution), ACES, 3% grain, vignette 0.35.
- **Tiers:**

| Tier | Pixel ratio | Glass | Extras |
|---|---|---|---|
| Desktop | up to 2 | Transmission | MSAA 4, ground reflection pass, rain, bokeh discs |
| Phone | up to 1.75 | Opaque gloss (clearcoat 1) | MSAA 2, bloom, a baked reflection |
| Weak | 1 | Opaque gloss | No bloom, no rain |

- **Adaptive:** under 40 fps over 60 frames, drop pixel ratio by 0.25 to a floor of 1, then
  bloom, then rain. Under 24 fps for 3 seconds on the weak tier, switch to stills. Rendering
  stops off screen and in a hidden tab.
- **Phone framing:** object centred at 42% of the height, words in the lower 40% over a scrim.
  Desktop: object at 62% across, words on the left content edge.
- **Poster first:** a server-sent AVIF of the hero frame (60 kB target) is the first paint and
  the text is readable without JavaScript. three.js loads on the home page only, after first
  paint (about 170 kB gzipped, an estimate). Shaders compile behind the poster, which crossfades
  to the canvas in 400 ms. Posters are captured from the engine itself.
- **Fallback stills:** seven captures, one per beat, crossfaded by section. Used when WebGL 2 is
  missing, the context is lost twice, data saver is on, or the frame rate fails.
- **Reduced motion:** the stills, no scroll-linked camera, no tilt; "Open" becomes a tap that
  fades between two stills in 200 ms.
- **In-app browsers** (X, Telegram, and wallet browsers such as Phantom): start on the weak tier,
  measure 90 frames behind the poster, and stay on stills under 30 fps. Tilt is often refused
  there; dragging turns the studio instead.

## 7. Motion inside the product

2D only, no WebGL. Tokens: fast 180 ms, normal 350 ms, slow 600 ms; easing "smooth"
`cubic-bezier(0.22, 1, 0.36, 1)`. Transform and opacity only.

| Item | Trigger | Duration, easing | What moves | Reduced motion |
|---|---|---|---|---|
| Banked card | Squad goes from full time to banked | 1.2 s in all; smooth | Card rises 16 px and fades in (350); a gold seam line draws across its top (350); points count up (600); the rank line, then the "in the money" chip, fade in (180 each) | 200 ms fade, final numbers |
| Rank changes | Board update, at most every 5 s | 350, smooth | Visible rows slide to their new place; a row moving more than 5 places crossfades; the changed points turn green for 600 ms | Instant reorder, a "+6" chip for 2 s |
| Prize line | Your row crosses it | 600, smooth | The gold rule under 5th brightens once; "If the day ended now you'd win $X" counts to its new value | Text change only |
| Draft packs | Tap a pack; "Open all" skips | 900 a pack; split 180 sharp, cards 350 gentle spring, 80 ms apart | The pack splits along a seam (the hero's verb); three cards rise, budget, mid, top; the top card gets a gold edge. After five, the 15 settle by position (600). Shown once: later visits are still | Three cards fade in together, 200 ms |
| Tab change | Tap a tab | 180, snappy spring | The gold dot slides to the new tab; content crossfades | Instant |
| Shootout | Shot confirmed | Ball 300 to 450 (by power), ease-in; dive 350; result held 600 | Ball to its corner, keeper dives, the net flexes once, a score pip fills | Result frame fades in with "Goal" or "Saved" |

No confetti, shimmer, card flips or rarity glows. Packs stay plain on purpose: random packs with
prizes are under legal review, so no slot-machine suspense.

## 8. Carrying the two videos

- **Tokyo:** night, wet ground with long reflections, falling rain (instanced lines), soft
  out-of-focus floodlights (40 discs behind the ball), slow camera, one small title. The lantern
  is the gold core. Its pink and green neon is not taken; pitch green appears only as a dim
  reflection.
- **Chrome treatment:** steel on black with a vignette, hard studio reflections, the close-up,
  one-word outlined cards, blueprint callouts, apart and back together. The thermal pass and the
  fast cuts with motion blur go to the code-based promo video (`05-higgsfield-plan.md`), not the
  site: scroll is continuous, and thermal colours break the one-colour rule.

**Changes to `web/DESIGN.md` for the owner to approve**

1. "No tilt-on-hover or cursor effects" stays for the interface. Exception: on the home canvas
   the cursor or phone tilt turns the studio light. No element tilts.
2. Home stops being snapping slides with the tilted pitch. It becomes one continuous scroll over
   a fixed canvas; the right-edge rail stays as beat markers.
3. The intro video is retired. The hero reveal is the authored moment.
4. SideRays, grid-pulse and `.floodlit` are off on the home page (the studio is the light). They
   stay elsewhere.
5. Barlow Condensed is also allowed for the home title cards, outlined.
6. Sound is allowed in the home hero only, off until asked for.
7. Durations become the named tokens in section 7 (hover stays 150 ms, home arrivals 700 ms).

## 9. Risks and open questions

1. Most visitors may arrive in wallet, X or Telegram browsers and see the stills. Are the stills
   good enough to be the home page for them?
2. The blueprint said a white and gold ball. This is steel and smoked glass with a gold core, and
   phones get opaque windows. Approve the material change?
3. three.js is a new dependency, loaded on the home page only. Approve it?
4. Retiring the intro video and the home side rays (changes 3 and 4): agreed?
5. The pack opening is deliberately plain, and the last beat says "Play free" where the
   blueprint says "Play free". Which wording, and is plain right?
