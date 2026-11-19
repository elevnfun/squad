# Lessons from the design work

Every agent reads this file before starting and appends a short entry before reporting. Agents do
not remember earlier runs, so this file is the memory. The head agent reviews each piece of work
against the owner's interests and adds its verdict here too.

Entry format (keep it short, plain and specific):

```
## <date> · <agent> · <task>
- Did: what was built.
- How: the approach that worked.
- Changed: what had to be redone, and why.
- Rule for next time: one line another agent can act on.
```

## What the owner cares about (from his feedback so far)

- Do not overcomplicate or jumble the site. When unsure, do less.
- Desktop first. The phone view only has to work.
- Text must be fully readable. He rejected title words hidden behind the ball and a first letter
  fading out; legibility beats effects.
- He likes glass and steel, the gold accent, the light rays, and rich "collectible" objects (the
  foil packs, the fixture cards) with a hover that feels alive.
- He wants to be shown options side by side before choosing (board colours, rays on or off).
- Report the price and get a yes before spending Higgsfield credits.
- Guest mode is crucial: everything usable without a wallet, nothing saved.
- Short reports. Say what was done, what is weak, and what he must decide.

## Head agent's review checklist

The head agent checks every piece of work against these 14 lines, on the rendered page and the
screenshots, not on the report. Builders: check them yourself before reporting. Skill names in
brackets are the ECC skills the line comes from.

Facts and rules
1. Every number and rule on the page matches `CLAUDE.md` and blueprint section 5.1, which wins
   over older text (the body of `BLITZ.md` still says USDC, top 10 and $200 / $100 / $50; all
   wrong). Blitz: 3 squads of 3 on 3 chosen fixtures, at least 1 from each club, a mandatory ×2
   captain, each squad locks at its own kickoff, 150,000 $ELEVN. Draft: 5 packs of 3, a
   five-a-side with at least 1 DEF, 1 MID, 1 ATT, no goalkeepers, at most 2 per club, opens
   Tuesday, locks at Friday's first kickoff, scores Friday to Monday, 300,000 in all. Every board
   pays the top 5 at 50 / 25 / 12 / 8 / 5; the weekly $500 is $250 / $125 / $60 / $40 / $25.
2. Prize wording is the current rule: final 15 minutes after the day's last match, the winner
   presses Collect, half at once, 20% of the locked balance once every 24 hours, frozen below
   150,000 $ELEVN with nothing forfeited. No "72-hour", no "prizes are sent", no "No entry fee"
   (it is "Play free"), never "daily" or "tonight" for the rhythm (it is "matchday").
3. Nothing removed or parked appears: Season, Squad Battles, league pages or picker, live
   predictions, notifications, per-fixture prizes, a full-time leader bonus, anything from the
   Tokyo video, Blender. Shootout has no prize and no holding, and its board is on its own page.
4. Sample sums are right: SOL and dollar figures agree with the stated rate, shares add up to the
   pot, a locked balance and its next withdrawal follow the 20% rule, and dates fall on the right
   weekday. [loop-design-check: reconcile against the source, do not accept an assertion]

Simplicity
5. One job per screen and one gold button per view (logged out it is "Connect wallet" in the
   bar). A stranger can say what to do next within five seconds at 1440. No panel inside a panel;
   nothing explains in words what a control already shows. [frontend-design-direction]
6. Nothing was added that the task did not ask for: no new nav item, mode, colour, font, badge
   style or dependency. If a block could go without losing a fact or an action, it goes.
   [design-system: information density; taste: coherence beats novelty]

Legibility and accessibility
7. All text is fully visible: no clipping, overlap, or truncated name that matters; no text under
   12px; nothing readable sits behind or inside an effect. Text contrast is at least 4.5:1 (large
   3:1) and control edges 3:1, measured on the rendered pixels, rays and glass included.
8. No horizontal overflow or broken layout at 1440, 1920 and 1024, and the page works at 390.
   Long wallet names and four-digit points fit. [frontend-design-direction: rendered finish gate]
