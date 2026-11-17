# elevn 2.0 design brief (section 2 inputs)

Collected from the owner on 2026-11-14 to 2026-11-17. This is the input to the design section.
Nothing here is designed or built yet. The rules of the product are in
`docs/blueprint/BLUEPRINT.md`; the current look is in `web/DESIGN.md`.

The owner's note: the later material is as important as the earlier material.

## 1. Tools and what each is for

| Tool | Use |
|---|---|
| Higgsfield MCP | Design assets and video, code-based: no generative AI models for the site's visuals |
| Higgsfield Katana | Video designs (reference-based video remixes) |
| ECC (everything-claude-code) skills | Website design and building, and delegating the design work to a team of agents |
| github.com/jo-inc/camofox-browser | Any scraping task (an anti-detection browser server with a REST API) |
| github.com/morluto/rea | Any reverse-engineering task (how a reference site's feature works) |

ECC is not installed as a plugin in the cloud session. A copy of the repo is read as written
instructions: skills `blueprint`, `frontend-design-direction`, `design-system`, `taste`,
`taste-application`, `motion-foundations`, `motion-patterns`, `motion-advanced`,
`frontend-patterns`, `frontend-a11y`, `loop-design-check`, `team-builder`; commands
`multi-frontend`, `multi-workflow`; agent definitions such as `architect`, `planner`,
`a11y-architect`, `performance-optimizer`, `react-reviewer`, `e2e-runner`.

Owner's limits (2026-11-17): no Blender anywhere, hosted or local; it overcomplicates the
project. From the object-build video only the motion graphics are wanted, not the 3D modelling
pipeline. The generative-model ban is lifted for Katana videos only. Every Higgsfield credit
needs the owner's yes before it is spent.

## 2. References

- **elevn.fun**: the live site and the base to redesign from.
- **rive.app**: motion graphics, page layout, and how the sections connect into each other.
- **3D website guide 1** (designedby.russ, 16 pages): one hero object, the scrollbar as a
  timeline, words over the canvas. Summarised in the blueprint, section 6.
- **3D website guide 2** (uijonah, "Build 3D websites that run live", 14 pages): section 3 below.
- **Video: Tokyo** (15 s). Made from the prompt "Make me a code-based video about Tokyo. Use
  Higgsfield MCP skills, use no generative AI models." The owner likes its general style and art:
  a rainy night alley, paper lanterns and neon signs, wet ground with long reflections, shallow
  depth of field, slow camera moves, one small title at the end. This is what "code based, no AI
  model generation" means.
- **Video: the 3D object build** (37 s). The owner wants the motion graphics at the end
  replicated in the future: a chrome object on black with a soft vignette, hard studio
  reflections, fast macro cuts with motion blur, one-word title cards, outlined display type,
  blueprint callouts with leader lines, a thermal-camera pass, parts shown apart and reassembled.
  Only the treatment is taken; elevn's object is the match ball.

## 3. Guide 2 in short (live 3D, no footage)

Four layers: geometry built from code, physical materials, a studio inside the scene, and the
scroll as the director. A live site reacts to cursor, tilt, scroll and touch, and ships in about
320 kB with no video files.

1. One object, one verb: the single thing the visitor does to it (hold, twist, open, pull apart,
   tilt to light). List every part with its real size in millimetres. Decide the one frame for
   the thumbnail. Five beats: hero, close-up, apart, around, back together.
2. One fixed full-screen canvas behind, normal HTML sections in front. Next.js with plain
   three.js and one engine class. Use `overflow-x: clip`, never `hidden`.
3. Build every part from code: 2D shapes, melted together, traced, extruded, with a 0.05 mm
   polished bevel.
4. MeshPhysicalMaterial: two materials per part (satin face, polished edge); brushed finishes
   from direction textures made at start-up; iridescence, clearcoat and IOR where they fit.
5. Light like a photographer: a small studio of panels baked into the environment (one off-axis
   softbox, two strip lights); the cursor rotates the studio. Glass reflects the studio only.
6. A camera script: cues pinned to page sections, blended and eased every frame. Frame by size
   ("fit 52 mm on screen"), not distance, so one cue works on a phone and a monitor.
7. The exploded view: each part has a lift and an order. Labels in two clean columns with
   leader lines. A blueprint toggle that swaps surfaces for edges.
8. One clock drives every moving part. Sound made with Web Audio, no audio files. A hold-to
   interaction with a progress ring, which also unlocks audio and phone tilt. Slow motion by
   dropping the time scale in the close-up.
9. Post chain: MSAA HDR, bloom on glints only, ACES, grain. Pixel ratio capped at 1.75 on
   phones; below 40 fps drop resolution, then bloom. Compile shaders behind the loader.

Five bugs to avoid: sticky sections that stop sticking (`overflow-x: clip`); round parts inside
out (draw lathe profiles counter-clockwise); a hot spot on glass (environment only); text reveals
that miss (drive them from scroll position, not observers); screenshots that lie (headless
browsers render 3D at about 1 fps, so judge motion on a real phone).

## 4. How the design section runs

Delegated to a small team of agents, each briefed with the matching ECC skill:

1. Reference study: elevn.fun and rive.app, screenshots and notes on layout, motion and how
   sections connect.
2. Design direction: the updated design system on top of `web/DESIGN.md`.
3. Motion and the hero object: the object's part list, the verb, the beats and the cue list.
4. Screens: Today, the Blitz pick flow, the banked card, the Draft pack opening, Ranks,
   Shootout, the side menu.
5. Higgsfield: code-based 3D and video explorations.
6. Review: accessibility and phone performance.

The owner sees the design and approves or changes it before anything is built.

## 5. Owner's design decisions (2026-11-17)

On the motion and hero spec (`docs/design/03-motion-and-hero.md`):

- The ball is steel and smoked glass with a gold core, not white and gold.
- three.js is added to the site for the live 3D.
- The wording is "Play free", not "No entry fee".
- All seven changes to `web/DESIGN.md` are approved:
  1. Cursor or phone tilt may turn the studio light, on the home canvas only.
  2. The home page is one continuous scroll, not snapping slides.
  3. The intro video is retired.
  4. SideRays, grid-pulse and the floodlight pool are off on the home page.
  5. Barlow Condensed is allowed for the one-word title cards.
  6. Sound is allowed in the hero only, off until asked for.
  7. Durations become named tokens.

