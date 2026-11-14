# taste-skill effects (vendored)

`fx.js` and `grid-pulse/effect.js` are copied unchanged from Leonxlnx/taste-skill
(commit 9b4bf937, `skills/taste-skill/assets/effects/`), MIT licensed. Reviewed before use:
canvas 2D only, no network, pauses off screen and under reduced motion.

One change in `fx.js` (line ~874, the dynamic `load()` path elevn doesn't use): `new URL('./',
import.meta.url)` became a string replace, because Next.js's webpack tries to bundle that pattern
as an asset and fails.
