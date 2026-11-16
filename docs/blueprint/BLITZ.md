# Matchday Blitz: revised rules and payouts

**Owner's update, 2026-11-14 (overrides the text below):** every prize is paid in SOL while the
site is on devnet, the weekly $500 included as its SOL equivalent; the weekly prize comes from
creator fees when they cover it and from project funds when they don't.
Also settled since: Season is removed and Draft is weekly, so the overlap note in section 4 no
longer applies; holding 150,000 $ELEVN is the confirmed access rule for Blitz; a captain is
mandatory in every squad. Wherever the text below says USDC, read SOL while on devnet.
The weekly $500 is paid from the team's own wallet. The 72-hour hold does not apply to the daily
prize, only to the weekly prize. A wallet gets one entry (3 squads) a matchday however much it
holds, and can play the moment it holds the tokens. Notifications are a feature for the future.
The daily board and the weekly $500 each pay the top 5, not the top 10. Ties: more captain points
wins, then the prize is split; there is no "saved earlier" step. A pot with fewer than 3 entrants
rolls forward. The edge cases in section 5, one squad per fixture, line-ups shown and the match
bonus are confirmed. A review switch lets the owner approve prizes before they are sent.

**For:** the main build agent working on elevn 2.0
**From:** the owner, 2026-11-14
**Replaces:** blueprint section 3.1 (Matchday Blitz), the Blitz parts of section 5 (Prizes and access)
and the Blitz items in section 9 (Decisions). Everything else in the blueprint is unchanged.

Tags, as in the blueprint: **[Owner]** = decided by the owner, build as written.
**[Proposed]** = recommended and not yet confirmed; build it this way unless the owner says otherwise,
and list it in your summary so the owner can confirm. **[Open]** = the owner must decide before launch.

---

## 1. Why this changed

The old Blitz design asked players to make a team for every fixture of the matchday, and paid a
separate prize per fixture (top 3 at full time) plus a matchday prize. A review found three problems:

1. **Too much to do.** On a 10-fixture Saturday a player had to set 10 teams (30 picks, 10 captains)
   to compete for the matchday prize, because a skipped fixture scored 0. The matchday prize went to
   whoever filled in the most forms.
2. **Forced fixtures.** Players had to build teams for matches they don't care about (for example
   Coventry v Leeds) or fall behind.
3. **Prizes too small.** Splitting the pot across up to 10 fixture boards × 3 places left a few
   dollars per prize, and ties on popular captains split them further.

The new design: each player picks **3 fixtures of their choice** per matchday, there is **one daily
leaderboard**, the daily prize is paid **at the last whistle of the day**, and there is a fixed
**$500 USDC weekly prize**.

---

## 2. The rules

### 2.1 Building squads
- On each matchday a player builds **3 squads**, one per fixture, choosing any 3 of that matchday's
  fixtures from any of the launch leagues (Premier League, La Liga, Bundesliga). [Owner]
  - Example: User A picks 2 Premier League matches and 1 La Liga match. User B picks 1 Bundesliga,
    1 Premier League and 1 La Liga match. Both compete on the same daily leaderboard.
- Each squad is **3 players from that one fixture**, with **at least one player from each club**,
  and **one captain** (double points). [Owner] Choosing a captain is mandatory: a squad without
  one cannot be saved. [Owner]
- A player may choose each fixture only once (no two squads on the same match). [Proposed]
- The UI says "3 squads", not "up to 3". Fewer squads is allowed, but every empty slot scores 0, so
  the UI should push players to fill all 3. [Owner]
- On a matchday with fewer than 3 fixtures (common on Fridays and Mondays), the number of squads is
  the number of fixtures. [Owner]
- Confirmed line-ups are shown about an hour before each kickoff so players can swap out a
  non-starter. (Carried over from the blueprint, still [Proposed].)

### 2.2 Locking
- **Each squad locks at its own fixture's kickoff.** [Owner]
- Until a fixture kicks off, the player can add it, change its players or captain, or swap it for
  another fixture that has not kicked off. [Owner]
- This means a player picking an evening fixture can see the live leaderboard and knows what score
  they need. The owner accepts this as part of the game (it keeps people engaged all day). **State it
  in the rules page** so nobody discovers it as an "exploit". [Owner]
- Once a squad is locked it cannot be changed, even if the player's other squads have not started.

### 2.3 Scoring
- The existing scoring engine, no Rising Stars, match bonus switched on. (Blueprint, [Proposed].)
- The player's **day total** is the sum of their 3 squads' points. [Owner]
- The daily leaderboard updates **live** during matches. [Owner]

### 2.4 The "banked" moment [Owner]
Each squad's points go through three visible states:

| State | When | What the player sees |
|---|---|---|
| **Live** | During the match | Points ticking up, provisional rank on the daily board |
| **Full time** | At the final whistle | "Full time: 34 pts (provisional)", while the stats re-pull is pending |
| **Banked** | After the stats re-pull, about 15 minutes after full time | A reveal card: "**+34 banked · up to 12th · in the money**" |

