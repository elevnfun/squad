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
