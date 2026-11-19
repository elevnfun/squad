# Section 3, step 1: Foundations (plan for the owner's approval)

Written 2026-11-19. Nothing here is built yet. This covers only the first step of the build order
in blueprint section 8. Blitz, Draft, Shootout, retiring Season, the home page, News and the
tutorial each get their own short plan later.

## What foundations delivers

When this step is done, the site has the new skeleton and no game on it yet:

- The three-tab site (Today, Ranks, Chat) with the side menu, working with and without a wallet.
- A Today page with the Blitz, Draft and Shootout cards in a "coming" state.
- A Winnings page where a prize can be collected and the locked half withdrawn, tested on devnet
  with test prizes.
- An admin switch where the owner releases a result.
- The database and the config ready for both modes.

The current Season game keeps running untouched until build step 5 retires it. Everything below
is added beside it.

## The pieces

### 1. Config (`config.toml`)
New sections with every new number: Blitz (3 squads of 3, captain x2, 150,000), Draft (5 packs of
3, five-a-side, at most 2 per club, 300,000), the 60 / 40 pot split, top 5 at 50 / 25 / 12 / 8 / 5,
minimum pots (0.5 and 1 SOL; 0.05 and 0.1 on devnet), fewer than 3 entrants rolls forward, final
after 15 minutes, review switch on, collect half, withdraw 20% every 24 hours, freeze below
150,000, the weekly $500, the payout wallet's address. `min_holding_hours = 72` is removed.
Season's numbers stay until step 5.

### 2. Database (`db/schema.sql`), all new tables
- **contests**: one row per Blitz matchday, per Blitz week and per Draft week. Holds the dates,
  the pot, and a state: open, live, in review, final.
- **entries**: a wallet's saved squad or team in a contest, with its players and captain.
- **results**: points, captain points and place for each entry. The Blitz weekly board is the sum
  of that wallet's matchday results from Tuesday to Monday.
- **winnings**: one row per wallet: ready to collect, locked, when the next withdrawal opens,
  and when a freeze began.
- **winnings_events**: every credit, collect and withdrawal with its transaction signature. The
  balances can always be rebuilt from this list.

### 3. Calendar (`squad/contests.py`, new)
A matchday is a UK date with at least one fixture in the three leagues. A week runs Tuesday to
Monday UK time. This creates the contest rows from the fixture list already in the database.

### 4. Pots (`squad/payouts.py`)
Fee income is split into a Blitz pot (60% of the prize share) and a Draft pot (40%), in place of
the per-league pots. Minimum top-up from the reserve and the roll-forward rule are applied when a
contest closes.

### 5. Result finality and release (`squad/contests.py`, admin page)
A contest goes to "in review" 15 minutes after its last match ends. With the review switch on, the
owner presses Release in the admin page; with it off, release is automatic. Release credits each
winner's row in winnings: half to ready, half to locked. No SOL moves at this point.

### 6. Collect and Withdraw (`squad/winnings.py`, new)
- The player presses Collect or Withdraw. The server builds a transfer from the payout wallet to
  the player, signs its side, and the player's wallet signs and sends it. The balance changes only
  once the transaction is confirmed on chain.
- Withdraw gives 20% of the locked balance. The 24-hour timer starts at the wallet's first
  collect and restarts at each withdrawal.
- Below 150,000 $ELEVN: Withdraw is refused and the timer stops. It resumes with the same time
  left when the wallet holds again. Nothing is lost.
- The payout wallet is a new wallet, separate from the fee wallet. Its key lives on the server as
  a secret. The owner tops it up with about a week of prizes.
- Tested with the owner's own example: win 2 SOL, collect 1, 1 locked; win 2 more, collect 1,
  locked is 2, next withdrawal 0.4.

### 7. Guest mode (API and web)
Every page and every "check my squad" call works with no wallet. Only saving, usernames,
collecting and posting in chat ask for one. A guest's picks live in the open page only and are
gone on refresh.

### 8. Web shell (`web/`)
The top bar with Today, Ranks and Chat (a bottom tab bar on the phone), the side menu with the
info pages and the Shootout link, the wallet chip, and the Today, Ranks and Winnings pages built
from the approved mockups. Logged out, the logo opens the home page; logged in, it opens Today.
The home scroll story itself is build step 6, so the present home page stays until then.

## Who builds what

One owner per file. Each builder gets a self-contained brief and its work goes through a head
agent before the owner sees it.

| Order | Work | Files | Model |
|---|---|---|---|
| 1 | Config and database | `config.toml`, `db/schema.sql` | Strong |
| 2 | Calendar, contests, finality | `squad/contests.py`, its tests | Strong |
| 2 | Pots | `squad/payouts.py`, its tests | Sonnet |
| 3 | Collect and Withdraw | `squad/winnings.py`, `squad/chain.py`, its tests | Strong |
| 4 | API routes | `squad/api.py`, its tests | Sonnet |
| 5 | Web shell and pages | `web/src/...` | Sonnet |

Each backend piece ships with tests. The web pages are checked against the mockups at 1440, 1920,
1024 and 390 wide.

## Assumptions, to be corrected if wrong

- The player pays the network fee on Collect and Withdraw (a fraction of a cent). This is what
  "a wallet-signed transaction" means in practice.
- The weekly $500 is turned into SOL at the SOL price at the moment the week's result is final.
- Nothing is deployed to elevn.fun during the build. Work stays on the branch and on devnet.

## Not in this step

Blitz picking and scoring, Draft packs, Shootout, removing Season, the animated home page, News,
the tutorial, mainnet, the legal review.
