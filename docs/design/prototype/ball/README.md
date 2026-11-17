# Match ball: look prototype

A standalone three.js build of the home page's hero object, for judging how it looks. This pass
is the object, its materials and its lighting, shown still and on a slow turntable. There is no
scroll story, no title cards, no sound and no page layout here.

Everything is made in code at start-up: no model files, no images, no HDRI, no Blender.

## Run it

```
cd docs/design/prototype/ball
npm install
python3 -m http.server 8771
```

Open `http://127.0.0.1:8771/`. Drag turns the ball; moving the mouse turns the studio lights
(12 degrees of yaw, 6 of pitch). The pill at lower right switches Steel and Glass and has two
sliders, Open and Explode. With `prefers-reduced-motion` the ball holds still and redraws only
when something changes.

URL parameters, for capturing a still of any state:

| Parameter | Values | Meaning |
|---|---|---|
| `variant` | `steel`, `glass` | Material set |
| `split` | 0 to 1 | Halves apart, 60 mm at 1 |
| `explode` | 0 to 1 | Panels lifted along their normals, pole first |
| `turn` | degrees | Turntable angle about the ball's own axis |
| `view` | `hero`, `three-quarter`, `macro` | Camera, framed by size in mm |
| `still` | `1` | No turntable; one frame, fixed grain |
| `ui` | `0` | Hide the pill |
| `studio` | degrees | Studio yaw |
| `dpr` | number | Force the pixel ratio |

`window.__ballReady` becomes `true` after the first full frame. `window.ball` is the engine.

To redo the captures (needs the server above, Playwright and ffmpeg):

```
node capture.js stills        # shots/<variant>-<state>.png, 1600x900
node capture.js turntable     # shots/turntable-<variant>.mp4, 1280x720, 24 fps, 6 s
```

The turntable sweeps 144 degrees in 6 seconds. The closed ball repeats every 72 degrees about its
axis, so the clip loops without a jump.

## Engine API (`ball.js`)

```js
import { BallEngine, SPEC } from './ball.js';
const ball = new BallEngine(canvas, { variant, view, still, reducedMotion, pixelRatio });
ball.setSplit(t)        // 0 closed to 1 open; each half travels 30 mm, core stays put
ball.setExplode(t)      // 0 to 1; every panel lifts along its normal, pole first, equator last
ball.setTurn(radians)   // about the ball's own tilted axis
ball.setVariant(name)   // 'steel' | 'glass'
ball.setView(name)      // 'hero' | 'three-quarter' | 'macro'
ball.setStudio(yaw, pitch, immediate)   // radians; eased unless immediate
ball.render()           // draw one frame now
ball.start() / ball.stop()              // the frame loop (turntable, easing, drag)
ball.stats()            // draw calls and triangles
ball.state              // { split, explode, turn, variant, view }
```

All setters return the engine, so they chain. Scene graph, for the animation step:
`root` (pointer drag) > `tilt` (fixed tilt) > `spin` (`setTurn`) > `halves.blitz`,
`halves.draft`, `coreGroup`. `ball.panels` lists the 32 panels with their group, normal, half
and order. Sizes are in `SPEC`, the art direction (lights, bloom, grain, glow, tilt) is in `LOOK`,
cameras are in `VIEWS`.

## What is in it

- 32 panels, each its own curved mesh: the face polygon is inset 0.75 mm for a 1.5 mm seam,
  corners rounded, swept through a rounded polished bevel, a radial side wall and a back face,
  and every vertex is pushed onto its sphere. 16 panels per half (6 pentagons, 10 hexagons),
  separated by the zigzag equator.
- Two materials per part: a satin face and a polished edge.
- Each half has a liner with a flat rim, gold studs on the rim (3 on Blitz, 5 on Draft) and a
  sliding tube; the gold core sits on a rod between them.
- Studio: a softbox, three strips, a low fill and a wet ground with a ripple normal map, rendered
  once into a 1024 px PMREM environment. No direct lights except the core's own glow.
- Post: 4x MSAA on a half-float target, bloom, ACES, vignette, grain.
- **Steel**: sunray-brushed steel hexagons (roughness and bump streaks plus an anisotropy
  direction map, both made in code), smoked-glass pentagons, dark liner.