9. Keyboard and semantics: every control is a real button or link with a name, reachable by Tab
   in a sensible order with the 2px gold focus ring; exactly one h1 and no skipped levels;
   targets at least 40px (44px on a phone); state is never colour alone. [frontend-a11y]

Look (glass, steel, gold, rays; consistency with the home page)
10. Only tokens from `web/DESIGN.md` and `mock.css`: near-black, warm white, steel, gold. Gold
    only where its list allows, red only for LIVE and FROZEN, green only on the Draft board, no
    blue light, no decorative gradients. Glass panels have the steel rim and bevel, and dense
    data sits on the dark row fill, never on bare glass. [design-system: colour consistency]
11. It looks like the same site as the home page and the approved mockups: the same bar, wallet
    chip, buttons, type roles (Barlow Condensed capitals for scoreboard text only) and spacing
    scale. Rays only in the top band behind the title, fading out before any panel or text. The
    pack and the fixture card are the shared artwork, not redrawn. [design-system: components]

Behaviour (guest mode, hover, focus, reduced motion)
12. Guest mode works: with no wallet everything can be browsed and tried, nothing is saved, save
    buttons read "Connect wallet to save" in the outlined style, and nothing is a dead end.
13. Every control has hover, focus and disabled states, and a disabled main button shows its
    reason beside it; empty and frozen states are designed. Motion is transform and opacity only,
    uses the duration tokens, shows state or guides the eye, and is static under
    `prefers-reduced-motion`. No tilt or shine outside the Draft packs and fixture cards; no
    parallax, shimmer or confetti. No console errors. [motion-foundations, frontend-a11y]

Reporting
14. The report is short and lists every file, every screenshot (taken after images and fonts
    loaded, and looked at by the builder), what is weak, what the owner must decide, and any
    Higgsfield price awaiting his yes; a LESSONS.md entry is added. A claim with no screenshot or
    measurement counts as untested. [frontend-design-direction: evidence; loop-design-check]

## Lessons so far

## 2026-11-17 · home page agents · title words
- Did: outlined one-word titles for each scroll beat.
- Changed: three times. First behind the ball (hidden letters), then offset but still inside the
  3D scene (first letter dimmed by a shader fade, a page wash and the vignette on wider windows).
  Final: plain HTML in front of the scene, placed from the ball's measured outline.
- Rule for next time: anything that must be read is HTML above the canvas, positioned from
  measured bounds, and checked at 1440x900, 1512x860, 1728x1000 and 1920x1080.

## 2026-11-17 · lead · screenshots that lied
- Changed: a capture showed empty packs because it fired before the artwork loaded.
- Rule for next time: capture scripts wait for images and fonts; a blank or odd still is checked
  in the live DOM before anything is "fixed".

## 2026-11-17 · lead · generated artwork
- How: one shared image per object (pack, card), cut out locally, numbers and labels drawn in
  code on top; hover video masked with the image's own alpha and rescaled to line up.
- Changed: the first hover video was slightly smaller than the still and had to be rescaled.
- Rule for next time: measure the object's bounds in both still and video before cross-fading.

## 2026-11-17 · mockup agents · working side by side
- Changed: one layout bug (a column spilling out of its panel) reached the owner's screenshots;
  a strip picked up another component's styles.
- Rule for next time: one owner per file; new pages get their own stylesheet; look at every
  screenshot before reporting, at the size the owner uses.

## 2026-11-18 · mockup agent · rays and contrast
- Changed: stronger rays dropped one line of text to 3.9:1; shafts were moved and shortened.
- Rule for next time: measure contrast on the rendered pixels after any backdrop change.

## 2026-11-18 · info-news agent · News and How to play mockups
- Did: news.html (lead item, three visibly different item kinds, league filter chips) and how-to-play.html (8 numbered steps with small visuals), each with its own css.
- How: reused mock.css pieces (top bar, glass, .word, .tok, .cap, .lock, .pos) and put the rest in info-news.css / info-how.css; the three news kinds differ by shape (plain card, filled data card, thin outlined headline row) and by a text label plus glyph, never colour alone.
- Changed: SOL amounts wrapped onto two lines in the narrow Collect/Locked boxes; fixed with nowrap. Weekly prize now leads with SOL, dollars grey.
- Rule for next time: any amount in a small box needs white-space: nowrap; check the 390 shot for wraps in figure boxes.

