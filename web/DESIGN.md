# elevn design system

The design rules for elevn 2.0, rewritten 2026-11-17 with the owner's approval. This file is the
source of truth for how the site looks and moves. The product rules are in
`docs/blueprint/BLUEPRINT.md`; the working papers behind this file are in `docs/design/`
(`02-design-direction.md`, `03-motion-and-hero.md`, the mockups and the two prototypes). Where
any of them differs from this file, this file wins.

It describes the target, not the code in `web/` today: the current screens (Season, league pages,
the snapping home slides, the intro video) are what is being replaced. Contrast ratios are
calculated from the hex values (WCAG 2.1) and still have to be checked on rendered pages.
Method sources: impeccable 4.8 (pbakaus/impeccable@ac0966d) and tasteskill 2.5
(Leonxlnx/taste-skill@9b4bf93), read and applied by hand. None of their scripts are run.

## The subject

elevn is fantasy football for people who hold the $ELEVN token on Solana: crypto-native football
fans checking their squads around kickoff. There are two game modes, Matchday Blitz (the main
one) and Draft, plus Penalty Shootout as a side mini-game with no prize.

The site is designed for a desktop browser first. The phone view is adapted from the desktop
design and must work; it is never the starting point.

| Surface | Mode | Its job |
|---|---|---|
| Home (logged out) | Persuade | Say what elevn is in one scroll and get a wallet connected |
| Today, the Blitz pick flow, Draft, Ranks, Shootout, Chat | Operate | Pick players, see points and prizes, fast and scannable |
| News, How to play, FAQ, About, Roadmap | Read | Explain plainly |

Above all: nothing overcomplicated, nothing jumbled. One job per screen, one main action per view.

## The idea: a night match, in glass and steel

- **Palette: night match.** Near-black and warm white carry about 90% of every screen. Trophy gold
  is the only accent. Broadcast red appears only on LIVE. Green appears only on the Draft
  five-a-side board.
- **Material: glass and steel.** Panels are visible smoked glass with a steel rim; dense data sits
  on a dark, high-opacity fill inside the glass. The same two materials make the hero ball.
- **Light.** On the home page the only light is the studio inside the ball canvas. SideRays,
  grid-pulse and the floodlight pool (`.floodlit`) are off there. Product pages have two fixed,
  heavily blurred light pools behind the glass, each under 8% (one cool at the top left, one warm
  at the bottom right), and nothing that moves. See the defaults list for SideRays on info pages.

Not references, take nothing from them: the Tokyo test video (no rain, lanterns, wet ground,
bokeh or neon), the thermal-camera pass, fast cuts, rive.app's rainbow edge and mono buttons.

## What is built in code and what is generated

Everything on the site is built in code: the ball, the studio, the icons, the glass, the type.
No generative AI imagery, no model files, no HDRI, no Blender (hosted or local). Two exceptions,
both sanctioned by the owner, and no others:

1. **The Draft pack.** One shared foil pack design generated with Higgsfield, used for all five
   packs, with one shared hover video. The number 1 to 5 is drawn in code over the artwork.
   Files: `docs/design/prototype/home/art/pack.png`, `pack-hover.webm`, `pack-hover.mp4`.
2. **Katana**, for promo video only, off the site. Postponed until the platform is fully ready.

Every Higgsfield credit needs the owner's yes before it is spent.

## Colour

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--bg` | `#0A0B0D` | Page ground | |
| `--bg-2` | `#0E1014` | Solid alternate ground where glass cannot be used | |
| `--surface` / `--surface-2` | `#131519` / `#1B1E23` | Solid fallback for panels and for selected rows when `backdrop-filter` is missing | |
| `--text` | `#F4F4F1` | Warm white | 17.9 on bg, 15.2 on surface-2 |
| `--muted` | `#A4A8AF` | Labels, meta | 8.2 on bg, 7.5 on glass, 7.0 on surface-2 |
| `--steel` | `#C9CCD1` | Cool neutral: eyebrows, icons, rank numbers, the non-captain marker | 12.2 on bg, 10.4 on surface-2 |
| `--steel-2` | `#858B95` | Tertiary text: timestamps, "provisional", disabled labels | 5.7 on bg, 5.2 on glass, 4.9 on surface-2 and on wash |
| `--accent` | `#F2C14E` | Trophy gold. Label on gold is `--accent-ink` `#0A0B0D` (11.7) | 11.7 on bg, 10.0 on surface-2 |
| `--live` | `#FF5A52` | LIVE only, black label | 6.4 on bg |
| `--ok` / `--danger` | `#3DDC84` / `#FF6B63` | Points gained or lost, errors, an unmet rule | 11.0 / 7.1 on bg |
| `--wash` | `#221E12` | Your own row, notices | text 15.1, muted 7.0 |
| `--pitch` / `--pitch-2` | `#1B4D2E` / `#1F5533` | Retired as a fill (2026-11-18). The Draft board is dark steel; green survives only as muted pitch lines and a soft centre glow | n/a |

