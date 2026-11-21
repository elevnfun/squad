# Section 3, step 2: Matchday Blitz (short plan)

Written 2026-11-21. Rules: `CLAUDE.md` (the block "Rules changed on 2026-11-17 and 2026-11-18" wins)
and `docs/blueprint/BLITZ.md` sections 2 and 5. Numbers: `[blitz]` in `config.toml`.

## What this step delivers

A wallet holding 150,000 $ELEVN picks up to 3 fixtures of a matchday, builds a squad of 3 on each
(at least 1 from each club, one captain on double points), sees them lock at each kickoff, score
live and get banked, and sees its line on the Blitz matchday board. A guest can do all of it
without saving. Prizes, release and Collect already exist from step 1.

## The rules in code terms

- A matchday contest already exists per UK date (`contests`, kind `blitz_matchday`). A squad is one
  row in `entries` (slot 1 to 3, `fixture_id`, `captain_id`) with 3 rows in `entry_players`.
- Squads allowed = min(3, fixtures that day). One squad per fixture.
- A squad can be saved, changed, moved to another fixture or removed until its fixture kicks off.
  At kickoff it locks (`entries.locked_at`) and never changes again.
- Points: the scoring engine's per-match points for each of the 3 players in that fixture, match
  bonus on, no Rising Stars, captain doubled. Stored in `entry_scores`.
- States of a squad: open, locked, live, full time (provisional), banked (final). Banked = the
  fixture has ended, 15 minutes have passed and final stats are in. Banked points never change.
- A postponed fixture never locks; a squad left on it scores 0. An abandoned match keeps the
  points earned.
- Matchday total = sum of the wallet's squads. Ties: more captain points, else the prize is split.
- Saving needs a signed-in wallet holding the requirement. Checking a squad needs nothing.

## The pieces

| Order | Work | Files (one owner each) | Model |
|---|---|---|---|
| 1 | Squad rules, saving, locking, scoring, a wallet's view | `squad/blitz.py`, `tests/test_blitz.py` | Sonnet, lead reviews |
| 2 | API routes and the minute job | `squad/api.py`, `squad/jobs.py`, `tests/test_api_blitz.py` | Sonnet, lead reviews |
| 3 | Pick page (fixtures, full squads, 3 slots, captain, guest mode) | `web/src/app/(site)/blitz/` | Sonnet, head review |
| 3 | Today card states, "your line" on Ranks, Banked screen | `today/`, `ranks/`, `web/src/app/(site)/blitz/banked/` | Sonnet, head review |

## API

- `GET /api/blitz/{day}`: the matchday's fixtures, each club's full squad, kickoff times, and the
  caller's squads if signed in.
- `POST /api/blitz/check`: validates a squad, saves nothing (guests).
- `PUT /api/blitz/{day}/squads/{slot}` and `DELETE`: save, change or remove a squad.
- `GET /api/blitz/{day}/mine`: the wallet's squads with state and points, matchday total, place,
  and the prize if the matchday ended now.

## Not in this step

Sharing the Banked card to X, notifications, confirmed line-ups an hour before kickoff (shown only
if the data is already stored), Draft, Shootout, retiring Season.

## Known limits carried in

- A match's end is estimated as kickoff + 2 hours until real full-time times are stored.
- Fee income still goes to Season's pots until Season is retired, so Blitz pots are the reserve
  top-up minimum for now.
