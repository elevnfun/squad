# Section 3, step 4: Penalty Shootout (short plan)

Written 2026-11-21. Owner's rulings that day: the rules below; the screen must feel like a game
(a real goal, a goalkeeper who dives, a ball that flies), not a grid of squares.

## Rules

- A side game: no prize, no $ELEVN needed. Ranked games need a connected wallet (10 a day per
  wallet, UK day); practice is unlimited and works for guests.
- A game is five rounds. In each round the player takes one penalty and faces one.
  - Shooting: pick left, centre or right, and a power (low, medium, high).
  - Keeping: pick left, centre or right.
- A shot can miss the goal: low never, medium 1 in 10, high 1 in 4.
- If the keeper went the right way, the shot is saved: low always, medium 6 in 10, high 3 in 10.
  Otherwise it is a goal.
- The opponent is another player's stored picks from an earlier game (a random set when none
  exists), so there is no queue. The opponent's picks are never sent to the browser before the
  round is played. The server rolls the dice.
- Most goals after five rounds wins; level is a draw.
- The board: today's ranked games, by wins, then goal difference, then goals.

## Pieces

| Work | Files | Model |
|---|---|---|
| Engine, tables, routes | `squad/shootout.py`, `db/schema.sql`, `config.toml`, `squad/api.py`, tests | Sonnet, lead reviews |
| The game screen and its board | `web/src/app/(site)/shootout/` | Sonnet, head review |
| Today's small card and the side-menu link | `today/`, `Header.tsx` | Sonnet |
