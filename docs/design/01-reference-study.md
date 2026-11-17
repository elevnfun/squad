# 01 Reference study: rive.app and elevn.fun

Studied 2026-11-17 with headless Chromium at 1440x900 and 390x844, scrolled in steps with a
screenshot per step, plus DOM and computed-CSS dumps. Screenshots and scripts sit in the session
scratchpad (`refs/`), not in the repo. Nothing from rive.app is copied here beyond descriptions.

## 1. rive.app: the home page, section by section

Built in Framer, with the Rive runtime (canvas and WebGL2) for about 30 live animations. The page
is about 20,200 px tall at desktop. No scroll-snap, no smooth-scroll library, no GSAP.

| # | Section | What it shows | How it enters | Hand-over to the next |
|---|---|---|---|---|
| 1 | Hero | A full-bleed product video (a 9-item showcase, "01 / 09 Now playing"), headline bottom left, case caption bottom right, a prompt box | On load. The 9 videos are stacked and crossfade. A 9-segment progress bar shows which one is playing | The video fades to black at the bottom. The headline and prompt box sit on top of that fade, so text overlaps image |
| 2 | How to get started | 5 numbered steps | A band of slightly lighter black starts here: a hard edge | **Pinned stage**: the left column (heading, buttons, step list 01–05) sticks at `top:100px` for about 2,450 px while the right column scrolls through the steps. The current step brightens from 40% to 100% white |
| 3 | Editor | A large editor screenshot, 1200 px wide | Back to pure black. It scrolls normally, with no scaling | No heading between this and the next section: the same black ground carries on into the tiles, so the two read as one |
| 4 | Feature tiles | 3-column grid of about 24 small tiles, each a looping live animation with a label and a line of text | Tiles fade in as they arrive | Ends on black, and the next band begins |
| 5–9 | CLI, AnimaScript, Figma to Rive, "What you design is what ships", Rive or HTML | Each one: a heading block, then one big visual (code and preview, a live code editor, before and after with an arrow, a hub-and-spoke diagram of one file feeding many devices, a tick table) | A band edge, with the ground switching between `#000` and about `#0E0E0E` | The same header layout every time, so the change of ground marks a new chapter and the layout says "same story" |
| 10 | Why teams choose | 4 proof tiles (numbers 0% / $0 / MIT, a stack diagram) | Black band | Grey band |
| 11 | In production | A logo row, then a 3-column wall of quotes | Grey band | The newsletter row, then the footer on black |

## 2. Why the sections feel connected

1. **One header pattern, repeated.** Every chapter opens the same way: a small capital eyebrow and
   a heavy capital heading in the left half; a hairline rule, one paragraph and small outlined
   buttons in the right half; one large visual below at full content width. Once you have read
   one chapter you know how to read the next. Evidence: identical layout on 8 of 11 sections.
2. **The ground colour marks the chapters.** Two near-blacks alternate with hard edges, and there
   are no gradients between sections. Content changes; the frame does not.
3. **One pinned moment, not many.** Only one sticky element on the whole page (the step list).
   Pinning is kept for the one place where there is a real sequence.
4. **Shared state inside a section.** In the hero, the active showcase item drives the video, the
   caption and the text of the prompt box together. One control, three surfaces.
5. **Overlap at the joins.** Text sits over the faded lower edge of the hero video, and the editor
   image runs straight into the tile grid with no gap or heading.
6. **Colour is rare.** White at set opacity steps (100, 82, 50, 40%) on black. The only colour in
   the frame is a slowly rotating rainbow edge on the prompt boxes (6 s, linear) and the product
   imagery itself.
7. **Motion lives inside the frames, not in the layout.** The tiles and diagrams animate; the page
   structure never moves, scales or parallaxes.

## 3. Motion and layout facts

