# Video session handoff (written 2026-11-21)

For a new session that continues the elevn X promo video. Read `docs/design/video/PROMO_STORYBOARD.md` first
(shots, sound plan, prices, test notes). Do not touch `web/`, `squad/` or build code. Keep files under `docs/design/video/`.

## Owner's rules for this work
- Never spend Higgsfield credits without telling him the price and getting a yes. Katana's own "never ask" rule is overridden.
- Made with Higgsfield Katana. Football is a realistic broadcast-style night match, Man City v Chelsea, real kits and players,
  scorer Haaland (the same player is captain on the laptop, with Foden and Palmer). The owner lifted the rules on competition logos,
  trophies, sponsor names, broadcaster logos and names on shirts (2026-11-21): none of those are restricted any more. Files need no "DRAFT" label.
- Prize amounts in SOL only (the $500 weekly is the exception). "Blitz matchday", never "daily". No blue light. No invented earnings claims.
- Music is the owner's mp3 (42.06 s, 80 BPM, drop at about 8.0 s). Never replace it. Duck it for crowd moments and bring it back on a beat.
- Short, plain replies. Tell him what is weak.

## State
- Credits: balance about 989.8 (started this work at 1,130.53). Spent 140.75: street test 35, Man City test 35, clip B 35, room clip 35, room still 0.75. Nothing pending.
- Made so far (all in `docs/design/video/`): `tests/test-shot-2-city-chelsea.mp4` (clip A), `tests/test-clipB-goal.mp4` (clip B, the goal),
  `room/room-still-1.png`, `room/room-clip-C.mp4` (student in the dorm), `screens/` (two video screens), and
  `sections/section_goal_to_platform_v3_sfx.mp4` (0-14 s, music + free effects; this is the current preview).
- Section design (8.0-14.0 s): slow-motion goal, pull-back into the TV, room, whip down, push through the laptop, goal effect on the board.
  Joins were checked frame by frame (details in the storyboard).
- Not done: the crowd roar, the dribble crowd build and the viewer's shout (generated audio, about 8 credits, NOT yet approved);
  everything from 14 s to 42 s (tabs, Blitz pick, Draft packs, leaderboards, Winnings and Collect, end card); the final mix (-14 LUFS target).
- Katana session `/katana/chrome-noir-style-edit` expired 03:11 UTC; open a new one with `get_katana_config` (free_generation false)
  before any generation, and pass its `preset_session_id` on every generation.

## Build notes
- Higgsfield sandbox working folder `~/w` (kept 24 h after last use): `in/` (A, B, C clips), `A/ B/ C/` (frames), `scr/` (rendered screens),
  `track.json` (TV and laptop quads from clip C), `comp.py` (compositor), `out/` (section frames), `seq/` (14 s frame list), `audio/` (effects bed),
  `cues.json`. Music at `~/ref/track.mp3`. If the sandbox was replaced, the clips are re-downloadable from the job result URLs
  (clip A job 4f7e2723, clip B job fb33ce06, clip C job 0703cc98) and the screens from `docs/design/video/screens/`.
- The sandbox client times out at 60 s per call: run long jobs in the background, upload results from the same command, then confirm with
  `media_confirm` (type video, audio, image or file, one call per type).
- Audio: AAC encoding overshoots; check true peak after encoding and keep it at or below -1.5 dBTP.
- Screens are copies of the mockup pages (real names, SOL only, no dollar values beside prizes). The mockups themselves are untouched.

## Permissions
`.claude/settings.json` allows `mcp__Higgsfield__sandbox_exec`, `media_upload` and `media_confirm` without prompts, but only in sessions that
start after it is on the branch. Credit-spending tools still ask.
