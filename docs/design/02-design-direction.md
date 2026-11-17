# 02. Design direction and the updated design system

> **Note, 2026-11-17:** `web/DESIGN.md` is now the source of truth. Where this document and `web/DESIGN.md` differ, `web/DESIGN.md` wins.

Written 2026-11-17. A proposal for the owner to approve: nothing here is built, and
`web/DESIGN.md` is not changed until it is. Contrast ratios are calculated (WCAG 2.1) from the hex
values; nothing has been checked on a rendered page yet. Desktop first throughout.

## 1. The idea: a night match, seen through steel and glass

elevn should feel like standing at a floodlit ground on a wet night: dark, calm, and one warm
light that you walk towards. The four sources each get one job, so they read as one look:

| Source | Its one job | Where it shows |
|---|---|---|
| Night match (current system) | The palette: near-black, warm white, trophy gold | Every page |
| Chrome motion graphics | The material: brushed steel, smoked glass, hairlines, outlined one-word cards, blueprint callouts | The ball, card edges, section eyebrows, the home title cards |
| Tokyo | The light: one warm source, wet reflections, rain, soft out-of-focus lights | The home canvas only |
| rive.app | The structure: one header pattern, alternating bands, one pinned stage, a still frame with motion inside it | Every page |

Deliberately left out: Tokyo's pink and green neon, signage and street imagery; the thermal pass
and fast cuts; rive.app's rainbow edge, Orbitron, mono buttons and 24-tile wall; video in the
hero; the opening gate; the tilted pitch with an eleven; league cards; any second accent colour.

## 2. Colour

Existing tokens keep their values. New rows are marked. Text pairs are listed against the darkest
and lightest ground they may sit on.

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--bg` | `#0A0B0D` | Page ground, odd bands | |
| `--bg-2` (new) | `#0E1014` | Even bands; also the smoked-glass tint | |
| `--surface` / `--surface-2` | `#131519` / `#1B1E23` | Cards and tiles; headers, inputs, selected tiles | |
| `--text` | `#F4F4F1` | Warm white | 17.9 on bg, 17.3 on bg-2, 16.6 on surface, 15.2 on surface-2 |
| `--muted` | `#A4A8AF` | Labels, meta | 8.2 on bg, 8.0 on bg-2, 7.7 on surface, 7.0 on surface-2 |
| `--steel` (new) | `#C9CCD1` | Cool neutral: eyebrows, icons, rank numbers, the non-captain player marker | 12.2 on bg, 11.8 on bg-2, 11.4 on surface, 10.4 on surface-2 |
| `--steel-2` (new) | `#858B95` | Tertiary text: timestamps, "provisional", disabled labels | 5.7 on bg, 5.6 on bg-2, 5.3 on surface, 4.9 on surface-2 |
| `--line` (new) | white at 8% | Card edge, rules between rows | Not text |
| `--edge-glass` (new) | white at 14% | Glass edge and hairline rules | Not text |
| `--edge-strong` (new) | solid `#6F7885` | The edge of every control: secondary button outline, wallet pill, chips | 4.4 on bg, 4.1 on surface, 3.7 on surface-2 (floor 3.0). Replaces white at 28%, which was 2.4 |
| `--glass` (new) | `#0E1014` at 62%, blur 20px | Smoked glass panels | Text on glass is `--text` or `--muted` only; worst case over a bright canvas glint still above 7:1 because of the tint. To verify on the build |
| `--accent` | `#F2C14E` | Trophy gold, unchanged role | 11.7 on bg, 11.3 on bg-2, 10.9 on surface; black label on gold 11.7 |
| `--live` | `#FF5A52` | LIVE only | 6.4 on bg, 5.9 on surface; black label 6.4 |
| `--pitch` / `--pitch-2` | `#1B4D2E` / `#1F5533` | The five-a-side board only | White text 8.9 / 7.9. Muted text is not allowed on grass (4.1 / 3.7) |
| `--wash` | `#221E12` | Your own row, notices | text 15.1, muted 7.0 |
| `--ok` / `--danger` | `#3DDC84` / `#FF6B63` | Points gained or lost, errors | 11.0 / 7.1 on bg; 10.2 / 6.6 on surface |
| `--lantern` (new) | `#F08A4B` | Light, never ink: the warm glow on the wet ground and in the bokeh, home canvas only | Not used for text or controls |

Rules:
- One accent stays. Gold means: the one main button per view, the captain, the prize line, your
  place in the money, the active tab, focus, the dot. Nothing else is gold.