Edges and glass:

| Token | Value | Role |
|---|---|---|
| `--line` | white at 8% | Rules between rows inside a panel |
| `--edge-glass` | white at 14% | Hairlines on glass, the hold-ring track |
| `--steel-edge` | `rgba(168,184,206,.22)` | The steel rim of a glass panel, tab rules, the section header rule. A panel boundary, not a control edge |
| `--edge-strong` | solid `#6F7885` | The edge of every control: outlined buttons, the wallet pill, chips, selected tiles, dashed empty slots. 4.4 on bg, 4.0 on glass, 3.7 on surface-2 and on wash (floor 3.0). `--edge-control` in `mock.css` is the same value |
| `--glass` | white at 5%, `backdrop-filter: blur(18px) saturate(120%)` | Glass fill. The bar adds `rgba(10,11,13,.82)` under it |
| `--hilite` | `inset 0 1px 0 rgba(255,255,255,.10)` | The top bevel of a glass panel |
| `--sheen` | the four-stop cool gradient in `mock.css`, 3 to 10% | Brushed steel on panel headers and number wells. Static |
| `--row` / `--row-2` | `rgba(10,11,13,.76)` / `rgba(24,27,32,.82)` | The dark fill for dense data inside glass; `--row-2` for headers, selected and disabled |

Rules:
- Gold is the only accent. It means: the one main button, the captain, the prize line, a paid
  place, your "You" tag, the active tab, focus, the dot in "elevn.". Nothing else is gold.
- One gold button per view. Logged out that button is "Connect wallet" in the bar, so every other
  "Connect wallet", including the one at the end of the home page, is outlined. Logged in it is
  the action on the card that needs one.
- Every secondary button is outlined with `--edge-strong`.
- Red means a match is being played right now, nothing else. A squad that is banked or not started
  never carries the LIVE badge.
- Steel is a neutral, not a second accent: it never fills a button and never marks a state.
- No neon, no second accent, no gradients as decoration.

## Type

Two families. **Sora** carries everything. **Barlow Condensed** (600/700, `--font-display`) is the
scoreboard face, capitals only: mode names, club codes, match scores, countdowns, the FULL TIME
and BANKED stamps, the pack number, and the one-word title cards on the home page, which are
outlined. Nowhere else. Numbers use tabular figures everywhere, never a monospace face. Points
and money are Sora; only scores and clocks are Barlow Condensed.

| Role | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| Title card | capitals 12.5% of the window height | 700, outlined: 1.5px stroke, `--text` at 62%, no fill | 0.02em | Barlow Condensed. Home page only, one word per beat, `aria-hidden` |
| Display | clamp(56px, 5.6vw, 104px) | 800 | -0.035em | The home h1 only |
| H1 | clamp(40px, 3.6vw, 64px) | 800 | -0.03em | Page titles; every page has exactly one |
| H2 | clamp(30px, 2.6vw, 44px) | 700 | -0.02em | Sections |
| H3 | 20px | 600 | -0.01em | Card and row titles |
| Scoreboard | 32px (card), 56px (stage) | 700 | 0.01em | Barlow Condensed capitals |
| Big number | 48px | 700 | -0.02em | Sora tabular: day total, banked points, prize amount |
| Lead | 20px / 1.5 | 400 | 0 | One per section header, 52ch max |
| Body | 16px / 1.6 | 400 | 0 | 65ch max |
| Small | 14px / 1.5 | 500 | 0 | Table cells, meta |
| Label | 13px | 500 | 0 | Sentence case |
| Eyebrow | 12px | 600 | 0.16em | Capitals, `--steel`: section eyebrows, panel headings |