## 2026-11-18 · info-pages agent · FAQ, About, Roadmap mockups
- Did: three read-style pages (accordion FAQ with jump list, About with two mode cards, vertical Roadmap with Done/Now/Next/Later marks), own stylesheet info-pages.css.
- How: copied the top bar from today.html, reused .ph/.word/.rays/.glass from mock.css, wrote only new class names in info-pages.css.
- Changed: my timeline class `.tl` already existed in mock.css as an underline link style, so every line was underlined; renamed to `.rtl`. A shared scratchpad script name was overwritten by another agent, so use a unique script name.
- Rule for next time: grep mock.css for a class name before using it, and keep capture scripts under your own unique filename.

## 2026-11-18 · menu agent · side menu
- Did: `menu.js` + `menu.css`, a glass side panel opened from the top bar's "Menu +", added to the 14 existing screens.
- How: one script swaps the old link for a real button and injects the panel; the top bar stays above the dimmed page so "Close ×" is still visible; `#menu` / `#guest-menu` force it open for captures.
- Changed: first capture clipped the wallet row (a column rule overrode the row layout) and the new button sat 4px off the old "Menu +"; fixed and re-compared `today.png` full page.
- Rule for next time: after replacing an existing control, diff its position against the old screenshot, and check the panel's bottom edge at 1440x900.

## 2026-11-18 · head agent · review of News and How to play
- Verdict: approve with changes. Facts are right; six fixes (weekly prize written as "$500" first,
  "a matchday" not "a day", lead text clear of the rays, the league filter, gold used as decoration,
  a stretched badge).
- Measured: the News lead text sits on a ray at 1024 and drops to 4.4:1.
- Rule for next time: click every control you add and screenshot the result; a filter that hides
  cards must leave the layout tidy. Keep header text clear of the rays at 1024 as well as 1440.

## 2026-11-18 · head agent · review of FAQ, About and Roadmap
- Verdict: approve with changes. FAQ is close to done; About said "no entry fee" and "prize is
  paid"; Roadmap listed live predictions, which the owner parked.
- Rule for next time: search your copy for the banned phrases before reporting ("entry fee",
  "is paid", "are sent", "72-hour"), and never show a parked feature as coming.
- Rule for next time: anything shaped like a button must do something; plain facts are plain text.

## 2026-11-18 · head agent · review of the side menu
- Verdict: approve with changes. Focus trap, Escape, scrim, focus return and reduced motion all
  work. Faults found only by using it: the page behind scrolls and the panel comes away from the
  bar; at 390 "Close ×" is pushed off screen.
- Rule for next time: a menu holds only what the bar does not already show (no second wallet
  chip, Winnings or Connect button), and an overlay is tested scrolled, at 390 and at a short
  window, not only in the opening screenshot.
- Shared bug for the lead: in `mock.css` the reduced-motion rule for `.rays i` loses to the
  `:nth-child` rules above it, so the rays still drift under reduced motion on every page.

## 2026-11-18 · info-pages agent · review changes
- Changed: "paid" became "collected" in About; Live predictions removed from the public roadmap; panel-inside-panel and monospace removed; league pills made plain text; gold inline link made a normal link; status key dropped; Build list numbered; two FAQ items and the cancelled-match rule added; side menu wired in.
- Rule for next time: public pages never promise a parked item, never say prizes are "paid"/"sent" (winners collect), and use no inline styles or fonts outside Sora and Barlow Condensed.

## 2026-11-18 · menu agent · review fixes
- Changed: the panel showed colour from the page because `var(--glass)` already contains its own translucent colour layer, so a solid fill placed after it was ignored; used an explicit gradient over a solid #0b0c0e. Also removed what the bar already shows (wallet block, Winnings, MENU title), locked page scroll, made the button icon-only at 390, and fixed three shared faults (rays under reduced motion, 38px bar targets, wrong current tab on Shootout/Connect).
- Rule for next time: a token that bundles several background layers cannot be reused as one layer; and check with pixel samples, not by eye, that a panel is really opaque.