- Banked points are final. Later stat corrections are ignored, and the rules say so. (Blueprint,
  [Owner].)
- The daily leaderboard shows a **prize line** (the cut-off for the paid places) and, for the
  player, **"If the day ended now you'd win $X"**. This is what gives every full time a stake even
  though money is paid only at the end of the day.
- The banked card should be **shareable to X** (image card with points, rank, the fixture). [Proposed]
- Send a **push or Telegram notification** when a squad is banked. [Proposed]

### 2.5 Tiebreaks [Proposed]
Ties on the daily board are broken, in order, by:
1. Higher total captain points across the player's squads.
2. Earlier time the player's last squad was saved (rewards committing early).
3. If still tied, split that place's prize equally.

Ties are most likely on one-fixture days, when everyone picks the same match.

---

## 3. Daily prize: paid at the last whistle [Owner]

- **Who wins:** the top 10 on the daily leaderboard. [Proposed: the owner first described "the
  person who scored the highest", the top 10 was recommended and not objected to, so confirm.]
- **Suggested split of the daily pot** [Proposed]: 30% / 20% / 12% / 9% / 7% / 6% / 5% / 4% / 4% / 3%.
- **When:** the day closes when the **last fixture of the matchday is banked** (about 15 minutes
  after its full time). At that moment the result locks and prizes are **credited and sent straight
  away**, not in the next daily batch. [Owner]
  - The end of the day is itself a full time: the last match becomes the finale where the board
    settles live, and the money arrives minutes later.
- **Send path:** an on-chain transfer per winner at day close (about 10 transfers a day). If a transfer
  fails, retry; if it still fails, fall back to the existing daily payout batch and show "Sending"
  on the prize page. [Proposed]
- **Holding check:** at day close, check that each winner's wallet still holds the access
  requirement (150,000 $ELEVN, still [Proposed] in the blueprint) and passes the 72-hour hold.
  A wallet that fails gets no prize; its share rolls into the next matchday's daily pot. [Proposed
  for the rollover; the hold-through rule itself is [Owner] from the blueprint.]
- **Currency:** USDC, to match the weekly prize. [Proposed: the owner chose USDC for the weekly
  prize. Paying daily prizes in USDC as well avoids showing "$500" next to "0.3 SOL".]
- **Funding:** the daily pot is the Blitz share of the creator-fee prize pool (40% of the 60% prize
  share, per the blueprint), converted to USDC. The pot is no longer split into fixture prizes:
  all of it goes to the daily board. A pot with too few entrants (threshold [Open]) rolls forward to
  the next matchday.