No text below 12px. Headings use `text-wrap: balance`, body text `text-wrap: pretty`. Heading
levels do not skip. Outlined type appears nowhere but the home title cards.

Wording: the access line is "Play free". Never "No entry fee".

## Layout

Design at 1440 and 1920 first, check 1024, then adapt to 390.

| Width | Content | Side margin | Grid |
|---|---|---|---|
| 1920 | 1440 max | 240 | 12 columns, 24 gutter |
| 1440 | 1280 | 80 | 12 columns, 24 gutter |
| 1024 | 944 | 40 | 12 columns, 16 gutter |
| 390 | 342 | 24 | 4 columns, 16 gutter |

- Content sits on the two content edges, the bar included. Band grounds and the home canvas are
  full-bleed.
- **Section header** (every section on every page): columns 1 to 6 hold an Eyebrow and an H2;
  columns 7 to 12 hold a `--steel-edge` rule, one Lead and at most two outlined buttons; then
  48px; then one visual or one list at full content width.
- **Bands:** alternate bands darken the ground with black at 24%, hard edge, no gradient. 128px
  above a header, 96px below the visual. Nothing else separates chapters.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160. Card padding 24, mode cards 32; row
  height 56.
- **Radius:** 8 inputs and chips, 12 cards and tiles, 16 mode cards and boards, 24 the glass
  rail, 999 buttons and badges.
- **Glass panel:** `--glass` fill, `--steel-edge` rim, `--hilite` bevel, no drop shadow. Used for
  the bar, mode cards, boards, the Today rail, the banked card and the menu panel.
- **Dense data never sits on bare glass.** Leaderboard rows, fixture rows, player tiles, squads,
  countdowns and number wells sit on `--row` (or `--row-2`) inside the glass panel.
- Never a panel inside a panel: inner groups are ruled with `--line`, not boxed.
- Only one thing pins: the home ball canvas. Tables scroll with a sticky header row.
- Use `overflow-x: clip`, never `hidden`, on any ancestor of the home stage.

### Navigation

| Part | Desktop | Phone |
|---|---|---|
| Bar | 64px, fixed, always shown (it no longer slides away), glass. Logo left; **Today, Ranks, Chat** as 14px links, 40px high; the current one is white with a gold dot under it and `aria-current`. Right: the wallet control, then "Menu +" | Logo, wallet and menu icon on top; Today, Ranks, Chat in a bottom tab bar |
| Wallet, logged out | The one gold button: "Connect wallet" | Same |
| Wallet, logged in | Outlined pill: short address and a ring showing what is unlocked, with a text label ("Blitz unlocked", "Blitz and Draft unlocked"). Opens: holding, prizes, disconnect | Same |
| Side menu | Panel from the right (StaggeredMenu): News, How to play, FAQ, About, Roadmap as big words; a small row with X and legal | Full-screen sheet, the same five |

Logged out, the logo opens the home scroll story. Logged in, the logo opens Today and the story
is reached from About. The devnet banner stays above the bar. There is no league picker and no
league page. Notifications are not designed yet.

**Phone adaptation (390).** One column. The section header stacks and loses its rule; band padding
64. The three-pane pick flow becomes three steps with a sticky squad bar at the bottom. The Today
rail becomes a strip under the bar. Dropped on a phone: the beat rail, the cursor light, hover
states, the home title words. Targets are at least 44px.

## Home

One continuous scroll over a fixed full-screen canvas, in seven beats, with no snapping. There is
no opening gate and no intro video: the ball opening is the authored moment. The working build is
`docs/design/prototype/home/`; its README lists the exact poses.

### The hero object: the glass ball

- A size 5 match ball (220 mm), built in three.js from code at start-up. 32 panels: each is a
  polished steel frame with a glass pane set into it; hexagon panes near-clear, pentagon panes
  smoked, so the football pattern reads.
- A gold core (`#F2C14E`) inside. It is dark while the ball is closed and ignites to full gold as
  the ball opens. The rim studs do the same.
- It splits along its zigzag equator into exactly two halves: the Blitz half (3 studs) and the
  Draft half (5 studs). The split is diagonal, Blitz upper right, Draft lower left.
- Lit by a studio baked into the environment at start-up (a softbox, strips, a low fill). No
  direct lights except the core's glow; glass is lit by the environment only.