## 2026-11-18 · info-news agent · review changes to News and How to play
- Changed: filtered news lopsided because items sat in two fixed columns (now one CSS-columns flow); lead text sat on a ray (44ch cap, 30ch at 1024; measured 7.65:1 at 1440, 7.75:1 at 1024 on rendered pixels); gold used for plain rank numbers (now steel); fact cards repeated steps 1 and 3 (removed); "daily"/"a day" used for the Blitz rhythm (now matchday).
- Rule for next time: lists that can be filtered use one flow, never hand-split columns; gold only means a paid place or the captain; measure lead contrast at 1024 as well as 1440.

## 2026-11-18 · info-pages agent · public roadmap and X link
- Changed: Roadmap now leads with one "Building the platform" (Now) stage whose closed drop-down holds the internal stages; public stages follow. About's X button points to the real account and opens in a new tab with a screen-reader note.
- Rule for next time: a public page shows what players need; internal stages go behind a closed `<details>`, as a plain list, not a card inside a card.

## 2026-11-18 · head agent · second pass on the info pages and the menu
- All 18 earlier must items were fixed. Three new faults came from the fixes themselves: a shared
  class name (`.lbl` in `info-how.css`) restyled the menu button on one page; gold came back as
  list numbers on the Roadmap; `scrollbar-gutter: stable` narrowed every screen by 15px in captures.
- Rule for next time: scope every new class under your page's own prefix, and after a shared
  change re-capture one product screen and compare it with the committed shot before reporting.
- Rule for next time: a screenshot taken under 200 ms after a click shows the transition, not the
  result; wait for it to finish.

## 2026-11-18 · draft agent · shortening the Draft screen
- Did: Draft at 1440 went from 3,684px to 1,785px (guest 1,822). New own stylesheet `draft-page.css`; the three pages are generated from one template so they cannot drift. Header and lock/pot/holding bar are two slim rows; packs and the opened-pack reveal share one glass shelf (packs left, three players of the selected pack right); "Your fifteen" is 5 rows (one per pack, columns Top / Mid / Budget) beside the five-a-side board; prizes are a 5-cell strip under the fifteen; the six rule checks are one slim full-width strip.
- How: the column headers carry the tier, so each player chip needs only name, position, club and a word plus tick for "In five"; sealed packs are one dashed row each. The pitch rows were placed from the measured line and label heights.
- Changed: the first board put the midfield line through two names and the DEF label on the bottom line (pitch rows are absolutely placed, so any height change needs the rows moved); the rules list wrapped in a half-width column, so it became a 3x2 strip.
- Rule for next time: when shrinking an absolutely positioned board, re-place every row and crop-check the lines against the labels; when a text list wraps, change the container, not the words.

## 2026-11-18 · head agent · review of the shortened Draft screen
- Verdict: approve with one small change (the "READY" badge in the rules strip renders as indented
  text at 1440 and 1920). Height 3,684px to 1,785px with every rule and number intact, no overflow,
  no text under 12px, contrast and control edges pass, guest state correct.
- What made it work: nothing was deleted to save height. Lists became rows (one row per pack),
  panels were merged (packs and reveal on one shelf), and two columns replaced a stack.
- Rule for next time: to shorten a page, merge and re-flow first; cut content only when it is said
  twice. Check each small badge at every width, not only the one you built at.

