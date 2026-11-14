# elevn 2.0 blueprint (v4, with the owner's answers of 2026-11-14)

**Status: waiting for the owner's approval. Nothing here is built yet.**
Tags: [Owner] = stated by the owner, build as written. [Proposed] = recommended, needs a yes.
[Open] = the owner must choose.

The project runs in four sections: 1 blueprint and planning (this file), 2 design,
3 functionality confirmed, 4 trial and error.

## 1. Goal

Cut the wait for a result from one week to about two hours, and give players something to do
between matches, without the site turning into a jumble of games.

Audience: crypto-native football fans on phones, arriving from X and Telegram.

Ground rules: free to enter for $ELEVN holders; prizes only from creator fees; real football
data; skill over chance; legal review still pending.

## 2. The rhythm: matchday, not daily

The three launch leagues (Premier League, La Liga, Bundesliga) mostly play Friday to Monday.
Midweek days, international breaks, the winter break and the summer have no matches.

- A **matchday** is any day with at least one launch-league fixture.
- Blitz and Draft run only on matchdays. The site never says "daily" or "tonight".
- On other days Today shows a countdown to the next matchday, with Battles and Shootout open.
- The matchday calendar is published on the site.

## 3. The modes

| Mode | Role | Result in | Prizes |
|---|---|---|---|
| Matchday Blitz | Main | About 2 hours | SOL: a prize per fixture at full time, plus a matchday prize |
| Matchday Draft | Main | That matchday's matches | SOL, one pot per matchday |
| Season (the weekly game that exists today) | Under Squad | A week | SOL, weekly, as now |
| Squad Battles | Under Squad | Seconds | Ladder only, no SOL |
| Penalty Shootout | Side mini-game | About 60 seconds | Ladder only, no SOL |
| Live predictions | Parked [Owner] | | |
| Higher or Lower, daily grid | Parked | | |

### 3.1 Matchday Blitz [Owner: main mode]
- Pick 3 players from one real fixture and make one captain (double points). Locks at kickoff.
- At least one pick from each club. [Owner]
- You can make a team for every fixture of the matchday. Your matchday total is the sum of all
  your teams' points, and the matchday leaderboard updates live as matches are played. [Owner]
- Every fixture of the matchday opens for picks at once, so all teams can be set in one sitting.
  Each team can be changed until its own kickoff. A fixture you skip scores 0. [Proposed]
- Confirmed line-ups are shown about an hour before kickoff, so you can swap out a player who
  is not starting. [Proposed]
- Live points during the match. The result locks after one stats re-pull, about 15 minutes
  after full time; later corrections are ignored, and the rules say so. [Owner]
- Two prizes [Owner]: half of the Blitz pot goes to fixture prizes, shared equally between that
  matchday's fixtures and won by the top 3 on each fixture's board at full time; the other half
  goes to the top 10 on the matchday table after the last match.
- A prize is credited to the player's prize page the moment the result locks, and the SOL is
  sent in the next daily batch.
- To watch in section 4: on matchdays with 10 or more fixtures, whether players finish all
  their teams. If they don't, count only the best 6.
- Scoring: the existing engine, no Rising Stars, match bonus switched on. [Proposed]

### 3.2 Matchday Draft [Owner: main mode]
- Open 5 packs of 3 players: 15 players, mixed across the three leagues. [Owner]
- Build a five-a-side from those 15: at least 1 defender, 1 midfielder and 1 attacker,
  at most 2 players from one club. [Owner] No goalkeepers: packs hold outfield players only.
  [Owner] One captain. [Proposed]
- The packs are the same for everyone that matchday. You still open them one by one. [Owner]
  Reason: with personal packs, every extra wallet is a free re-roll.
- Packs only hold players whose club plays that matchday, and always include at least
  2 defenders, 2 midfielders and 2 attackers.
- Runs on matchdays with at least 4 fixtures. Locks at the first kickoff. [Proposed]
- Scores that matchday's matches. A weekly Draft table adds up your best five matchdays, so the
  team "keeps accumulating" without a second set of rules. [Proposed]

### 3.3 Squad Battles [Owner: in, one ladder for all three leagues]
- One ladder across the three leagues. You bring a saved Season eleven.
- The result comes from each player's real points in their last five played matches, using the
  same scoring engine in every league, plus a small seeded swing of about 10%. The breakdown is
  shown, so a loss can be explained.
- You play against other players' saved elevens, so nobody has to be online.
- Up to 5 battles a day, against opponents near your rating. The ladder pauses when no league
  has played for 10 days.
- No SOL until the legal review approves it in writing.

### 3.4 Penalty Shootout [Owner: side mini-game]
- Shooter picks a corner and power, keeper picks a dive; five rounds.
- You play against another player's stored picks, so there is no queue.
- A ladder for bragging rights. No SOL, ever, because it is mostly guessing.

## 4. Keeping it simple

Four places:

| Nav | What it holds |
|---|---|
| Today | What you can play now: one Blitz card, one Draft card, Battles, Shootout |
| Squad | Your eleven: Season and Battles |
| Ranks | Every leaderboard, and your prizes |
| Chat | The community room |

