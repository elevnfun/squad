# elevn 2.0 blueprint (v7, two modes and one mini-game, owner's decisions of 2026-11-14)

**Status: waiting for the owner's approval. Nothing here is built yet.**
Tags: [Owner] = stated by the owner, build as written. [Proposed] = recommended, needs a yes.
[Open] = the owner must choose.

The project runs in four sections: 1 blueprint and planning (this file), 2 design,
3 functionality confirmed, 4 trial and error.

## 1. Goal

Cut the wait for a result from one week to about two hours, with two game modes only, so the
site never turns into a jumble of games.

Audience: crypto-native football fans on phones, arriving from X and Telegram.

Ground rules: free to enter for $ELEVN holders; prizes only from creator fees; real football
data; skill over chance; legal review still pending.

## 2. The rhythm: matchday, not daily

The three launch leagues (Premier League, La Liga, Bundesliga) mostly play Friday to Monday.
Midweek days, international breaks, the winter break and the summer have no matches.

- A **matchday** is any day with at least one launch-league fixture.
- Blitz runs on matchdays. Draft runs once a week. The site never says "daily" or "tonight".
- On other days Today shows a countdown to the next matchday.
- The matchday calendar is published on the site.

## 3. The modes

| Mode | Rhythm | Result in | Prizes |
|---|---|---|---|
| Matchday Blitz | Every matchday | About 2 hours per squad; the day's prize at the last whistle | A daily pot (top 10) and a fixed $500 weekly prize |
| Draft | Once a week | The week's matches | One weekly pot |

Removed by the owner on 2026-11-14: Season (the weekly squad-of-15 game that is live today),
and with it Squad Battles, which needed a Season eleven. Parked: live predictions, Higher or
Lower, the daily grid.

Penalty Shootout stays as a side mini-game with no prize (section 3.3). [Owner]

### 3.1 Matchday Blitz [Owner: main mode]

The full rules, edge cases, data model and tests are in `docs/blueprint/BLITZ.md` (the owner's
document of 2026-11-14). It replaces every earlier Blitz rule. In short:

- Each matchday a player builds 3 squads, one per fixture, on any 3 fixtures they choose from the
  launch leagues. On a matchday with fewer than 3 fixtures, one squad per fixture. [Owner]
- A squad is 3 players from one fixture, at least one from each club, with one captain (double
  points). [Owner] A fixture can be chosen only once. [Proposed]
- Each squad locks at its own kickoff. Until then it can be changed or swapped to another fixture
  that has not kicked off. Picking late with the live board in view is allowed, and the rules
  page says so. [Owner]
- The day total is the sum of the 3 squads, on one live daily leaderboard. [Owner]
- Each squad goes Live, then Full time (provisional), then Banked about 15 minutes after full
  time, with a reveal card. The board shows the prize line and "If the day ended now you'd win
  $X". Banked points are final. [Owner]
- Daily prize: the top 10 on the daily board, credited and sent when the last fixture of the
  matchday is banked. [Owner; top 10 and its split are Proposed]
- Weekly prize: a fixed $500 USDC, on the sum of a player's best 3 daily totals that week.
  [Owner; scoring and split are Proposed]
- No per-fixture prizes, no "team for every fixture", no full-time leader bonus. [Owner]
- Scoring: the existing engine, no Rising Stars, match bonus switched on. [Proposed]

### 3.2 Draft [Owner: main mode, weekly]
- Once a week you open 5 packs of 3 players: 15 players, mixed across the three leagues. [Owner]
- Packs are personal: every wallet gets its own players, so luck is part of the game. [Owner]
- Build a five-a-side from your 15: at least 1 defender, 1 midfielder and 1 attacker, no
  goalkeepers, at most 2 players from one club. [Owner] One captain. [Proposed]
- The team scores on that week's real matches and is paid once a week. [Owner]
- To keep the luck fair [Owner]:
  - Packs are fixed per wallet per week, with no re-rolls and one draft per wallet.
  - Every pack has the same make-up by price: one top player, one mid-priced, one budget. Luck
    decides who you get, not how strong your packs are.
  - Packs only hold players whose club plays that week, and every 15 includes at least
    2 defenders, 2 midfielders and 2 attackers.
- The week is Tuesday to Monday UK time, the same as the Blitz week. The draft opens on Tuesday
  and locks at the week's first kickoff. [Owner: good for now]
- Known risks of personal packs, accepted by the owner: every extra wallet is an extra draw
  (limited by the 300,000 $ELEVN holding and the 72-hour hold), and random packs with prizes
  weigh more on the pending legal review than shared packs would.

### 3.3 Penalty Shootout [Owner: side mini-game]
- Shooter picks a corner and power, keeper picks a dive; five rounds.
- You play against another player's stored picks, so there is no queue.
- A ladder for bragging rights. No prize, because it is mostly guessing.
- It is not a third mode: it sits as a small card under the two mode cards on Today.

## 4. Keeping it simple

Three places:

