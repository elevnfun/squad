# The debate on blueprint draft v1 (2026-11-14)

Two agents read the draft, the six-formats doc, README.md and config.toml. The advocate argued
for the plan, the critic against. Each then answered the other.

## Advocate, opening
- Each mode covers another's gap: Blitz when matches are on, Draft as an appointment, Battles and
  Shootout always open.
- Buildable: scoring.py scores each player per match; ingest.py polls live; holdings.py gates on
  150,000 $ELEVN; payouts.py pays one batch every 24 hours.
- SOL only for skill modes; one holding unlocks everything; four tabs.
- Asked for: Today hub built with Blitz; one pick from each club; SOL on the matchday table only;
  position guarantee in packs; rollover on empty days; stored opponents; form normalised per
  league; a stated payout rule for small prizes.

## Critic, opening
1. Calendar: three leagues play Friday to Monday; "daily" is false on about half of all days. Fatal.
2. Prize dilution: the pool is already topped up to 1 SOL a week; splitting it by day, mode and
   fixture leaves dust. Fatal.
3. Sybil farming: entry is only resellable capital; per-wallet packs are a re-roll per wallet;
   the 72-hour hold is only proposed. Serious to fatal.
4. Gambling exposure: token as consideration, packs as loot boxes, simulated battles for SOL,
   daily fantasy licensing. Fatal if ignored.
5. Battles fairness: deterministic is solved, random is a coin flip; single-league elevens on one
   ladder; stale form in breaks. Serious.
6. Data budget: 7,500 requests a day; player stats are polled per fixture per minute. Serious.
7. Scoring fit: ties with three players; defenders outscore forwards; goalkeeper either
   mandatory or dead. Serious.
8. Complexity: five games, four scoring contexts, three prize rhythms. Serious.
9. Thin player base: empty boards and queues. Serious.
10. 3D home page: weight on mid-range phones in in-app browsers. Minor to serious.

## Advocate, rebuttal
Conceded 1, 2, 3 and 9. Partly conceded 4, 5, 7, 8 and 10. Rejected 6: Blitz and Draft read rows
the weekly game already polls, and the live loop already pulls a full-time state. Found that
`min_holding_hours` is in config.toml but not used anywhere in squad/. Refused to give up: the
pack reveal and five-a-side rules, the four tabs with Today as the entry point, and one scoring
engine with the existing payout batch.

## Critic, rebuttal
Accepted: Today hub with Blitz, SOL on the matchday table only, rollover, stored opponents,
one-day Draft window, Blitz beside Season, ladder-only Battles. Asked for more: shared Draft
packs, no goalkeepers in Draft, best two fixtures with a cap of five, a rating band, form floor
and ladder pause, weekly payout with a hold-through condition in place of "paid in full next
batch", top 10 paid, Draft only with four or more fixtures. Closed attacks 5 and 9. Still open:
gambling exposure (until legal sign-off), sybil rules, prize size, scoring fit, a worst-Saturday
request simulation, wording, staged release, poster-first home page.

## Checked against the code
- Player stats are polled per fixture every 60 seconds (squad/ingest.py, live_loop): true.
- The new modes add no API calls, since every launch-league match is already polled: true.
- `min_holding_hours = 72` is not enforced in squad/: true.
- Whether 14 November 2026 falls in an international break was not checked (no fixture data in
  this session).
