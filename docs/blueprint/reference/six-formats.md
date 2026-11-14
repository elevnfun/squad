# elevn: six faster game formats

## Context

elevn (elevn.fun) is token-gated fantasy football on Solana. Today it works like Fantasy Premier League: players
pick eleven players (plus 4 substitutions) from a real league and wait a full gameweek for the result. It runs as
a public test season on Solana devnet.

**The problem:** a week is too long to wait. The audience is crypto-native football fans on X and Telegram with
short attention spans. They want a result in minutes or hours, and something to do between matches.

**What exists and can be reused:**
- Real data for five leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1) from API-Football,
  including live match data.
- A scoring engine that already scores each player per match (goals, assists, clean sheets, saves, passes,
  shots, tackles, cards and so on).
- Wallet sign-in, usernames, a community chat, and a check that each player holds enough $ELEVN.
- Prizes paid in SOL from a share of the token's creator fees (60% of fees go to prizes, 20% buy back and burn
  $ELEVN). Payouts go out in one daily batch from a single fee wallet.

**Ground rules for any new format:**
- Free to enter for anyone holding $ELEVN; no stake or fee per play.
- Prizes come only from creator fees.
- Stay football-themed, and use real football data where possible.
- Instant results with prizes can look like gambling to regulators. Formats that depend more on skill are
  safer, and pure-chance formats carry the most risk. A legal review is pending.

## The six formats

### 1. Matchday Blitz: fantasy for one match
- **How it plays:** before kickoff, pick 3 players from one real fixture and make one of them captain. A live
  points ticker runs during the match, and the result is final at full time.
- **Time to result:** about 2 hours.
- **Strengths:** with five leagues there is a match almost every day. Reuses the per-match scoring engine, the
  live data, the leagues, usernames and chat.
- **Risks:** midweek days with few fixtures. Little to do between matches.

### 2. Next Moment: live predictions
- **How it plays:** during a real match, quick calls open and close every few minutes ("Goal in the next 10
  minutes?", "Next corner: home or away?", "Will the substitute score?"). Correct calls build a streak, and each
  match has its own chat room.
- **Time to result:** minutes.
- **Strengths:** the most instant format that still uses real football.
- **Risks:** someone watching a faster stream than everyone else has an edge, so calls must lock early. Only works
  while matches are on. Needs frequent live-data polling.

### 3. Penalty Shootout: one-minute duel
- **How it plays:** two players face off, one shooting and one in goal. The shooter picks a corner and power, the
  keeper picks a dive. Both choices are sealed and then revealed together, so nobody sees the other's pick first.
  Five rounds, with a daily ladder.
- **Time to result:** about 60 seconds.
- **Strengths:** always available, no match data needed.
- **Risks:** mostly guessing (like rock-paper-scissors), which is the most gambling-like. Needs enough players
  online to match people up. Bots will try to farm it.

### 4. Daily Draft: one-minute team
- **How it plays:** open 5 packs of 3 real players and keep 1 from each, building a five-a-side team. That team is
  scored against everyone else's drafts on that day's real matches.
- **Time to result:** about a minute to draft, then the day's matches.
- **Strengths:** quick to play, reuses player data and scoring.
- **Risks:** the result still waits for the matches. It's a lighter version of Blitz.

### 5. Higher or Lower and a daily grid
- **How it plays:** quick football-knowledge games, like guessing which of two players has more goals this season,
  played as a streak. Plus one daily puzzle with a result you can share on X.
- **Time to result:** seconds.
- **Strengths:** cheapest to build from existing player stats. Share cards bring new people in from X.
- **Risks:** trivia rarely keeps people for long.

### 6. Squad Battles: instant head-to-head
- **How it plays:** your team of eleven plays someone else's instantly, with the result based on the players' real
  recent form. Wins move you up a ranked ladder.
- **Time to result:** seconds.
- **Strengths:** keeps the existing squad-building, always available.
- **Risks:** a simulated result can feel random or unfair. Needs a credible match simulation.

## Scores

Impact × confidence ÷ effort, each out of 5:

| Format | Impact | Confidence | Effort | Score |
|---|---|---|---|---|
| Higher or Lower and daily grid | 3 | 4 | 1 | 12.0 (cheap, but low ceiling) |
| Matchday Blitz | 4 | 4 | 2 | 8.0 |
| Daily Draft | 3 | 3 | 2 | 4.5 |
| Penalty Shootout | 4 | 3 | 3 | 4.0 |
| Next Moment | 5 | 3 | 4 | 3.8 |
| Squad Battles | 3 | 3 | 3 | 3.0 |

## Current leaning

Matchday Blitz as the core game, because it keeps real football, reuses most of the backend and cuts the wait
from a week to about 2 hours. Add Penalty Shootout or the daily grid for the gaps between matches. Prizes would run
in daily rounds, which fits the existing daily payout batch.

**How to know it works:** time to the first result under 3 hours, sessions per day per player, and the share of
players who come back the next day and the next week.

## What to ask the other chat

Evaluate these six formats: which would keep players coming back, what is missing, what could go wrong, and
which combination you would build first and why.