- Red still means a match is being played right now, nothing else. `--danger` is for errors and
  points lost, as today.
- Steel is a neutral, not a second accent: it never fills a button and never marks a state.
- No neon anywhere in the interface. See decision 1 for the canvas.
- The difficulty-chip rule goes with Season.
- Correction: `--muted` on `--bg` calculates to 8.2:1, not the 8.3 in `web/DESIGN.md`.

## 3. Type

Sora carries everything. Barlow Condensed 600/700 is the scoreboard face, capitals only.

| Role | Desktop size | Weight | Tracking | Use |
|---|---|---|---|---|
| Title card | 22vw, max 420px | 700, outlined (1px `--text` stroke, no fill) | 0.02em | Barlow Condensed. Home canvas only, behind the ball, one word. Decoration: `aria-hidden` |
| Display | clamp(56px, 5.6vw, 104px) | 800 | -0.035em | The home h1 only |
| H1 | clamp(40px, 3.6vw, 64px) | 800 | -0.03em | Page titles |
| H2 | clamp(30px, 2.6vw, 44px) | 700 | -0.02em | Section headers |
| H3 | 20px | 600 | -0.01em | Card and row titles |
| Scoreboard | 32px (card), 56px (stage) | 700 | 0.01em | Barlow Condensed capitals: mode names (BLITZ, DRAFT), club codes, match score, the big countdown, FULL TIME / BANKED stamps |
| Big number | 48px | 700 | -0.02em | Sora tabular: day total, banked points, prize amount |
| Lead | 20px / 1.5 | 400 | 0 | One per section header, 52ch max |
| Body | 16px / 1.6 | 400 | 0 | 65ch max |
| Small | 14px / 1.5 | 500 | 0 | Table cells, meta |
| Label | 13px | 500 | 0 | Sentence case |
| Eyebrow (was Board label) | 12px | 600 | 0.16em | Capitals, `--steel`: section eyebrows, panel headings, blueprint callouts |

Numbers are tabular everywhere, never monospace. Points and money are Sora; only scores and
clocks are Barlow Condensed. Outlined type appears nowhere in the product pages.

## 4. Layout, desktop first

| Width | Content | Side margin | Grid |
|---|---|---|---|
| 1920 | 1440 max | 240 | 12 columns, 24 gutter (98px columns) |
| 1440 | 1280 | 80 | 12 columns, 24 gutter (85px columns) |
| 1024 | 944 | 40 | 12 columns, 16 gutter |
| 390 | 342 | 24 | 4 columns, 16 gutter |

Band grounds and the canvas are full-bleed; content always sits on the two content edges, the
nav included. This widens today's 1360 to 1440 so 1920 is not mostly margin.

- **Section header pattern** (every section on every page): columns 1 to 6 hold an Eyebrow and
  an H2; columns 7 to 12 hold a 14% hairline rule, one Lead paragraph and at most two outlined
  buttons; then 48px; then one visual or one list at full content width.
- **Bands:** `--bg` and `--bg-2` alternate with a hard edge and no gradient. 128px above a header,
  96px below the visual. A band is a chapter; nothing else separates chapters.
- **The single pinned stage:** the home ball canvas, fixed for the seven beats, ball at 62%
  across, words on the left content edge, the beat rail at the right edge. Nothing else on the
  site pins. Tables scroll with a sticky header row only.
- **Product page frames.** Today: mode cards in columns 1 to 8 (Blitz above, Draft below,
  Shootout small under them), a glass rail in columns 9 to 12 (next kickoff countdown, your
  place, prize line). Blitz pick: fixtures 1 to 4, squad builder 5 to 9, live board 10 to 12; all
  three follow the chosen fixture. Ranks: the board in columns 1 to 8, your prizes in 9 to 12.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160. Card padding 24; row height 56.
- **Radii:** 8 inputs, 12 cards and tiles, 16 mode cards and the board, 24 glass rail, 999
  buttons and badges.
- **Card:** solid `--surface`, 8% edge, no shadow. Never a card inside a card: inner groups are
  ruled, not boxed.
- **Glass:** `--glass` with a 14% edge and a 1px top highlight at 20% white (the steel bevel).
  Used only for panels that float over the canvas or stay in view: the nav backing, the Today
  rail, the banked card, the menu panel. Lists are never glass.