## 2026-11-18 · phone agent · phone polish of the product and info mockups
- Did: one-row top bar (compact chip, Winnings moved into the menu's quiet row on phones), a shared bottom tab bar (`tabbar.js`, built from the top bar's own links), single-column rules for every screen, FAQ jump list as a `<details>`, banked and connect dialogs that fit 390x844, softer rays and page bloom on phones; reduced-motion pack hover override.
- How: all phone rules sit in `@media (max-width: 700px)` blocks, so 1440 and 1024 captures stayed pixel-identical (checked before/after with and without reduced motion). Contrast measured on rendered pixels with the text hidden, worst case over the brightest 2% of each text box.
- Changed: `isMobile` pages report `innerWidth` as the widened layout width, so the first overflow check looked clean while three pages overflowed; use the real `scrollWidth` and a fixed width. Fixed bars float mid-page in full-page captures; resize the viewport to the page height first. A rule meant for the top-bar chip also hit a chip drawn inside How to play; scope phone rules under `.nav`.
- Rule for next time: pages with inline styles need a class hook before they can be made responsive; add one rather than fighting the style attribute. A `<details>` that must look static on desktop needs the label wrapped so the line height stays identical.

## 2026-11-18 · head agent · review of the phone view
- Verdict: approve with two small changes. All 18 screens work at 390 and 430 (no sideways scroll,
  no text under 12px, tab bar and menu correct). Desktop is pixel-identical before and after on
  every screen except one line on Blitz pick, where a span added for the phone widened a gap.
- Rule for next time: a wrapper added to the HTML for one width changes every width; when the
  parent is a flex row with a gap, the new span becomes its own item. Diff desktop renders after
  any HTML change, not only CSS ones.
- Rule for next time: a full-page capture draws a fixed bar wherever the first screen ended. Hide
  or un-fix fixed bars for full-page shots, and discount contrast readings taken under them.

## 2026-11-18 · home-cards agent · Blitz "one from each club" rule and the home page phone view
- Did: the three fixture cards now stand their players in a HOME column and an AWAY column (2+1, 1+2, 2+1, captain on either side) with Barlow Condensed labels under the columns; the phone view (900px and under) is one block per beat: that beat's still of the ball on top, words below, cards and packs in a sideways row with snap, "+" menu button in the bar.
- How: the side labels went at the bottom of the card because the artwork's stripe crosses the top right; the phone stills are the existing `poster/beat-N.jpg` files placed with CSS variables (picture height, ball position, band height), so no script change was needed. Tap gives the hover state through focus.
- Changed: text over a dimmed live ball was replaced by stills above the text (lowest contrast now 5.55:1, measured on pixels); a contrast script that samples a button's whole box reads the page behind its rounded corners, so sample inside the pill.
- Rule for next time: on a phone put pictures above the words, not behind them; and when another agent is editing the scripts at the same time, a capture that times out is retried before anything is "fixed".

## 2026-11-19 · home-perf agent · soft ball and lag on the owner's Mac
- Did: the ball draws in 41 calls instead of 249 (instancing), the page chooses its quality by
  watching real frame times all the time (effects are dropped before pixels, and it steps back up),
  the scroll follows like a damped spring, `?stats=1` shows real numbers, and the Blitz, Draft and
  access beats each have their own view of the ball.
- How: found the soft ball by reading the tier code, not by guessing: one slow reading in the first
  second sent a 2x screen to 1 pixel per CSS pixel for good. Checked each suspected cause before
  fixing it; one (a shader compiled in mid-scroll) turned out not to happen, and then did happen
  after my own change, so it was counted again afterwards.
- Changed: `canvas.clientWidth` was read every frame after the frame had written to the page (a
  layout each frame), and `--scrim` was set on the root element (a restyle of the whole page each
  frame). The first "before" figures came from a checkout that already held my edits, because work
  in progress is committed automatically; they were retaken from the real earlier commit.
- Rule for next time: anything that picks quality by timing must discard start-up frames, decide
  on a run of frames, drop effects before resolution, and be able to step back up. Never read a
  size inside the frame loop; set a CSS variable on the element that uses it, not on the root.
- Rule for next time: a "before" measurement names the commit it was taken from.

