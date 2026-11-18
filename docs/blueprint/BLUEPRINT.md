# elevn 2.0 blueprint (v9, owner's decisions to 2026-11-17)

**Status: section 2 (design) is under way. Section 3 (build) has not started and must not start
until the owner says so. One rule is being reworked: how prizes are released (section 5.1).**
Tags: [Owner] = stated by the owner, build as written. [Proposed] = recommended, needs a yes.
[Open] = the owner must choose.

The project runs in four sections: 1 blueprint and planning (this file), 2 design,
3 functionality confirmed, 4 trial and error.

## 1. Goal

Cut the wait for a result from one week to about two hours, with two game modes only, so the
site never turns into a jumble of games.

Audience: crypto-native football fans arriving from X and Telegram. The desktop website gets
much the bigger focus; the phone view must work but is adapted from the desktop design. [Owner]

Ground rules: free to enter for $ELEVN holders; prizes from creator fees, except the Blitz
weekly prize, which the team pays from its own wallet; real football data; legal review still pending.
Draft's personal packs add luck by the owner's choice, where the first plan put skill over chance.

How we will know it works: time to a first result under 3 hours; sessions per player per day;
the share of players who come back the next day and the next week.

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
| Matchday Blitz | Every matchday | About 2 hours per squad; the day's prize at the last whistle | A daily pot (top 5) and a fixed $500 weekly prize (top 5) |
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
  points). Choosing a captain is mandatory: a squad without one cannot be saved. [Owner]
- A fixture can be chosen only once. Confirmed line-ups are shown about an hour before
  kickoff. [Owner]
- Each squad locks at its own kickoff. Until then it can be changed or swapped to another fixture
  that has not kicked off. Picking late with the live board in view is allowed, and the rules
  page says so. [Owner]
- The day total is the sum of the 3 squads, on one live daily leaderboard. [Owner]
- Each squad goes Live, then Full time (provisional), then Banked about 15 minutes after full
  time, with a reveal card. The board shows the prize line and "If the day ended now you'd win
  $X". Banked points are final. [Owner]
- Daily prize: the top 5 on the daily board, credited and sent when the last fixture of the
  matchday is banked. [Owner]
- Weekly prize: a fixed $500 (paid as its SOL equivalent on devnet) for the top 5, on the sum
  of a player's best 3 daily totals that week. [Owner]
- Ties: the player with more captain points wins. If that is equal too, the tied players
  split the prize. There is no "saved earlier" step. [Owner]
- Postponed before kickoff: swap to a fixture that has not started, else that squad scores 0.
  Abandoned mid-match: the squad keeps its points so far. The day closes when the last match
  that actually finishes is banked. [Owner]
- No per-fixture prizes, no "team for every fixture", no full-time leader bonus. [Owner]
- Scoring: the existing engine, no Rising Stars, match bonus switched on. [Owner]

### 3.2 Draft [Owner: main mode, weekly]
- Once a week you open 5 packs of 3 players: 15 players, mixed across the three leagues. [Owner]
- Packs are personal: every wallet gets its own players, so luck is part of the game. [Owner]
- Build a five-a-side from your 15: at least 1 defender, 1 midfielder and 1 attacker, no
  goalkeepers, at most 2 players from one club. [Owner]
- One captain on double points, and choosing one is mandatory: a team without a captain
  cannot be saved. [Owner]
- The team scores on that week's real matches and is paid once a week. [Owner]
- If a player's club plays twice between Friday and Monday, both matches count. [Owner]
- If a player's match is postponed or cancelled, the manager can swap that player for someone
  else. If they don't, the swap happens automatically. [Owner]
- The replacement comes from the manager's own 15: the highest-valued unused player in the
  same position (defender for defender, and so on) whose match has not kicked off. [Owner]
  If no player in that position is left, the slot scores 0. [Owner]
- Ties: more captain points wins; if that is equal too, the prize is split. [Owner]
- To keep the luck fair [Owner]:
  - Packs are fixed per wallet per week, with no re-rolls and one draft per wallet.
  - Every pack has the same make-up by price: one top player, one mid-priced, one budget. Luck
    decides who you get, not how strong your packs are.
  - Packs only hold players whose club plays that week, and every 15 includes at least
    2 defenders, 2 midfielders and 2 attackers.