**Phone adaptation (390).** One column. The header pattern stacks (eyebrow, H2, lead, buttons)
and the rule is dropped. Bands stay, padding 64. The three-pane pick flow becomes three steps
with a sticky squad bar at the bottom. The Today rail becomes a strip under the nav. Dropped:
the beat rail, cursor light, blueprint toggle, two-column callouts (one column under the ball),
hover states. The home stage follows the phone tier in 03.

## 5. Navigation

| Part | Desktop | Phone |
|---|---|---|
| Bar | 64px, fixed, always shown, glass backing once scrolled. Logo left; Today, Ranks, Chat as 14px links (current: white with the gold dot under it); right: wallet control, then "Menu +" | Logo, wallet, menu icon on top; Today, Ranks, Chat in a bottom tab bar |
| Wallet, logged out | The one gold button: "Connect wallet" | Same |
| Wallet, logged in | Outlined pill: short address and a ring showing what is unlocked (Blitz, or Blitz and Draft). Opens: holding, prizes link, disconnect | Same |
| Side menu | Panel from the right: News, How to play, FAQ, About, Roadmap as big words; small row: X, legal | Full-screen sheet, same five |
| Penalty Shootout | The small card under the mode cards on Today opens the Shootout page; its leaderboard is a section of that page (decision 2) | Same |

Logged out, the logo opens the scroll story and the bar shows the same three links. Logged in,
the logo opens Today and the scroll story is reached from About. The devnet test banner stays.
This bar no longer slides away: it replaces the current hide-on-scroll rule.

## 6. Components and their states

Every component also has hover, focus, disabled and loading (a still skeleton in its own
shape, no shimmer).

| Component | Anatomy | States |
|---|---|---|
| Mode card | Scoreboard name, one status line, one big number or countdown, one button | Play (gold button), Live (red LIVE badge, day total, rank, gap to the prize line; outlined "Live" button), Result (final rank, prize won; outlined), Locked (holding needed, outlined "How to unlock"), No matchday |
| Fixture row | Kickoff time, club codes and crests, league, squad slot marker | Open, chosen (gold slot number 1 to 3), line-ups confirmed, locked at kickoff, live (red badge, score), full time, banked, postponed (steel-2, "Swap" action) |
| Player pick tile | Name, club code, position, points once live | Available, picked, captain, not starting (after line-ups), unavailable by rule (dimmed with the reason: "One from each club") |
| Captain marker | 20px gold disc with a black C; "×2" beside the points | Unset (dashed steel ring, and Save is disabled with "Choose a captain"), set, locked |
| Squad of three | Three tiles in a row on one fixture header, total at right | Empty, partial, ready, locked, live, full time (provisional), banked |
| Leaderboard row | Rank, wallet name, points (tabular), movement | Default, you (`--wash` and a gold "You" tag), paid place (gold rank), tied, moving |
| Prize line | A gold 1px rule under 5th with the label "Prize line"; above the board, "If the day ended now you'd win X" | Outside the money (shows the gap in points), in the money, final |
| Banked card | Glass; gold seam along the top; fixture, "+34 banked", rank line, "in the money" chip | Full time (provisional, steel-2), banked, banked outside the money (no chip) |
| Pack | A steel plate with a centre seam, numbered 1 to 5 | Sealed, opening, opened; "Open all" |
| Pack-reveal card | Player, club, position, price band (top, mid, budget) | Shown, chosen for the five, unused, swapped in |
| Five-a-side board | A small `--pitch` board, five slots; rule checks listed beside it | Empty, invalid (the unmet rule in `--danger` text), ready, locked, scoring |
| Countdown | Eyebrow, then Barlow digits | Days, hours and minutes, under an hour (seconds shown), locked ("Locked"), next matchday |
| Prize row | Place, share (50 / 25 / 12 / 8 / 5 percent), amount, wallet | Projected, under review, sent (link to the transfer), rolled forward, on hold (weekly prizes) |
| Empty | One sentence and one useful action | No squads yet, no draft yet, no prizes yet, board empty |
| No matchday | Today shows the countdown to the next matchday and the calendar link | Shootout card stays playable |
| Review pending | Steel chip "Result under review" on the Result card and each prize row; amounts shown as final-pending, no gold | Under review, approved and sent |

## 7. Motion on product pages

Agrees with section 7 of `03-motion-and-hero.md`; transform and opacity only.