- **Hold to open.** Press and hold the ball: a gold ring fills in 900 ms, the seam cracks a little
  while it fills, then the halves part 60 mm and the core ignites. Release closes it in 350 ms.
  Mouse, touch, and a real button under the ball that takes Space or Enter.
- The cursor turns the studio light, 12° of yaw and 6° of pitch at most, on the home canvas only.
  The ball never follows the cursor. Phone tilt may do the same once the visitor has asked.
- three.js loads on the home page only, after first paint. Pixel ratio capped at 2. Rendering
  stops in a hidden tab, when nothing has changed, and once the stage is covered.

### The beats

| Scroll | Title word | The ball | Words (HTML, left content edge) |
|---|---|---|---|
| 0% | ELEVN | Whole and closed, turning 6° a second, core dark. Hold to open | The h1 and an outlined "Connect wallet" |
| 20% | FULL TIME | Camera pushes in; the ball fills the right of the screen | Why a result at full time |
| 40% | MODES | Panels lift from the poles, the halves part, the core ignites | Two ways to play |
| 56% | BLITZ | Ball in the upper right, both halves in frame; the Blitz icon plays in front | Matchday Blitz in one line, three notes |
| 72% | DRAFT | Same frame, leaning to the Draft half; the five packs stand in front | Draft in one line, three notes |
| 88% | HOLD | Panels return, halves 60 mm apart, core lit | 150,000 $ELEVN for Blitz, 300,000 adds Draft. "Play free" |
| 100% | ELEVN | The halves close, the core goes dark | An outlined "Connect wallet" |

After the story one plain prizes band scrolls up over the stage (top 5, 50 / 25 / 12 / 8 / 5).

- **Title words.** One outlined Barlow Condensed word per beat, drawn as HTML in front of the
  scene, never behind or through the ball, so every letter is drawn at the same strength. At rest
  a word never overlaps the ball: it is either centred above the closed ball (the ball moves down
  to clear it) or placed to the left of the ball. Positions are measured against the ball's
  outline on screen at each window size, not fixed numbers. Check: `node capture.js titles`
  prints each word's gap to the ball; no gap may be negative. The words are decoration
  (`aria-hidden`); the real copy is HTML.
- **Words** fade in and rise 16px once per beat (700 ms), driven by scroll position, never by
  observers, so the story runs backwards exactly as forwards. Without JavaScript the words are a
  normal readable page.
- **Mode icons** (Blitz and Draft beats): steel rim, glass fill, one gold accent, three notes in
  a row under each. Each is a function of scroll, so it scrubs both ways and rests on its last
  frame.
- **Beat rail:** dots at the right content edge mark the seven beats and jump to them.
- **The Draft packs:** five tall foil packs (2:3) in a row, all using the one shared artwork,
  labelled PACK 1 to PACK 5 in code. On hover or keyboard focus, only while the packs stand
  closed: the pack lifts and tilts towards the cursor, one sheen sweeps across (900 ms), the rim
  glows gold, the hover video fades in, and the other four dim. The Blitz fixture cards share
  this hover, with a glint drawn in code that runs along the card's stripe and passes behind the
  players. These two are the only elements on the site that tilt or shine.
- **Sound** exists in the hero only, made with Web Audio (no files), and is off until the visitor
  asks for it (a completed hold or the speaker button). The choice is remembered. Not built yet.
- **Narrow screens (900px and under):** the words flow as a normal page over a dimmed still of
  the closed ball. No scrub, no title words, no hold; the icons show their last frame.
- **Fallback:** a poster of the hero frame is the first paint. If WebGL 2 is missing, the context
  is lost twice, data saver is on or the frame rate fails, the page shows one still per beat.

## Product screens

Mockups: `docs/design/mockups/` (`mock.css` holds these tokens as used).

- **Today:** mode cards in columns 1 to 8 (Blitz, then Draft, then a small Shootout card); a
  glass rail in columns 9 to 12 with the next kickoff countdown, your place and the prize line.
- **Blitz pick:** fixtures in columns 1 to 4, the squad builder in 5 to 9, the live board in 10
  to 12; all three follow the chosen fixture. Below 1200px the board stacks under the other two.
- **Draft:** the five packs, the pool of 15, the five-a-side board (dark steel with muted green pitch lines) with its rule
  checks listed beside it.
