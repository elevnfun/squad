# Run the new pages against the real API, locally

Needs Postgres (`scripts/db-container.sh`), `uv`, and the global Playwright. Nothing here touches `web/`'s `.next`.

## 1. Database and seed
```
sh scripts/db-container.sh                      # Postgres on 5433
createdb -h localhost -p 5433 squad_dev         # once; drop and recreate to start over
export DATABASE_URL=postgresql://localhost:5433/squad_dev
PYTHONPATH=. uv run python scripts/dev_seed.py  # loads db/schema.sql, seeds, prints the 6 wallets
```
The seed is idempotent. Yesterday's matchday ends in "review" with 6 entrants; a pot sits in `pot:blitz` and `pot:draft`.
`--finish-today` also finishes today's matchday (needs UTC time after 02:20), because Ranks only shows today's
matchday or later, so a released yesterday never appears there. Run it after the first release to see a final board.

## 2. API
```
RUN_JOBS=1 HOLDINGS_DEV_BALANCE=300000 FEE_WALLET=<admin wallet the seed prints> \
  uv run uvicorn squad.api:app --port 8000
```
`FEE_WALLET` makes that wallet the admin. `HOLDINGS_DEV_BALANCE` fakes the $ELEVN balance (no chain read).

## 3. Site, from a private copy
Port 3000 is required: `config.toml` only allows sign-in from `http://localhost:3000`.
```
W=/tmp/web-runlocal; mkdir -p $W && tar -C web --exclude=node_modules --exclude=.next -cf - . | tar -C $W -xf -
ln -sfn $PWD/web/node_modules $W/node_modules
cd $W && API_URL=http://localhost:8000 npx next dev -p 3000
```
Re-copy changed files into `$W` as you edit (the dev server hot reloads).

## 4. Browser run
`scripts/dev_drive.cjs` injects a Wallet Standard wallet whose `signIn` is signed with a real ed25519 key
(node crypto; keys derive from `sha256("elevn-dev-<name>")`, the same as the seed).
```
export NODE_PATH=$(npm root -g)
node scripts/dev_drive.cjs guest      # Today as a guest
node scripts/dev_drive.cjs me         # sign in, Today, Ranks (3 tabs)
node scripts/dev_drive.cjs release    # admin signs in, releases the first contest in review
node scripts/dev_drive.cjs after      # Ranks (final) and Winnings
node scripts/dev_drive.cjs collect    # presses Collect (needs a funded payout wallet to succeed)
node scripts/dev_drive.cjs blitz      # a whole Blitz matchday (below); about 8 minutes per width, waits on the minute job
node scripts/dev_drive.cjs draft      # a whole Draft week (below); needs a UK Friday to Monday
node scripts/dev_drive.cjs shootout   # Penalty Shootout (below); about 10 minutes
node scripts/dev_drive.cjs faucet     # the devnet test-token card on Today (the API's /me is given a faucet block)
```
Shots go to `docs/build/shots/real-*.png` at 1440 and 390 wide.

## Devnet test with a real wallet (Collect, Withdraw)
Env for the API:
- `PAYOUT_WALLET` public address and `PAYOUT_WALLET_KEY` its base58 secret key; fund it with devnet SOL.
  (The public devnet RPC no longer airdrops: `requestAirdrop` returns 410. Use faucet.solana.com or a transfer.)
- `FEE_WALLET` your own wallet's address, to open `/admin`.
- Real balance: leave `HOLDINGS_DEV_BALANCE` unset and give the API a devnet $ELEVN test mint (`SQUAD_TOKEN_MINT` env;
  or `access.token_mint` in config.toml), with the test wallet holding 300,000 of it.
- `SESSION_SECRET` any long random string, so sessions survive an API restart.
Env for the site: `API_URL`, `NEXT_PUBLIC_SOLANA_RPC` (default devnet). Open the site on `http://localhost:3000`.
Not set automatically: `API_GATE_SECRET` (leave unset locally).

## Matchday Blitz run
Today's matchday has 3 fixtures with full squads. `PYTHONPATH=. uv run python scripts/dev_seed.py --phase pre|live|ft|banked|closed [--clean]`
rewinds it and moves the fixtures to that phase (the API with `RUN_JOBS=1` then locks and scores within a minute);
`--clean` also drops the `me` wallet's squads. `node scripts/dev_drive.cjs blitz` runs all of it at 1440 and 390 (guest builds and
checks a squad; `me` saves 3, changes one, removes one, saves again; live; banked; Banked screen; Ranks; the Today card in each
state) and prints PASS/FAIL lines. It needs `DATABASE_URL` set as in step 1. Shots: `docs/build/shots/real-blitz-*.png`.

## Weekly Draft run
The Draft week's window is Friday to Monday, and the six seeded fixtures (900001 to 900006) fill it, so a Draft phase moves ALL SIX
(and the next Blitz seed puts them back; do not run the two drives at the same time).
`PYTHONPATH=. uv run python scripts/dev_seed.py --draft-phase pre|live|final [--clean]` rewinds the week and moves the fixtures:
every player gets a price, `ann ben cat dan admin` get dealt packs and a saved team, started matches get scores. `pre` also
works Tuesday to Thursday (kick-offs on Friday); `live` and `final` need a UK Friday to Monday, and `pre` clears the `me` wallet's
packs and team. `--draft-release` releases the week once the job has moved it to review. `node scripts/dev_drive.cjs draft`
runs all of it at 1440 and 390 (about 5 minutes per width): a guest opens sample packs, builds a team and the server checks it;
`me` opens 5 packs, saves a team, changes the captain, saves again, is refused a 3-Top team with the server's words; the lock passes
and the minute job locks and scores; live; every match over and review; released and final; the board on Ranks; the Today card in
each state. It prints PASS/FAIL. Shots: `docs/build/shots/real-draft-*.png`.

## Penalty Shootout run
`node scripts/dev_drive.cjs shootout` needs the API and `DATABASE_URL` as above; it empties `shootout_games` and `shootout_sets` first. At 1440 and 390:
a guest plays a whole practice game (5 penalties, 5 dives) to the end panel; `me` plays a ranked game (the "ranked games left today" count drops,
the board lists the wallet, its picks are stored); nine finished ranked games are inserted for `me`, so the page and the API show the daily limit;
`ben` then plays a ranked game and meets `me`'s stored picks exactly (the only stored set). It also checks that only one gold button is ever visible.
Shots: `docs/build/shots/real-shootout-*.png` (the 1440 save, goal and mid-flight shots are taken during the game, so they change from run to run).
The goalkeeper is drawn in SVG until `web/public/shootout/keeper-{ready,dive,catch}.png` exist; `next.config.ts` checks for the three files at build time.