| Nav | What it holds |
|---|---|
| Today | What you can play now: the Blitz card, the Draft card, and the small Shootout card |
| Ranks | The Blitz daily and weekly boards, the Draft weekly board, and your prizes |
| Chat | The community room |

- Phone: a bottom tab bar. Desktop: the same three in the top bar.
- Logged out, the home page is the scroll story. Logged in, the logo opens Today.
- Each mode is one card with one state and one button: Play, Live or Result.
- One scoring engine, one sign-in, one prize page for both modes.
- News page: football news, not platform news. Platform updates go out on X. [Owner]
  - Main feed: our own two or three sentence write-ups of the facts (transfers, injuries,
    results), in elevn's voice, with the source named on every item. A genuine rewrite of the
    facts, never a reworded copy of one article.
  - Mixed in: items built from the site's own match data (line-ups, injuries, who is in form).
  - Bigger stories: the outlet's headline and a one-line excerpt from its RSS feed, linking out.
  - Never: scraping and republishing full articles.
  - The write-ups are generated automatically, so they draw only on these sources [Owner]:
    the three leagues' official sites (premierleague.com, laliga.com, bundesliga.com),
    Sky Sports, BBC Sport and FotMob.
  - To check when it is built: each source's terms, and which of them offer an RSS feed.
  - Built after the two modes, before the tutorial.
- First visit: an interactive tutorial, built into the website, runs the first time a player
  opens it. It highlights each area of the site in turn and explains it. It can be skipped.
  It is not a PDF or a separate guide. It is built last, after the rest of the website is
  complete. [Owner]

## 5. Prizes and access

- Holding 150,000 $ELEVN unlocks Blitz, the main mode: one entry per matchday. Holding
  150,000 more (300,000 in all) also unlocks Draft: one draft per week. [Owner]
- The 60% prize share: Blitz 60%, Draft 40%. Shootout 0%. [Owner]
- Blitz: one pot per matchday, all of it to the daily board. [Owner] Draft: one pot per week.
  [Owner] A pot with too few entrants rolls forward (threshold [Open]).
- The Blitz daily board pays the top 10. [Proposed] The Draft weekly board pays the top 5. [Owner]
- Blitz prizes are sent at day close, one transfer per winner, only if the wallet still holds
  the requirement and passes the 72-hour hold; a failed transfer falls back to the daily batch.
  [Owner] Details in `docs/blueprint/BLITZ.md`.
- Currency: every prize is paid in SOL while the site is on devnet, the weekly $500 included
  (its SOL equivalent). USDC is decided again before mainnet. [Owner]
- The Blitz weekly $500 is paid from creator fees when the week's fees cover it, and topped up
  from project funds when they don't. [Owner] It must go to the legal review.
- Sending at day close without the owner signing needs a key on the server: a separate payout
  wallet holding about a week of prizes, never the fee wallet. [Proposed; the owner calls it solvable]
- Draft prizes are credited and sent when the week's last matchday closes, the same way as the
  Blitz weekly prize. [Proposed] The 14-part vesting goes with Season.
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
| 45% | Pull back | The ball opens into two halves | Two ways to play |
| 70% | Slow orbit | Each half labelled: Blitz, Draft | One line each |
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

After the debate the owner cut the plan to two modes, removed Season and Squad Battles, made
Draft weekly and chose personal packs; rows above about those are history.

Not adopted: launching Blitz alone and holding Draft back (the owner wants both as main modes),
and replacing the scroll story with a static poster (the owner wants the designed home page).

## 8. Build order (section 3)

1. Foundations: shared contest, entry and result tables; matchday and week calendar; prize
   pots; 72-hour hold enforced; the payout wallet; the Today hub and three-tab navigation.
2. Matchday Blitz.
3. Draft.
4. Penalty Shootout.
5. Retire Season: close the current gameweek game and its pages once Blitz is live.
6. Home scroll story (designed in section 2, built here).
7. The football News page.
8. The first-visit interactive tutorial, once everything else is complete.

Each mode ships with tests against real cached matches.

## 9. Decisions

Settled by the owner on 2026-11-14:
- Two modes only: Matchday Blitz and Draft. Season is removed.
- Blitz: the rules in `docs/blueprint/BLITZ.md`.
- Draft: weekly, personal packs with the fairness rules in 3.2, no goalkeepers, 5 packs of 3,
  five-a-side, at most 2 per club, locking at the week's first kickoff.
- Penalty Shootout stays as a side mini-game with no prize.
- Prize split: Blitz 60%, Draft 40%. Draft pays the top 5.
- Access: 150,000 $ELEVN for Blitz; 150,000 more for Draft.
- Prizes in SOL on devnet; the weekly $500 from fees when they cover it, else project funds.
- Section 2 design work goes through the Higgsfield MCP together with the references.

Still to confirm:
- Draft: one captain on double points, as in Blitz?
- Blitz: the "still to confirm" list at the end of BLITZ.md.
- The design of the payout wallet that sends prizes at day close.