| Token | Value | May move | Never moves |
|---|---|---|---|
| `--dur-hover` | 150ms ease-out | Buttons, links, tiles on hover and press | The nav, headings, the grid, band edges, tables' structure |
| `--dur-fast` | 180ms | Tab change, chips, the gold dot | |
| `--dur-normal` | 350ms smooth | Rank rows, card arrivals, menu panel | |
| `--dur-slow` | 600ms smooth | Count-ups, the prize line, one fade per section on entry | |
| `--dur-arrival` | 700ms | Home page words only | |

Smooth is `cubic-bezier(0.22, 1, 0.36, 1)`. No parallax, shimmer, confetti, card flips, tilt or
cursor effects on product pages. Board updates at most every 5 seconds.

Home page exceptions (approved): continuous scroll over the fixed canvas; cursor or tilt turns
the studio light; outlined title cards; sound in the hero, off until asked for. On desktop the
home stage runs at full quality: pixel ratio up to 2, MSAA 4, real glass transmission, bloom,
the ground reflection pass, rain, bokeh, the full 12° and 6° cursor light, the blueprint toggle
and sound. The limits in 03 (pixel ratio 1.75, opaque glass, baked reflection, stills) apply
only as the phone, weak-device and reduced-motion fallbacks.

## 8. Replacement text for `web/DESIGN.md`

**Light (replaces the "Light:" paragraph; change 4).** "On the home page the only light is the
studio inside the ball canvas. SideRays, grid-pulse and the floodlight pool are off there."

**Type (replaces the Barlow Condensed sentence; change 5).** "Barlow Condensed (600/700,
`--font-display`) is the scoreboard face, capitals only: mode names, club codes, scores, the
countdown, and the one-word title cards on the home canvas, which are outlined. Nowhere else."

**Home (replaces the Home section and its diagram; changes 2 and 3).** "The home page is one
continuous scroll over a fixed ball canvas, in seven beats, with no snapping. The right-edge
rail marks the beats. There is no opening gate and no intro video; the ball's reveal is the
authored moment. The main button reads 'Connect wallet' and the access line says 'Play free'."

**Motion (replaces the first line and the last bullet; changes 1, 6 and 7).** "Durations are
named tokens: hover 150ms, fast 180ms, normal 350ms, slow 600ms, home arrivals 700ms; easing
`cubic-bezier(0.22, 1, 0.36, 1)`. No sparks, shimmer, tilt-on-hover or cursor effects in the
interface. One exception: on the home canvas the cursor, or phone tilt, turns the studio light;
no element tilts. Sound exists in the home hero only and is off until the visitor asks for it.
Under reduced motion everything rests and the home page shows stills."

Note: beat 6 in 03 still reads "No entry fee" and should read "Play free". Removing Season, the
league pages and the phone-first sentence from `web/DESIGN.md` is a larger rewrite outside the
seven changes; it follows once this document is approved.

## 9. Quality floor

- Text 4.5:1, large text and control edges 3:1, checked on the rendered pairs, glass included.
- A 2px gold focus ring with a 2px offset on everything reachable; full keyboard paths for the
  pick flow, pack opening and the canvas (Space to hold, B for blueprint).
- State is never colour alone: LIVE, captain, banked and "You" each carry a word or a letter.
- Every component in section 6 designed in all its states, with loading, error and empty.
- Checked at 1920, 1440 and 1024, then 390. Long wallet names and four-digit points must fit.
- Reduced motion: no scroll-linked camera, no count-ups, no sliding rows; 200ms fades only.
- Targets at least 40px on desktop and 44px on a phone.

## 10. Decisions needed from the owner

1. **A cool light on the home canvas.** Tokyo's appeal is warm lantern against cool neon; 03
   takes no neon. Recommendation: no neon in the interface at all, and allow one dim cool blue
   (`#7FB2D6`) in the canvas reflections and bokeh only, so the gold core has something to glow
   against.
2. **Where the Shootout leaderboard lives.** The blueprint says "its own section of the site".
   Recommendation: a section of the Shootout page, reached from the Shootout card, not a fourth
   board in Ranks, so Ranks stays about prizes.
3. **How prize amounts are written.** The blueprint says "$X" and also SOL on devnet.
   Recommendation: SOL as the main figure with the dollar value in muted text; the weekly prize
   as "$500" with its SOL equivalent.
4. **SideRays outside the home page.** Approved to stay there. Recommendation: keep them on the
   info pages only and switch them off on Today, Ranks and Chat, where the frame should be still.
5. **What a visitor sees without a wallet.** The blueprint does not say whether Today, Ranks
   and Chat can be read while logged out. Recommendation: all three readable, with "Connect
   wallet" as the only gold button.