- The Draft opens on Tuesday and locks at the first kickoff on Friday, every week. It scores
  the matches from Friday to Monday. Midweek matches count for Blitz, not for Draft. [Owner]
- The Blitz week, for the $500 prize, is Tuesday 00:00 to Monday 23:59 UK time. [Owner]
- Known risks of personal packs, accepted by the owner: every extra wallet is an extra draw
  (limited by the 300,000 $ELEVN holding and the 72-hour hold), and random packs with prizes
  weigh more on the pending legal review than shared packs would.

### 3.3 Penalty Shootout [Owner: side mini-game]
- Shooter picks a corner and power, keeper picks a dive; five rounds.
- You play against another player's stored picks, so there is no queue.
- No prize, because it is mostly guessing. No $ELEVN holding is needed to play. [Owner]
- Its leaderboard gets its own section of the site. [Owner]
- 10 ranked games a day per wallet, and unlimited unranked practice. [Owner]
- It is not a third mode: it sits as a small card under the two mode cards on Today.

## 4. Keeping it simple

Three places:

| Nav | What it holds |
|---|---|
| Today | What you can play now: the Blitz card, the Draft card, and the small Shootout card |
| Ranks | The Blitz daily and weekly boards, the Draft weekly board, and your prizes |
| Chat | The community room |

- Desktop, the main view: the three in the top bar. Phone: the same three in a bottom tab bar.
- Logged out, the home page is the scroll story. Logged in, the logo opens Today.
- Each mode is one card with one state and one button: Play, Live or Result.
- One scoring engine, one sign-in, one prize page for both modes.
- News, How to play, FAQ, About and Roadmap stay in the existing side menu, rewritten for the
  new modes. [Owner]
- Chat: a connected wallet that holds the tokens can post. [Owner]
- Notifications (push or Telegram when a squad is banked) are a feature for the future. [Owner]
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

- Holding 150,000 $ELEVN unlocks Blitz, the main mode. Holding 150,000 more (300,000 in all)
  also unlocks Draft. [Owner]
- One entry per wallet however much it holds: 3 Blitz squads a matchday and one draft a week.
  [Owner]
- A wallet can play the moment it holds the tokens. [Owner]
- The 60% prize share: Blitz 60%, Draft 40%. Shootout 0%. [Owner]
- Blitz: one pot per matchday, all of it to the daily board, made of Blitz's share of the fees
  collected since the last matchday. Draft: one pot per week, made of Draft's share of that
  week's fees. [Owner] A pot with fewer than 3 entrants rolls forward. [Owner: for the start]
- Minimum pots, topped up from the 10% low-volume reserve: 0.5 SOL per Blitz matchday and
  1 SOL per Draft week (0.05 and 0.1 on devnet). [Owner]
- Every prize board pays the top 5: the Blitz daily board, the Blitz weekly $500 and the Draft
  weekly board. [Owner]
- The split is steep, with 1st and 2nd far ahead [Owner]: 50% / 25% / 12% / 8% / 5% on all
  three boards, which makes the weekly $500 pay $250 / $125 / $60 / $40 / $25. [Owner]
- Blitz daily prizes are sent at day close, one transfer per winner, only if the wallet still
  holds the requirement; a failed transfer falls back to the daily batch. [Owner] Details in
  `docs/blueprint/BLITZ.md`.
- The 72-hour hold does not apply to Blitz daily prizes. It applies to the weekly prizes: the
  Blitz weekly prize and the Draft prize. [Owner]
- Draft uses the same holding rule as Blitz: the wallet must hold its requirement (300,000)
  when the prize is paid. [Owner]
- A review switch, on at the start: while it is on, prizes wait for the owner to look at the
  result and approve it, then send at once. No fixed delay. [Owner]
- Currency: every prize is paid in SOL while the site is on devnet, the weekly $500 included
  (its SOL equivalent). USDC is decided again before mainnet. [Owner]
- The Blitz weekly $500 is paid from the team's own wallet, not from creator fees, so it never
  reduces the daily pots. [Owner] It must go to the legal review.
