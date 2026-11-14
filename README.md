# elevn ($ELEVN)

Token-gated fantasy football on Solana. Hold the token to unlock a league area, pick a squad of real
players, score from live match data and win weekly prizes.

**Live at [elevn.fun](https://elevn.fun)** as a public test season on Solana devnet: test tokens from the
site's faucet, no real value.

This repo holds the backend (pricing, ingestion, scoring, game logic, web API) and the website in `web/`.

## Layout

| Path | What it is |
| --- | --- |
| `config.toml` | Every game number: scoring, squad rules, pricing, prizes, fees |
| `squad/scoring.py` | Scoring engine: match points, Rising Stars, captain, auto-subs |
| `squad/ingest.py` | API-Football to Postgres ingestion (rounds, live polling, injuries, settlement re-pull) |
| `squad/rules.py` | Save-time squad rules, transfer counting, weekly repricing |
| `squad/game.py` | Gameweek state machine per league, squad saving, squad scores, settlement |
| `squad/api.py` | Web API for the website: wallet sign-in, leagues, players, squads, points, leaderboards |
| `squad/auth.py` | Sign in with a Solana wallet (signed one-time message, session token) |
| `squad/holdings.py` | Token balance, 150k per squad, freezing squads a wallet no longer pays for |
| `squad/watcher.py` | Real-time holdings watcher (Solana WebSocket subscription to the token's accounts) |
| `squad/payouts.py` | Fee buckets, prizes at settlement, the daily owner-signed payout batch |
| `squad/chain.py` | Solana RPC and transaction building (no private keys) |
| `squad/devnet.py` | Devnet test token and test balances |
| `web/` | Next.js website (elevn.fun): wallet connect, squad builder, live points, leaderboards, result cards |
| `squad/simulate.py` | Two real gameweeks end to end on a scratch database, from the cache |
| `squad/apifootball.py` | API client with an on-disk response cache |
| `db/schema.sql` | Postgres schema |
| `squad_pricing.py` | Starting prices calibrated against FPL |
| `tests/` | Scoring, rules and game tests against hand-computed examples |

## Setup

```bash
cp .env.example .env          # add your API-Football key
uv sync                       # Python 3.11+, installs psycopg and pytest
scripts/db.sh start           # local Postgres on port 5433, data in .pgdata/
uv run python -m squad.ingest init
```

## Common commands

```bash
uv run pytest                                              # tests
uv run python squad_pricing.py --offline                   # reprice from cached data
uv run python -m squad.ingest fixtures                     # season fixtures and gameweeks
uv run python -m squad.ingest round --league premier-league --round 9
uv run python -m squad.ingest live                         # live polling during matches
uv run python -m squad.ingest final --league premier-league --round 9
uv run python -m squad.ingest injuries                     # who misses the open gameweek
uv run python -m squad.game prices --league premier-league # starting prices for the next open gameweek
uv run python -m squad.game run                            # gameweek state machine, ticks every minute
uv run python -m squad.game table --league premier-league --round 9
uv run python -m squad.simulate                            # end-to-end simulation (0 API calls)
```

## Website (local)

```bash
uv run python -m squad.simulate --open-window      # demo data in database squad_sim, next window open
DATABASE_URL=postgresql://localhost:5433/squad_sim HOLDINGS_DEV_BALANCE=300000 DEV_LOGIN=1 \
  SESSION_SECRET=dev uv run uvicorn squad.api:app --port 8000
cd web && pnpm install && NEXT_PUBLIC_DEV_LOGIN=1 pnpm dev   # http://localhost:3000
```

`DEV_LOGIN` / `NEXT_PUBLIC_DEV_LOGIN` add a "Demo sign-in" button for testing without a wallet
extension, and `HOLDINGS_DEV_BALANCE` pretends every wallet holds that many tokens. Never set
them in production. Production needs `SESSION_SECRET` (a long random value), `SQUAD_TOKEN_MINT`
(or `access.token_mint`), `SOLANA_RPC`, and `API_URL` / `SITE_URL` for the website.

## Solana (devnet)

```bash
uv run python -m squad.devnet setup                          # test $ELEVN mint (keys in keys/, git-ignored)
uv run python -m squad.devnet give --to <wallet> --amount 300000
uv run python -m squad.devnet fees --to <fee wallet> --sol 0.5   # fake fee income
SQUAD_TOKEN_MINT=<mint> uv run python -m squad.watcher        # real-time holdings and freezes
```

Payouts: sign in on the site with the fee wallet (`FEE_WALLET`), open Payouts, prepare the day's
batch and approve it in the wallet. The server never holds the fee wallet's key and only accepts
the exact transactions it built.

## Gameweeks

Each league area runs its own cycle: `open` (transfer window) → `locked` (first kickoff; unsaved
squads carry over) → `live` → `settling` (all matches over) → `settled` (final re-pull, Rising Star
levels, final scores, next week's prices). A match moved more than 4 days from its round counts in
the gameweek it is played in. Drafts are never checked; every squad rule is checked on save.

## Scoring

```
match score = (core+ + involvement) x Rising Star x captain + core-
```

Core points are FPL's values doubled. Involvement points (passes, key passes, shots on target,
tackles, duels won) are capped at 4 per match. Negative points are never multiplied.
