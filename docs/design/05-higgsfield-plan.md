# 05. Higgsfield: routes, costs and a plan (research only)

> **Owner's decision, 2026-11-17: no Blender.** The explorations below that use the 3D scene
> builder or local Blender are dropped (ball look-development stills, the Tokyo-style night scene,
> the local turntable). What stays: the motion-graphics piece in Higgsfield's editor and the Katana
> promo, both fed with stills rendered from our own three.js ball.
>
> **Owner's decisions, 2026-11-17:** the Katana promo is postponed until the platform is fully ready (live rate checked: 7 credits per second at 720p; cap discussed: 200). The Tokyo video is not a reference. Draft pack artwork (0.25 credits per image) and one shared 4-second hover video (28 credits) were approved and generated; files are in `docs/design/prototype/home/art/`.

Written 2026-11-17 from Higgsfield's own instructions and model catalogue. Nothing was generated,
rendered, uploaded or created, and no credits were spent. Balance: 1,162.53 credits, Plus plan.

"Historic" prices below come from a price table bundled with the Katana workflow, dated
2026-10-08. That table says of itself that prices drift and must be re-quoted before use.

## 1. Routes

| Route | What it is | Generative? | Inputs | Outputs | Cost | Suits |
|---|---|---|---|---|---|---|
| 3D Jutsu (hosted scene builder) | A hosted Blender scene (bpy 5.2, headless) edited by Python, with revisions | Code-based | Python only. No network, no image textures, no own files; curated catalogue models only | PNG/JPEG/MP4 renders (8 per operation), GLB, .blend | Not stated anywhere | Look-development stills of the ball |
| `/use-blender` | The same idea on the owner's own computer with a local Blender | Code-based | A desktop with Blender; cannot be installed from this cloud session | .blend, renders at any quality | No credits mentioned (local machine) | Long or high-quality renders |
| `video-editing` (Higgsedit) | Motion graphics written as a JSX script: text, paths, masks, keyframes, a 2.5D camera, custom GLSL shaders | Code-based | Images, video, audio, fonts | MP4/MOV, PNG frames, an editable project | Runs in the sandbox; sandbox listed as 0 credits (historic) | Title cards, callouts, the thermal pass |
| Sandbox (`sandbox_exec`) | A short-lived Linux box with ffmpeg, Python, headless Chromium | Code-based | Anything fetched by URL | Files, which must be uploaded to keep | 0 credits (historic, "verified via transactions") | Assembly, frame stitching |
| `reel-effects` | Prebuilt HTML effect pages rendered in Chromium over a talking-head clip | Code-based, plus one paid matte step | A vertical clip of a person talking | MP4 | Matte 1 credit (historic); rest sandbox | Not us: no presenter |
| `shorts-studio` | HTML render engine for reels with an AI presenter | Generative (Seedance takes) | Topic or script | MP4, composition zip | Per-second video rates; total not stated | Not us |
| Katana | Reference-based video remix (section 3) | Generative | Reference video and subject images | MP4 | Per-second video rates | Promo video for X |
| Image/text to 3D (Meshy, Tripo, Hunyuan) | A GLB from a photo or prompt | Generative | Image or prompt | GLB | Not stated in the catalogue | Not for the site (AI model) |

Limits of the hosted scene builder that matter: each operation has about five minutes, and a
timed-out one saves nothing. Its own guide calls an MP4 "a stretch goal" and proves animation
with stills. Materials are procedural only. Area lights and procedural shaders do not reliably
survive GLB export.

## 2. The two reference videos

- **Tokyo (15 s).** Most likely a Blender scene built from Python: 3D Jutsu or `/use-blender`,
  with shots joined and the "TOKYO" title added in the sandbox or Higgsedit. The geometry,
  depth of field and reflections are consistent across cuts, which fits a render and not a
  video model. Fairly sure of the route (about 75%). Not sure whether it was hosted or local:
  15 seconds of rain and reflections is a lot for five-minute operations.