- **Ranks:** the board in columns 1 to 8 (tabs: Blitz daily, Blitz weekly, Draft weekly), your
  prizes in 9 to 12.
- **Shootout:** its own page with an h1, reached from the Shootout card.
- **Info pages:** 65ch text column, ruled lists, one button at the end.

Every component has hover, focus, disabled, loading (a still skeleton in its own shape, no
shimmer), error and empty states.

| Component | Anatomy | States |
|---|---|---|
| Mode card | Scoreboard name, one status line, one big number or countdown, one button | Play, Live (red LIVE badge, day total, rank, gap to the prize line), Result, Locked (holding needed, "How to unlock"), No matchday |
| Fixture row | Kickoff time, club codes and crests, league, squad slot marker | Open, chosen (gold slot number 1 to 3), line-ups confirmed, locked, live, full time, banked, postponed |
| Player tile | Name, club code, position, points once live | Available, picked (a tick and the word "Picked"), captain, not starting, unavailable by rule (only the name dims; the reason stays at full contrast) |
| Captain marker | 20px gold disc with a black C in a 40px hit area; "×2" beside the points | Unset (dashed ring; Save is disabled with "Choose a captain"), set, locked |
| Squad of three | Three tiles on one fixture header, total at right | Empty, partial, ready, locked, live, full time (provisional), banked |
| Leaderboard row | Rank, wallet name, points, movement | Default, you (`--wash` and a gold "You" tag), paid place (gold rank), tied, moving |
| Squad status dots | Three marks per row on the board | Banked (gold ring with a tick), live (solid red), not started (empty steel ring) |
| Prize line | A 1px gold rule under 5th labelled "Prize line"; above the board, "If the day ended now you'd win X" | Outside the money (gap in points), in the money, final |
| Banked card | Glass, a gold seam along the top; fixture, "+34 banked", rank line, "in the money" chip | Full time (provisional), banked, banked outside the money |
| Pack | The shared foil artwork with its number 1 to 5 in code | Sealed, opening, opened; "Open all" |
| Pack-reveal card | Player, club, position, price band | Shown, chosen for the five, unused, swapped in |
| Five-a-side board | A dark steel board with muted green pitch lines and five slots; rule checks beside it | Empty, invalid (the unmet rule in `--danger` with its words), ready, locked, scoring |
| Countdown | Eyebrow, then Barlow digits in a `--row` well | Days, hours and minutes, under an hour (seconds), "Locked", next matchday |
| Prize row | Place, share, amount, wallet | Projected, under review, sent (link to the transfer), rolled forward, held back by the prize rules |
| Empty | One sentence and one useful action | No squads, no draft, no prizes, board empty |
| Review pending | Steel chip "Result under review"; amounts shown without gold | Under review, approved and sent |

A disabled main button always shows its reason beside it.

## Motion

Transform and opacity only. Easing "smooth" is `cubic-bezier(0.22, 1, 0.36, 1)`.

| Token | Value | Used for |
|---|---|---|
| `--dur-hover` | 150 ms, ease-out | Hover and press on buttons, links and tiles |
| `--dur-fast` | 180 ms | Tab change, chips, the gold dot, the pack opening |
| `--dur-normal` | 350 ms | Rank rows, card arrivals, the menu panel, the ball closing on release |
| `--dur-slow` | 600 ms | Count-ups, the prize line, one fade per section on entry |
| `--dur-arrival` | 700 ms | Home page words only |
| `--dur-hold` | 900 ms | The hold ring on the ball |

No raw durations in component code; use the tokens.

- **The authored moment:** the ball opening on the home page. Nothing else competes with it.
- **Banked card:** rises 16px and fades in (350), the gold seam draws (350), points count up
  (600), then the rank line and the chip fade in (180 each).
- **Rank changes:** at most every 5 seconds; rows slide to their place (350); changed points turn
  green for 600 ms.
- **Draft packs:** a pack opens (180), three cards rise 80 ms apart (350); after five, the 15
  settle by position (600). Shown once; later visits are still. "Open all" skips it.
- **Tabs:** the gold dot slides to the new tab (180); content crossfades.
- **Hover:** buttons step up 1px and press down, links draw their underline, tiles brighten.
- The bar, headings, the grid and band edges never move.
- Not allowed anywhere: parallax, shimmer, confetti, card flips, rarity glows, sparks, cursor
  effects, tilt-on-hover. The two exceptions are both on the home page and listed above: the
  cursor turns the studio light, and the closed Draft packs and the Blitz fixture cards tilt and
  shine on hover.