| Item | Value seen |
|---|---|
| Section reveals | Opacity, 0.6–0.9 s `ease`, triggered once on entering the screen (about 65 elements start at 0). Not tied to scroll position |
| The one long move | transform 1.2 s `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| Hover | colour, border, background 0.15–0.25 s `ease`; menus 0.12 s |
| Loops | rainbow edge 6 s linear; tile animations loop for as long as they are on screen (a gauge read 94 at desktop and 82 on the phone) |
| Scroll-linked | Only the step list's active state, which follows scroll position. Nothing is scrubbed |
| Still | The nav, headings, the grid, the band edges |
| Grid | 1200 px content width, 120 px side margins at 1440; header split 50/50; tiles 3 columns about 377 px wide, gap about 20 px |
| Type | Orbitron 900 capitals (hero 48 px, sections 34 px); Inter 14–16 px body, 11–12 px capital labels with about 0.08em tracking; PragmataPro mono 11–13 px for buttons, code and meta |
| Spacing | Large and even: about 150–200 px from a band edge to its heading |
| Nav | 64 px, fixed, black, always shown. Logo, 5 capital 12 px links with dropdowns, Docs, one white filled "Get started" |

Phone (kept short, since the desktop site gets the main focus): the nav becomes the logo,
Get started and a menu icon. Everything goes to one column, the pinned step list is dropped and
the steps stack in order. It simply works; nothing on the phone layout needs copying.

## 4. elevn.fun today

The structure: a full-screen opening gate (gold grid-pulse behind a large "elevn.", a devnet
status pill, "Scroll"), then home slides with mandatory scroll-snap: hero (headline and an example
eleven on a tilted pitch, two buttons), Pick your league (fan of five league cards and the glass
"This gameweek" board with a countdown), Four steps, Where the prize money comes from (60/20/10/10
bar with count-up), footer. There is a test-season banner fixed at the bottom, a rail of short
lines on the right edge, and the gold SideRays light.

**Carry over:** the night palette with trophy gold as the only colour; the gold dot; the glass
board with a live countdown (it fits a Blitz kickoff lock); the right-edge progress rail (a
natural marker for the scroll story); Sora with tabular figures; the count-up bar; the test banner.

**Leave behind:** the opening gate (the ball hero replaces it); mandatory scroll-snap (it fights
a scrubbed scroll timeline); the league picker and the five league cards, two of them "coming
soon"; the example eleven and the four Season steps; the top-3 50/30/20 copy (now top 5);
Leagues ▾ in the nav. Defect: on a phone, mid-scroll, the nav sits transparent over the pitch
and "Sign in" overlaps the player cards.

## 5. For elevn: take and leave

**Take:**
- One header pattern for every chapter after the 3D story, so the Today, Ranks and info sections
  feel like one site.
- Alternating near-black bands with hard edges to mark chapters. Keep gold for actions only.
- Exactly one pinned stage: the ball canvas. The blueprint's five scroll beats fill the role that
  rive.app's pinned step list plays, with the beat list as a lit rail.
- Shared state: on Today, choosing a fixture lights the squad card, the lock countdown and the
  leaderboard row together.
- Motion inside cards (the banked moment, live points) while the frame stays still. Short
  triggered fades of 0.6–0.9 s on the app tabs.
- A fixed nav that is always shown, and a phone layout that drops the pinned stage rather than
  squeezing it.

**Leave:**
- Wall-to-wall video in the hero (the brief asks for live code-built 3D, about 320 kB, no
  footage).
- Orbitron and the mono-capital button style; elevn keeps Sora and Barlow Condensed.
- The rainbow edge (it competes with gold) and the 24-tile feature wall (too much for a
  two-mode game).
- Observer-triggered reveals for the scroll story's words. The brief says to drive those from
  scroll position; rive.app's fades are fine only for the app tabs.

## 6. What I could not verify

- The hero carousel's timing: no advance was seen in 14 s of watching, yet the first visit opened
  on a different item. It may advance when a video ends, or start on a random item.
- All motion inside the Rive canvases was seen only as stills, through a headless browser.
  Durations come from computed CSS, not from watching.
- Hover and menu states, and touch behaviour on a real phone.
- Whether reveals use Framer springs on top of the CSS values listed.
- rea and camofox were not needed; plain Playwright loaded both sites.
