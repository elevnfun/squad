# elevn (squad repo)

## CRUCIAL: project outline for elevn 2.0

Read `docs/blueprint/BLUEPRINT.md` before any work on game modes, navigation or the home page.
It is the plan of record. Do not build anything in it until the owner has approved it.

The project runs in four sections, in this order:
1. Blueprint and planning: `docs/blueprint/BLUEPRINT.md`, debate record in `docs/blueprint/DEBATE.md`.
2. Design: design and motion on top of `web/DESIGN.md`. References: elevn.fun, rive.app (motion,
   layout, how sections connect), and the 3D website guide summarised in the blueprint, section 6.
   Crucial visuals are built in code, with no AI-generated imagery.
3. Functionality confirmed: build and test each mode.
4. Trial and error.

Owner's decisions (2026-11-14):
- Matchday Blitz and Daily Draft are the two main modes.
- Draft: 5 packs of 3 (15 players) across the three leagues; a five-a-side with at least
  1 defender, 1 midfielder, 1 attacker; no goalkeepers; at most 2 players per club. Packs are the same for everyone.
- Blitz: a team of 3 for each fixture (at least 1 player from each club); the matchday total
  is the sum of all fixture teams, on a live leaderboard.
- Results must feel instant: Blitz pays a prize per fixture at full time (half the Blitz pot) and a
  matchday prize (the other half); prizes are credited at once and paid in the next daily batch.
- Prize split 40% Blitz, 40% Draft, 20% Season for now.
- Section 2 design goes through the Higgsfield MCP, with the references.
- Squad Battles is in, as one ladder across all three leagues.
- Penalty Shootout is a side mini-game. Live predictions are parked.
- Above all: do not overcomplicate the platform or let it get jumbled.

Background: `docs/blueprint/reference/six-formats.md`. Every game number lives in `config.toml`.