- **3D object build (37 s).** Three stages. The prompt says "generate assets in Higgsfield", so
  the reference images were probably generative. The object was then modelled in Blender (the
  editor screens look like real Blender, which points to `/use-blender` or screen-styled
  graphics). The chrome-on-black end section matches Higgsedit: title cards, outlined type,
  leader-line callouts, and a thermal look that a GLSL shader can do over 3D renders. About 60%
  sure. The part the owner wants, the end treatment, is code-based either way.

## 3. Katana in practice

- **Input:** a reference video (the owner's, or a published `/katana/<slug>` preset) plus
  subject images. With a brief and no reference it finds one itself on TikTok, Reels or Shorts.
- **Output:** a finished remix MP4: new scenes in the reference's rhythm, type and effects,
  never a shot-for-shot copy.
- **Models:** Seedance 2.5 for every new video scene; Soul Cinema or GPT Image stills for
  locations; optional Genjutsu motion transfer; code compositing, text and recorded sound
  effects in the sandbox.
- **Cost:** Seedance 2.5 historic rates are 3 / 7 / 12 credits per second at 480p / 720p /
  1080p, 4 seconds minimum. The workflow plans 2 to 2.5 generated seconds per second on screen.
  One measured 10.5-second edit cost 83 credits. A 15-second 720p promo is therefore roughly
  210 to 265 credits before retries, by the historic table. Treat it as needing a quote.
- **Free runs:** a preset run can be registered as free (`free_generation: true`,
  `use_free_gens: true`) only when the user explicitly asks. How many free runs this account
  has is not stated; finding out means calling `get_katana_config`, which registers a session.
- **Warning:** Katana's instructions tell the agent never to ask for credit approval and to
  run to delivery inside a cap it sets itself. That conflicts with the owner's rule. Any Katana
  run must start with a hard credit cap given by the owner.

## 4. What comes back to the Next.js site

Helps: a poster frame and the WebGL-fallback still (section 6 of the blueprint needs both), a
share image, look-development renders that fix the white, the gold and the lighting before
three.js work starts, a GLB to compare panel geometry against, and MP4s for X.

Does not help: the live 3D. The ball must be built again in three.js; the Blender materials
and lights will not transfer, and our own files cannot be imported into the hosted scene. The
HTML engines are tied to presenter clips. No textures come out, since the scene uses none.

## 5. Proposed explorations, in priority order

1. **Ball look-development (code-based).** Route: 3D Jutsu. Steps: `scene_builder_3d_create_project`;
   `run_python` to build the 32-panel ball, seams, white and gold materials and a night studio;
   render five stills matching the scroll story (whole, seam close-up, two halves, labelled
   orbit, return); `get_artifact`; `get_glb` and `get_blend`. Cost: unknown, needs confirming.
   Owner gets: five stills, a poster candidate, a GLB and a .blend.
2. **Chrome-on-black treatment (code-based).** Route: Higgsedit in the sandbox. Steps: upload
   the stills from 1; a JSX script with one-word cards (Pick. Lock. Banked.), outlined type,
   callouts and a thermal shader; render 10 to 15 s. Cost: 0 credits by the historic table, which lists sandbox
   runs and uploads as free. Owner gets: an MP4 and the editable project.
3. **Katana promo for X.** Reference: the end section of the object-build video. Subject: the
   stills from 1, so the ball itself stays code-made. Cost: about 210 to 265 credits at 720p
   (historic); needs a live quote and a cap. Owner gets: one 15 s MP4.
4. **Floodlit night scene in the Tokyo style (code-based).** Route: 3D Jutsu stills first, video
   only if stills pass. Cost: unknown. Owner gets: mood stills for the night background.
5. **Local Blender, if the owner has a desktop.** `/use-blender` for a full-quality turntable.
   No credits mentioned.

## 6. Approval needed, and open questions

Approval before anything runs: creating a 3D project; every sandbox run and upload; a non-submitting
price quote (`get_cost: true` on the generate tools); a credit cap for Katana; whether to use
free runs.

Could not answer without spending or writing state:
- Do scene builder operations and renders cost credits?
- How many Katana free runs does the account have, and what do they cover?
- Today's Seedance 2.5 price (the table is about six weeks old).
- Can the hosted builder render enough frames for a 10 to 15 s clip inside its time limit?
- Which Katana presets exist (the catalogue opens through a tool outside this pass).