- Sending at day close without the owner signing needs a key on the server: a separate payout
  wallet holding about a week of prizes, never the fee wallet. [Owner]
- Draft prizes are credited and sent when the week's last matchday closes, the same way as the
  Blitz weekly prize. The 14-part vesting goes with Season; no Season prizes are owed.
- One prize per wallet per board.
- The 72-hour holding rule is in config.toml but not enforced in code. It must be enforced
  before any weekly prize is paid.
- SOL prizes for Blitz and Draft stay on devnet until the legal review signs off in writing.

### 5.1 Owner's decisions, 2026-11-17 and 2026-11-18 (these replace anything above that disagrees)

**Prize release (replaces the 72-hour hold everywhere).** [Owner]
- It applies to every prize: Blitz daily, the Blitz weekly $500 and the Draft weekly prize.
- Prizes are not sent automatically. A winner's prize appears on the site and the winner presses
  a button, which asks their wallet to sign a transaction. Checking in daily is intended.
- Half of each prize can be collected at once ("Collect").
- The other half goes into the wallet's locked balance. Once every 24 hours the player may
  withdraw 20% of whatever is in the locked balance at that moment ("Withdraw").
- The 24-hour timer starts the first time the wallet ever collects, and restarts at each
  withdrawal. Missed days do not add up: one withdrawal per 24 hours.
- New wins add their locked half to the same balance. Owner's example: day 1 wins 2 SOL, collects
  1 SOL, 1 SOL locked. Day 2 wins 2 SOL, collects 1 SOL, the locked balance is 2 SOL, so the next
  withdrawal is 0.4 SOL.
- If the wallet no longer holds its required $ELEVN, the locked balance and its timer freeze
  until it holds again. Nothing is forfeited. This is crucial: it stops withdraw, sell, buy back,
  withdraw again.
- The locked balance never quite empties, because each withdrawal is 20% of what is left (1 SOL
  goes 0.2, 0.16, 0.128 and so on). This is intended: a player who keeps winning always has the
  instant half, and the locked part is a bonus for holding. No floor and no "withdraw the rest"
  rule. [Owner]
- One rule for the freeze: the wallet must hold the Blitz requirement (150,000 $ELEVN), whichever
  mode the prize came from. [Owner]

**When a result is final.** [Owner]
- A matchday's result is final 15 minutes after the day's last match ends, to allow for errors
  in the data provider, the database or the statistics. Prizes become collectable then.
- At the start the review switch is on: the owner looks at each result and releases it by hand.
  Later it is switched off and prizes become collectable automatically at the 15-minute mark.
  Either way the winner still presses Collect.

**Playing without a wallet.** [Owner, crucial]
- A visitor can use the whole site without connecting a wallet: browse, build Blitz squads, try
  the Draft screen, read Ranks and Chat. Nothing is saved.
- Connecting a wallet unlocks saving squads and creating a username. Prizes and posting in chat
  need the wallet and the tokens as before.

**Other rulings.** [Owner]
- Buying, winning and selling on the same day is allowed; people may buy, sell and play freely.
- Several wallets per person are allowed. More wallets mean more players and squads on the
  boards. No defence is to be built.
- Draft is the luck mode and Blitz the skill mode. Personal packs are random on purpose.
- Legal review comes last, after everything else.
- The payout wallet will be tested before any real prize is sent.
- Design: no blue light (steel, white light and gold only); the Shootout leaderboard is on the
  Shootout page; prize amounts show SOL as the main figure with dollars in small grey text.

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
- A captain on double points is mandatory in every Blitz squad and every Draft team.
- Prizes in SOL on devnet; the weekly $500 from the team's own wallet.
- One entry per wallet; play at once; the 72-hour hold only on weekly prizes.
- Draft: double matches both count; postponed players are swapped, automatically if need be.
- Chat for any connected wallet holding the tokens; Shootout needs no holding and gets its own
  leaderboard section; info pages stay in the side menu; notifications are for later.
- Section 2 design work goes through the Higgsfield MCP together with the references.

Still to confirm, on the design side only: the light rays, the Draft board and the Draft reveal
panel. Section 3 note: collecting and withdrawing need a claim flow from the payout wallet, which
replaces "prizes are sent" in the older sections above.