- Phone: a bottom tab bar. Desktop: the same four in the top bar.
- Logged out, the home page is the scroll story. Logged in, the logo opens Today.
- Each mode is one card with one state and one button: Play, Live or Result. On a Saturday the
  Blitz card shows the next fixture and opens the full fixture list.
- One scoring engine, one sign-in, one prize page, one payout batch for every mode.
- Modes arrive one at a time as a new card on Today (see section 8), not all at once.

## 5. Prizes and access

- Holding 150,000 $ELEVN unlocks every mode, plus one Season squad as today. [Proposed]
- The 60% prize share: Blitz 40%, Draft 40%, Season 20%. Battles and Shootout 0%. [Owner: for now, may change later]
- One pot per mode per matchday; the Blitz pot is split half to fixture prizes, half to the
  matchday prize (section 3.1). [Owner] A pot with too few entrants rolls forward.
- Fixture prizes pay the top 3; matchday prizes (Blitz and Draft) pay the top 10. Exact ties
  split the prize. [Proposed]
- Prizes are credited when the result locks and paid in the next daily batch, only if the wallet
  still holds the requirement. [Owner] (The 14-part vesting stays for Season.)
- One prize per wallet per board.
- The 72-hour holding rule is in config.toml but not enforced in code. It must be enforced
  before any matchday prize is paid.
- SOL prizes for Blitz and Draft stay on devnet until the legal review signs off in writing.

## 6. Home page scroll story

From the 3D website guide, route 03 (built in code): one hero object, the scrollbar is the
timeline, real HTML text over a fixed canvas. Written before any building, as the guide asks.

Hero object: the match ball, built in code, with no AI-generated imagery. The design work
goes through the Higgsfield MCP together with the references. [Owner]
A white and gold ball on the night background follows the guide's contrast rule.

| Scroll | Camera | Object | Words |
|---|---|---|---|
| 0% | Wide, centred | Whole ball, slow turn under the floodlight | elevn. Fantasy football with a result at full time. |
| 20% | Push in close | One panel seam fills the screen | A week is too long to wait. |
| 45% | Pull back | Panels lift apart into four groups | Four ways to play |
| 70% | Slow orbit | Each group labelled: Blitz, Draft, Battles, Shootout | One line each |
| 100% | Back to the start | Whole again | Hold 150,000 $ELEVN. Play free. [Connect wallet] |

Three moments only: the reveal, the teardown, the labelled orbit. Everything else stays still.

Budgets: 60 fps on a mid-range phone; under 100 draw calls; pixel ratio capped at 2; a poster
image shows first; a still image if WebGL fails or inside in-app browsers that cannot hold the
frame rate; reduced motion respected; rendering stops when the canvas is off screen.

The site stays on Next.js (the guide's Vite + React is not required). web/DESIGN.md stays the
design base: night palette, trophy gold, Sora and Barlow Condensed.

## 7. What the debate changed

Two agents argued the draft: one for, one against, with a rebuttal each.
Full record: docs/blueprint/DEBATE.md.

| Attack | Verdict | Change made |
|---|---|---|
| "Daily" is false on about half of all days | Conceded | Matchday rhythm, published calendar |
| Prizes split too thin | Conceded | One pot per mode per matchday, rollover, top 10 on matchday tables |
| Multi-wallet farming | Conceded | Shared packs, 72-hour hold enforced, hold-through payout |
| Gambling exposure | Partly | No SOL for Battles or Shootout; matchday SOL on devnet until sign-off |
| Simulated battles feel unfair | Closed | Real points, 10% swing, breakdown, ladder only |
| API request budget | Mostly rejected | The new modes add no calls; simulate a worst Saturday before adding leagues |
| Scoring fits 3 and 5 players badly | Partly | Match bonus on, ties split, no goalkeepers in Draft |
| Too many things at once | Partly | One card per mode, staged release |
| Too few players per board | Conceded | One matchday board, stored opponents |
| 3D page too heavy on phones | Partly | Poster first, budgets, still fallback |

Not adopted: launching Blitz alone and holding Draft back (the owner wants both as main modes),
and replacing the scroll story with a static poster (the owner wants the designed home page).

## 8. Build order (section 3)

1. Foundations: shared contest, entry and result tables; matchday calendar; prize pots;
   72-hour hold enforced; the Today hub and four-tab navigation.
2. Matchday Blitz.
3. Matchday Draft.
4. Squad Battles.
5. Penalty Shootout.
6. Home scroll story (designed in section 2, built here).

Each step ships as a new card on Today, with tests against real cached matches.

## 9. Decisions

Settled by the owner on 2026-11-14: shared Draft packs; no goalkeepers in Draft; the 40 / 40 / 20
split for now; Blitz pays per fixture at full time and per matchday, half each, credited at once
and paid in the next daily batch; Blitz totals are the sum of every fixture team, with at least
one pick per club;
section 2 design work goes through the Higgsfield MCP together with the references.

Still [Proposed], waiting for a yes: all Blitz fixtures open at once and line-ups shown; top 3 per
fixture and top 10 per matchday paid; the 150,000 $ELEVN rule unlocking every mode; Draft only on
matchdays with at least 4 fixtures.
