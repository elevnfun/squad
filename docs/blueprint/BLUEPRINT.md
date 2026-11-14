# elevn 2.0 blueprint (DRAFT v1, before the debate)

Status: draft for the two-agent debate. Not approved. Nothing here is built yet.

## 1. Goal

Cut the wait for a result from one week to hours or minutes, without turning elevn into a
jumble of games. Audience: crypto-native football fans on phones, coming from X and Telegram.

Ground rules (from the formats doc): free to enter for $ELEVN holders, prizes only from creator
fees, football-themed with real data, skill over chance (legal review pending).

## 2. The modes

Three launch leagues (Premier League, La Liga, Bundesliga), as in config.toml.

| Mode | Role | Result in | Prizes |
|---|---|---|---|
| Matchday Blitz | Main | ~2 hours | SOL, daily |
| Daily Draft | Main | The day's matches | SOL, daily |
| Squad Battles | Main (your eleven) | Seconds | Ladder, weekly SOL |
| Penalty Shootout | Side mini-game | ~60 seconds | None (ladder only) |
| Next Moment (live predictions) | Parked | | |
| Higher or Lower / daily grid | Parked | | |

### 2.1 Matchday Blitz
- Pick 3 players from one real fixture, one is captain (x2). Locks at kickoff.
- Live points ticker during the match; final at full time (after the stats re-pull).
- One entry per wallet per fixture. Every fixture in the three leagues is a Blitz.
- Scoring: the existing per-match engine (squad/scoring.py), no Rising Stars.
- Leaderboard per fixture, plus a daily Blitz table (best fixture score of the day).

### 2.2 Daily Draft
- Open 5 packs of 3 players: 15 players in all, mixed across the three leagues.
- Build a five-a-side from those 15: at least 1 defender, 1 midfielder, 1 attacker;
  goalkeeper optional; at most 2 players from one club. One captain.
- Packs only hold players whose club plays in the draft's scoring window.
- The team scores on that window's real matches and feeds a running Draft table.
- Packs are fixed per wallet per day (seeded, no re-rolls) and balanced by price tier.

### 2.3 Squad Battles
- One ladder across all three leagues (not one per league).
- You bring a saved eleven; the battle resolves instantly from the players' real recent form.
- Capped battles per day. Ranked ladder, weekly prizes.

### 2.4 Penalty Shootout
- Shooter picks corner and power, keeper picks a dive; sealed, then revealed. Five rounds.
- Side game: no SOL prizes, a daily ladder for bragging rights only.

### 2.5 The weekly gameweek game (what exists today)
- Kept as "Season" under Squad: it is built, and its elevens are what Squad Battles uses.

## 3. Keeping it simple (information architecture)

Four places, no more:

| Nav | What it holds |
|---|---|
| Today | One screen: what you can play right now (Blitz fixtures, today's Draft, Battles, Shootout) |
| Squad | Your eleven: Season (weekly) and Battles |
| Ranks | Leaderboards for every mode, and your prizes |
| Chat | The community room |

- Phone: a bottom tab bar with those four. Desktop: the same four in the top bar.
- Home (logged out) is the scroll story; logged in, the logo opens Today.
- Each mode is one card on Today with one state and one button (Play / Live / Result).

## 4. Prizes and access

- 150,000 $ELEVN unlocks every mode: one entry per mode per day.
- The 60% prize share is split per day: Blitz 40%, Draft 40%, Squad 20%, Shootout 0%. [Proposed]
- One prize per wallet per mode per day. Paid through the existing daily batch.

## 5. Home page scroll story (from the 3D guide: route 03, built in code)

One hero object: the match ball, drawn in code with three.js (no model file, no AI imagery).

| Scroll | Camera | Object | Words |
|---|---|---|---|
| 0% | Wide, centred | Whole ball, slow turn under the floodlight | elevn. Fantasy football that ends tonight. |
| 20% | Push in close | One panel seam fills the screen | A week is too long. Results in hours. |
| 45% | Pull back | Panels lift apart into four groups | Four ways to play |
| 70% | Slow orbit | Each group labelled: Blitz, Draft, Battles, Shootout | What each one is, in a line |
| 100% | Back to the start | Whole again | Hold 150,000 $ELEVN. Play free. [Connect wallet] |

Budgets from the guide: 60 fps on a mid-range phone, poster first, still image if WebGL fails,
reduced motion respected, real HTML text over the canvas.

## 6. Build order

1. Foundations: a shared contest / entry / result model, daily settlement, prize split.
2. Matchday Blitz.
3. Daily Draft.
4. Squad Battles.
5. Penalty Shootout.
6. Today hub and navigation.
7. Home scroll story.

## 7. Open questions

- Draft: how long does a draft team keep scoring (one day, a round, the season)?
- Does Blitz replace the weekly game or sit beside it?
- Squad Battles: how much randomness, and do instant simulated results get SOL prizes?
