# Section 3, step 3: Draft (short plan)

Written 2026-11-21. Rules: blueprint section 3.2 and `CLAUDE.md` (Draft, 2026-11-19). Numbers:
`[draft]` in `config.toml`.

## What this step delivers

A wallet holding 300,000 $ELEVN opens its 5 personal packs of 3 (one Top, one Mid, one Budget in
each), builds a five-a-side from the 15 with a captain, and saves it before Friday's first kickoff.
The team scores every match its players play from Friday to Monday and appears on the Draft weekly
board. A guest gets sample packs and can build a team, but nothing is saved.

## The rules in code terms

- A week's contest already exists (`contests`, kind `draft_week`, `locks_at` = Friday's first kickoff).
- Packs: dealt once per wallet per week into `draft_packs`, fixed, no re-rolls. Only outfield
  players whose club plays in the window. Tiers by value: the top 20% of eligible players are Top,
  the next 30% Mid, the rest Budget. Every 15 has at least 2 defenders, 2 midfielders, 2 attackers.
- Team: 5 of the wallet's 15, at least 1 DEF, 1 MID, 1 FWD, at most 2 per club, at most 2 Top and
  2 Mid, one captain. One row in `entries` (slot 1) with 5 rows in `entry_players`.
- Lock at `locks_at`. After it the team changes only by the swap rule.
- Swap: a player whose match is postponed or cancelled is replaced by the highest-valued unused
  player in the same position from the wallet's 15 whose match has not kicked off; if none, the
  slot scores 0. The manager may do it by hand first; otherwise it is automatic.
- Points: every match a player plays in the window counts; the captain is doubled.

## The pieces

| Order | Work | Files | Model |
|---|---|---|---|
| 1 | Packs, team rules, lock, swap, scoring | `squad/draft.py`, `tests/test_draft.py` | Sonnet, lead reviews |
| 2 | API routes and the minute job | `squad/api.py`, `squad/jobs.py`, `tests/test_api_draft.py` | Sonnet, lead reviews |
| 3 | Draft page (packs, reveal panel, board, rule checks, guest) and Today card | `web/src/app/(site)/draft/`, `today/` | Sonnet, head review |