## 2026-11-19 · home-css · Home page: no per-frame repaint in the cards, packs and bar
- Did: replaced the animated `filter: drop-shadow() brightness() saturate()` on `.pack-body` with a fixed shadow layer and a hot-glow layer (a copy of the art outline under the artwork, fixed `drop-shadow`, glow fades by opacity) plus a black dim layer (`.pack-dim`) whose opacity follows `--open` and the hover; the foil sheen now slides with `transform`; the bar lost its `backdrop-filter` (fill .94); card text is at least 12 CSS px; the phone stills were retaken and `--fx/--fy` recentred for beats 4 to 6.
- How: Chrome trace (`Paint` events by node) over a scripted p 0.5 to 0.8 sweep, before and after, on a copy of the old CSS served beside the new one.
- Changed: the first version (shadow and dim as `::before` or masked layers reading the art through `var(--mask)`) was worse: every pack repainted every frame. A `url()` read through a custom property that changes each frame is resolved again each time and repaints. Fix: set the image as a real value on each layer from JS (`outline()` in `icons.js`). The old cause of the repaints was also this, on `.pack-sheen`, not the filter (Chrome re-filters a changed `filter` on the GPU without a Paint event).
- Rule for next time: never read an image or clip through a `var()` on an element inside a subtree whose variables change every frame; set it inline once. Measure with a trace before and after, not by reading the CSS.

## 2026-11-19 · head agent · review of the home page round
- Verdict: approve with changes. Kept: 2x canvas really is 2880 x 1800 with crisp edges, 41 draw calls, nothing drawn at rest, title words 19 px or more clear of the ball at 1440 and 1512, HOME / AWAY columns, phone view (no sideways scroll, no target under 44 px).
- Must change: the frame timing blocks the page (two `readPixels`) on every fourth frame for ever, so it should back off once the level is steady; a "hopeless" drop to `min` takes about 48 s of drawing to climb back on a 2x screen; the ×2 badge is 8 px and PACK N is 11.8 px at 1440; the Blitz notes wrap at 1512 x 860; the prizes band says "pays" where the rule is "final, then the winner presses Collect".
- Rule for next time: a measurement that waits for the graphics card is itself a cost; take it often only while deciding, then rarely. And a "text is 12 px or more" claim is checked by listing every text node's rendered size, badges included, not by reading the CSS.

## 2026-11-19 · home-perf agent · frame timing that does not stall, and quick recovery after a stall
- Did: the home page no longer waits for the graphics card to time frames (GPU timer query where the browser has it, else the gaps between animation frames; a read-back only 1 frame in 30, only below `high` or with `?stats=1`). A stall drops to `low`, never `min`, and climbs back one lot per level with probe frames at rest. A slow computer skips a level; the settled level is kept for the tab; the engine follows a move to another screen; `?stats=1` shows the timing method and when the level last changed.
- How: the decision rules are one function with no page in it (`makeWatch`), fed simulated frame times with a simulated clock: steady 8 ms, one 900 ms frame, a stall over three frames, steady 40 ms, borderline noise, a 30-frames-a-second cap, stall bursts for ever. Stills compared byte for byte before and after.
- Changed: my first stills check compared three blank images (`toDataURL` on a WebGL canvas in a later task is empty; draw and read in the same task). A count of read-backs made by drawing 180 frames in one loop queued a minute of work in software WebGL and made everything after it look broken; one draw per animation frame fixed it. The GPU timer exists in headless software WebGL but stops answering, so the fallback had to be built and is what was tested. Frame gaps there read 16.7 ms while a frame cost 250 ms (nothing waits for a screen), so "a fifth of the frames very late" also counts as slow.
- Rule for next time: write quality rules as a pure function and test them with fed numbers before opening a browser. Any asynchronous measurement needs a "no answer" path. Check that a "pixel-identical" comparison is not comparing blanks: the three stills must differ from each other.

## 2026-11-19 · draft agent · rule checks under the board
- Did: moved the six "Team rules" checks from the full-width strip at the bottom into the right column, directly under the five-a-side board, in `draft.html`, `draft-guest.html` and `draft-steel-green.html`. Order in the column: board, checks, then the Save button with its reason line. Words, ticks, eyebrow and badge unchanged. Height at 1440: 1,785 to 1,792 (guest 1,822 to 1,829).
- How: checks are 2 columns of 3 at 13px with auto-width columns from 1360px up, one column from 1101 to 1359, two equal columns at 1024 and below, one column at 390. The prize card now stretches (flex) to the board's height on desktop so the left column has no hole.
- Changed: with equal columns the longest lines wrapped to two rows (the column is only about 500px), so the columns became auto-width and the card padding and row padding were tightened; the first try made the page 68px taller.
- Rule for next time: when a strip moves into a narrower column, measure the longest line first; tighten the container before shrinking text. A stretched card centres its content, so the extra height shows as empty space inside the prize card (about 80px above and below at 1440).