- **Glass**: every panel is a polished steel bezel with a glass pane set 1 mm into it; hexagon
  panes are near-clear, pentagon panes are smoked, so the football pattern survives. The liner
  dome is left out, so the core, the rod and the two rim rings read through the ball.

## Where this departs from the spec (`03-motion-and-hero.md`)

| Spec | Here | Why |
|---|---|---|
| One instanced mesh for the hexagons | 32 separate meshes sharing two geometries | The brief for this pass asked for a mesh per panel; instancing is a later saving |
| Bevel 0.6 mm | 0.9 mm | 0.6 is about 1.6 px at hero size and flickers; 0.9 holds a clean line |
| Panel lift 6 mm | 30 mm (pentagons 39) | 6 mm does not read as an exploded view; `SPEC.explodeLift` |
| Shells travel 90 mm each | 30 mm each (60 apart) | The brief and "the one frame" both say 60. At 60 the core is only seen from within about 15 degrees of side-on, so the ball's tilt and the three-quarter camera were set for that |
| Steel face roughness 0.38 | 0.34 | A little more shape in the reflections |
| Pentagon glass ior 1.5 | 1.8 | At 1.5 the glass reflects 4% and the softbox barely shows in it; 1.8 gives the hard studio reflection of the reference |
| Liner `#131519`, metalness 0.9 | `#3A3E46`, metalness 0.5, roughness 0.42 | A near-black metal showed nothing of the gold light in the gap |
| Liner is a plain hemisphere | Hemisphere plus a flat rim 86 to 103 mm | The studs need a face that is visible when the ball is open |
| Three light panels | Five | A second back strip so both sides of the silhouette get a rim, and a dim low fill |
| Wet ground as a reflecting floor | In the environment only | The reference floats on black; the ground shows as ripples in the lower reflections. No ground reflection pass, rain or bokeh |
| Glass lit by the environment only | Kept: the core's point light is removed from every glass material in the shader | Avoids the hot spot on glass |
| Bloom threshold 1.0, strength 0.35 | Threshold 2.6, strength 0.18 | At 1.0 every lit steel panel bloomed and the ball washed out |
| Vignette to black | Vignette, then the floor is lifted to `#0A0B0D` | The canvas edge matches the page colour exactly (measured 10, 11, 13 in the corner) |
| Not in the spec | A soft pool of light behind the ball | The contrast rule: the black pentagons need something lighter behind them |
| Not in the spec | Rod, tubes and collars holding the core | Something has to hold it, and the glass variant shows it |

## Faked or unfinished

- The gold light in the gap is one point light with no shadows. Environment lighting has no
  occlusion either, so the inside of the ball is lit as if the panels were not in the way.
- Glass does not see other glass: three.js draws transmissive parts over a picture of the
  opaque parts only, so through a near pane you see the far bezels and the core but not the far
  panes. Refraction is the screen-space approximation, not ray traced.
- The brushed finish is one 1024 px texture stretched over each panel. Very close up the streaks
  go soft.
- The wet ground reflects the studio as if it were infinitely far away.
- No depth of field, no ground, no rain, no labels, no blueprint mode, no sound, no scroll.
- No quality tiers, no adaptive resolution, no context-loss handling, no poster or fallback stills.
- The phone view is untested. Touch drag works through pointer events, tilt is not wired.
- Geometry is not instanced or merged.

## Measured (`renderer.info`, 1600x900, pixel ratio 1)

| | Steel | Glass |
|---|---|---|
| Meshes visible | 51 | 83 |
| Draw calls, the scene once | 85 | 149 |
| Triangles, the scene once | 139,538 | 155,042 |
| Draw calls per frame, all passes | 161 | 249 |
| Triangles per frame, all passes | 250,531 | 234,499 |
| Shader programs | 18 | 17 |

"All passes" includes the extra pass three.js makes for transmission (the opaque parts are drawn
twice) and the bloom and output passes. These were measured in headless Chromium on software
WebGL, which says nothing about frame rate. Frame rate on real hardware has not been measured.

## Files

- `index.html`: the page, the URL parameters and the pill
- `ball.js`: geometry, textures, studio, materials and the engine class
- `capture.js`: stills and turntables through Playwright and ffmpeg
- `shots/`: eight stills and two turntables
