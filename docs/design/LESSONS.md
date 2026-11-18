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