## 2026-11-19 · head agent · review of the Draft rule checks move
- Verdict: approve with changes. The move itself is right on all three pages: the checks sit
  directly under the board, same six lines, eyebrow and badge, then the save line and its one
  outlined button; no word, number or rule changed; no overflow, no text under 12px, no console
  errors; check text 10.6:1 or better on the rendered pixels; the board is untouched.
- What did not work: (1) from 1360 to 1435 wide the two long checks wrap to two lines, and at
  1440 the two columns fit with 2px to spare; the builder's breakpoint (1360) was never rendered.
  (2) The stretched prize card has 82px of empty glass above and below its content at 1440 and
  140px at 1280, which reads as a card that failed to load; it was also not asked for.
- Changes required in `draft-page.css`: delete the `@media (min-width: 1101px)` block that
  stretches `.dp-left` and `.dp-prz` (the left column then ends 132px short at 1440 and wider,
  about 250px short from 1101 to 1439; the owner decides if that needs filling); set `.dp-rules`
  padding to `var(--s2)`; add `white-space: nowrap` to `.dp-rules .checks li`; move the
  one-column band's upper limit from 1359px to 1439px. Tested by injection at eight widths.
- Seen but not from this change (same at HEAD): from 1101 to about 1359 the position chip and
  club name overlap in the "In five" player chips of the fifteen.
- Rule for next time: when a breakpoint is chosen, render 1px each side of it and the narrowest
  width of each band, and count the lines of the longest string. Never fill spare height by
  stretching a card around fixed content; let the column end short and report the gap.

## 2026-11-19 · lead · applying the head agent's Draft fixes and republishing
- Did: removed the prize card stretch, kept the six checks on one line each (one column from 1101 to 1439 wide, two columns from 1440), republished the screens.
- Changed: the screens link was behind the repo (it had no `draft-page.css` or `tabbar.js` and an older `mock.css`), so the owner had been looking at an older Draft and phone view.
- Rule for next time: after any mockup change, republish every file and compare `list_files` against the folder; render the widths either side of every breakpoint you add.

## 2026-11-19 · head agent · review of the Draft chip overlap fix
- Verdict: approved, with one tidy-up (no visual change). Rendered again by the head agent on
  draft, draft-guest and draft-steel-green at 1920, 1440, 1439, 1366, 1280, 1200, 1101, 1100, 1024
  and 390: no overlap of badge, club and tick, no cut name or club, nothing outside a chip, pack
  labels and the six Team rules each on one line, no sideways scroll, no console errors. At 1440
  and wider and at 1100 and narrower the chips are the same as before the change (same sizes; the
  panel screenshots match pixel for pixel, bar one stray pixel at 1100).
- What made it work: the fix removed the thing that did not fit (the words "In five") instead of
  shrinking everything, and let long names wrap rather than cut them. The tick is a shape, the
  chosen chip also has the brighter edge and lighter fill, and the board beside it shows the same
  five, so the state is not colour alone. The old CSS really was broken from 1101 to about 1290
  and had no spare room up to 1439, so the band is the right size and matches the Team rules band.
- Weak: between 1101 and 1439 no words on the screen say what the tick means, and a short name
  sitting beside a wrapped one leaves an empty line in its chip (Mbappé at 1280). Both are
  acceptable. Tidy-up asked for: the comment "1024: two columns become one" now sits above the
  new band instead of above `@media (max-width: 1100px)`; move it back.
- Rule for next time: when a row runs out of room, drop or move the least important item and let
  names wrap; never let flex items shrink below their text. Test every 20px across a band, not
  only its two ends, and run the old CSS through the same measurements to prove the outside of
  the band did not change.