- React Bits pieces kept, restyled to these tokens: StaggeredMenu (side menu), GlideSelect
  (dropdowns), CountUp (numbers), AnimatedList (lists), LatticeLoader (a whole page loading).

**Reduced motion** (`prefers-reduced-motion: reduce`): static states. No scrubbed 3D, no idle
turn, no cursor light, no count-ups, no sliding rows, no pack lift, tilt, sheen or hover video
(the gold rim only), no moving background light. The home page shows one still pose per beat,
swapped with a 200 ms fade; hold-to-open becomes a button that toggles open and closed with the
same fade. Everything else is a 200 ms fade or instant, with final numbers shown.

## What goes

- Season, Squad Battles, the league pages, the league picker, the fan of league cards, the tilted
  pitch with an eleven, transfers, the injury list, difficulty chips, the "This gameweek" board.
- The home page's snapping slides, the four steps, the fee bar, the opening gate and the intro
  video.
- SideRays, grid-pulse and `.floodlit` on the home page.
- The hide-on-scroll bar.
- Already gone and staying gone: ShinyText, GooeyNav, ClickSpark, CursorGrid, GlareHover, the
  pitch-line background.
- Everything from the Tokyo video; Blender; the `--lantern` colour.

## Quality floor

- Text contrast at least 4.5:1 (large text 3:1), checked on the rendered pairs, text on glass
  included.
- The edge of every control at least 3:1 against what is behind it: use `--edge-strong`.
- Status is never colour alone: LIVE, captain, banked, picked, "You", a paid place and an unmet
  rule each carry a word, a letter or a distinct shape.
- A visible 2px gold focus ring with a 2px offset on everything reachable. Full keyboard paths
  for the pick flow, pack opening and hold-to-open. Dialogs have a dialog role; the current nav
  link and tab carry `aria-current`.
- Targets at least 40px on desktop and 44px on a phone.
- `prefers-reduced-motion` respected as above.
- Selection, caret and scrollbars themed from the palette.
- Checked at 1920, 1440 and 1024, then 390. Long wallet names and four-digit points must fit.

## Owner's rulings, 2026-11-18

1. **Light on the home canvas** (settled): steel, white light and gold only. No blue anywhere.
2. **Shootout leaderboard** (settled): a section of the Shootout page, not a board in Ranks.
3. **Prize amounts** (changed 2026-11-19): SOL only. No dollar value beside a SOL amount anywhere.
   The one exception is the fixed weekly prize, which is defined in dollars: "$500" with its SOL
   equivalent.
4. **SideRays outside the home page** (settled): on the info pages, and in the top band behind
   the page title on Today, Ranks and Chat. Soft and slow, fading out before the data panels and
   never behind tables or text blocks. Static under reduced motion. Off on the home page.
5. **Without a wallet** (settled, crucial): guest mode. Every screen and feature works without
   connecting, including building squads and trying Draft; nothing is saved. The top bar shows the
   gold "Connect wallet" until connected, then the wallet chip. Save buttons read "Connect wallet
   to save" in the outlined style. Connecting unlocks saving and a username.
6. **Prizes** (settled): winners collect on a Winnings view opened from the wallet chip. Half is
   collectable at once; the rest is a locked balance released 20% per withdrawal, one withdrawal
   every 24 hours, frozen while the wallet is below its required holding. No "72-hour" wording.
7. **Draft board** (settled): dark steel with muted green pitch lines and a soft green centre
   glow. Gold only for the captain. The plain green pitch is retired.
8. **Draft reveal panel** (settled): the panel showing the three players of the pack just opened
   stays, under the packs.
9. **Frozen winnings** (settled): a red "FROZEN" badge with a glyph, the timer shown paused and
   the Withdraw button disabled. Red is therefore used for two things only: LIVE and FROZEN. The
   gold "Get $ELEVN" button stays as the one gold button in that view.
10. **Naming** (settled): "Blitz matchday" for the board and its prize, never "daily". "Daily" is only
    the 24-hour withdrawal cooldown.
11. **Guest "Connect wallet"** (settled): gold when it is the only gold button on the page; outlined
    when the page already shows a gold button (for example Shoot on Penalty Shootout).