### What is removed from the old design
- Per-fixture prize boards and per-fixture top-3 prizes. **Removed.**
- The half-and-half split of the Blitz pot between fixture prizes and the matchday prize. **Removed.**
- "A team for every fixture" and the "count only the best 6" fallback. **Removed.**
- Paying Blitz prizes in the next daily batch. **Replaced** by payment at day close (the batch
  stays as a fallback and stays for Season's 14-part vesting).
- A "full-time leader" bonus was considered and **rejected** by the owner. Do not build it.

---

## 4. Weekly prize: $500 USDC [Owner]

- **Amount:** a fixed **$500 USDC every week** that has matchdays. [Owner]
- **Funding:** this is a fixed prize, guaranteed by the project, not taken from creator fees. That
  is about $20,000 for a season. **[Open]: the owner must confirm the treasury source**, and this
  must go to the legal review, because a fixed operator-funded prize changes the analysis.
- **Week definition** [Proposed]: Tuesday 00:00 to Monday 23:59 UK time, so a normal Friday-to-Monday
  round falls in one week.
- **Scoring** [Proposed]: the sum of a player's **best 3 daily totals** that week. If the week has
  fewer than 3 matchdays, all of them count. Missing one day doesn't knock a player out, and playing
  more days still helps.
- **Split** [Proposed]: $200 / $100 / $50, then $25 each for 4th to 9th (total $500).
- **Payout:** credited and sent when the week's last matchday closes, the same instant flow as the
  daily prize, with the same holding check. A failed check rolls that share into the next week's
  prize. [Proposed]
- **Weeks with no matchdays** (international breaks, winter break, summer): no weekly prize, and
  nothing rolls forward. The Today page shows the countdown to the next matchday as the blueprint
  describes. [Proposed]
- **Overlap to flag** [Open]: Season already has a weekly prize and Draft has a weekly table. Three
  weekly prizes is a lot for players to follow. The owner may want the Blitz weekly to be the
  headline and fold the others in. Do not change Season or Draft without the owner's say.

---

## 5. Edge cases

| Case | Handling |
|---|---|
| Fixture postponed **before** kickoff | The squad never locks. The player can swap it to another fixture that has not kicked off. If none is left, that squad scores 0. Notify the player. [Proposed] |
| Fixture abandoned **during** the match | The squad keeps the points earned up to the abandonment, banked about 15 minutes after it. [Proposed] |
| Last fixture of the day postponed | The day closes when the last fixture that actually finishes is banked. [Proposed] |
| Which date a fixture belongs to | The UK (Europe/London) date of its kickoff. [Proposed] |
| One-fixture matchday | Everyone has 1 squad on the same match. Tiebreaks in 2.5 apply. |
| A player enters, then loses the holding requirement mid-day | Their squads keep scoring and showing on the board, but they cannot be paid. The check runs at day close. [Proposed] |
| One prize per wallet per board | Still applies (blueprint, section 5). A wallet can only win one place on the daily board and one on the weekly board. |

---

## 6. Data model sketch

This fits the blueprint's "shared contest, entry and result tables" foundation. Adjust names to the
codebase.

- `matchday`: date (UK), list of fixtures, status (`upcoming`, `live`, `closed`), closed_at.
- `blitz_entry`: wallet, matchday, created_at, last_squad_saved_at (for the tiebreak),
  day_total, final_rank.
- `blitz_squad`: entry, fixture, slot (1 to 3), 3 player ids, captain id, state (`open`, `locked`,
  `live`, `full_time`, `banked`, `void`), locked_at, live_points, banked_points, banked_at.
  Unique on (entry, fixture).
- `prize_pot`: mode = `blitz_daily` or `blitz_weekly`, period (matchday or week), currency = USDC,
  amount, rolled_in, rolled_out.
- `prize_award`: pot, wallet, place, amount, status (`credited`, `sending`, `paid`, `forfeited`),
  tx signature, paid_at.
- `blitz_week`: week start and end, standings computed from each wallet's best 3 `day_total`s.

Jobs:
1. **Kickoff job** per fixture: lock all squads on that fixture.
2. **Live job:** update `live_points` and the daily board during matches (no extra API calls beyond
   what the blueprint already budgets).
3. **Bank job** per fixture, about 15 minutes after full time: one stats re-pull, write
   `banked_points`, fire the banked card and notification.
4. **Day close job:** when the last fixture of the matchday is banked: final ranks, tiebreaks,
   holding checks, create `prize_award`s, send USDC, roll forfeits.
5. **Week close job:** when the week's last matchday closes: best-3 standings, $500 split, same
   send flow.

---

## 7. What to show on Today (blueprint section 4)

The Blitz card keeps the blueprint's one-card, one-state, one-button idea:

| Player's state | Card shows | Button |
|---|---|---|
| No squads yet | "Pick 3 fixtures" + the next kickoff | Play |
| Some squads set, none started | "2 of 3 squads set" | Play |
| Matches running | Day total, rank, "in the money" or the gap to the prize line | Live |
| A squad just banked | The banked card | Live |
| Day closed | Final rank and prize won | Result |

---

## 8. Still pending, unchanged from the blueprint
- The **72-hour holding rule** must be enforced in code before any prize is paid (it is in
  config.toml but not enforced).
- **Legal review:** real-money Blitz prizes stay in test mode (devnet, or a test USDC token) until
  the legal review signs off in writing. The new fixed $500 weekly prize must be included in that
  review.

---

## 9. Tests to write
Use real cached matches, as the blueprint asks.

1. A player with 3 squads on fixtures at 12:30, 15:00 and 20:00: each squad locks at its own kickoff,
   and edits after kickoff are rejected.
2. Swapping a not-yet-started fixture is allowed after another squad has locked.
3. The same fixture twice in one entry is rejected.
4. The at-least-one-player-per-club rule and the one-captain rule are enforced.
5. A squad goes live, then full time, then banked; banked points ignore a later stat correction.
6. The day closes only after the last fixture is banked; awards are created and sent at that moment.
7. Tiebreaks: captain points first, then earliest last save, then an equal split.
8. A winner failing the holding check forfeits, and the share rolls to the next matchday.
9. Postponed-before-kickoff and abandoned-during-match handling as in section 5.
10. The weekly table uses the best 3 daily totals, pays $200 / $100 / $50 / 6 × $25, and handles a week
    with only 1 or 2 matchdays.
11. One-fixture day: every entry has 1 squad, and the board still ranks and pays correctly.
12. A failed USDC transfer retries, then falls back to the daily batch with status `sending`.

---

## 10. Owner decisions in this document (2026-11-14)
- 3 squads per matchday, on any 3 fixtures the player chooses, from any launch league.
- Each squad locks at its own kickoff; the late-pick advantage is accepted and stated in the rules.
- The 72-hour hold and one prize per wallet stay, and are required before launch.
- The daily prize is paid at the last whistle of the day, not in the next daily batch.
- Squads show a "banked" moment after each full time.
- No full-time leader bonus.
- A $500 USDC weekly prize.

**Still to confirm with the owner:** daily top 10 and its split; USDC for daily prizes; tiebreak order;
best-3 weekly scoring and the $200 / $100 / $50 / 6 × $25 split; week boundaries; edge-case handling;
the treasury source for the $500; the minimum-entrants threshold for rollover; how this sits beside
Season's and Draft's weekly prizes.
