# Handoff for the next session (written 2026-11-19)

Read this first, then `CLAUDE.md`. This file says where the project stands, what is still open,
and how to start the next section without re-reading the old conversation.

## Where the project stands

| Section | State |
|---|---|
| 1. Blueprint | Done. `docs/blueprint/BLUEPRINT.md` (v9). Section 5.1 holds the newest rules and wins over older text. |
| 2. Design | Done (2026-11-19), including the owner's eight points. |
| 3. Build | Under way. Foundations, Matchday Blitz and Draft are built: see "Section 3 (the build): progress". |
| 4. Trial and error | Not started. |

Before writing any build code, get the owner's approval of the foundations plan (see "Open with
the owner").

## What exists

- **Animated home page** (three.js glass ball, seven scroll beats, hold to open, Blitz fixture
  cards, Draft packs): `docs/design/prototype/home/`, engine in `docs/design/prototype/ball/`.
  Its README explains every part, the URL options and the known weak points.
- **Product screens and info pages** (static mockups with sample data): `docs/design/mockups/`.
  Today, Blitz pick, Banked, Ranks, Chat, Draft, Shootout, Winnings (five states), the username
  step, guest versions, the side menu, News, How to play, FAQ, About, Roadmap, and a phone view of
  all of them. `index.html` there lists every screen.
- **Design rules:** `web/DESIGN.md` is the source of truth for look and motion. Its "Owner's
  rulings" list at the end is the newest part.
- **Generated artwork:** `docs/design/prototype/home/art/` holds `pack.png`, `pack-hover.mp4`,
  `pack-hover.webm` (Draft pack and its hover video) and `card.png` (Blitz fixture card). These
  came from Higgsfield. Everything else is code.
- **Lessons and the review checklist:** `docs/design/LESSONS.md`. Every agent reads the top of it
  (down to the end of "Head agent's review checklist") and appends what it learned.

## Links the owner uses (private to him)

- Home page: https://claude.ai/artifact/Q2oKcCQt8mgJzXpzjyAZN4 (add `#stats` for the speed readout)
- Product screens and info pages: https://claude.ai/artifact/JXM7nkYkWQng12puK8hMYP
- Agent status snapshot: https://claude.ai/artifact/NDkDbLRnFZ5KDnJtAJHr1T

Artifact slugs for republishing: home `ba827aaa-5752-4411-b163-2eb9b065522d`, screens
`8de81161-545f-4a0a-b235-9e63c5012c5c`, status `abd77878-5109-43dd-a98c-413bbd62a56e`. Read each
with `get_artifact` first to get the live version id.

## Open with the owner

Section 2 (design) is complete: the owner's eight points of 2026-11-19 are all live on the screens
link, including the minimal Banked poster with the shared captain figure (`art/captain.png`, 1
Higgsfield credit spent; the other three options are in `art/captain-options/`). On 2026-11-19 he
said: start building, with a team of agents on a cheaper model (Sonnet builders; the lead reviews).

Nothing is waiting on him. He may still prefer another of the four captain figures.

## Section 3 (the build): progress (state on 2026-11-21)

Backend suite: 268 passed, 10 skipped. Every page below has been run against the real API in the
container (`docs/build/RUN_LOCAL.md`; `node scripts/dev_drive.cjs blitz` and `... draft` repeat the runs).

| Step | State |
|---|---|
| 1. Foundations (config, tables, pots, winnings, contests, shell, Today, Ranks, Winnings, admin release) | Done. Head reviews applied: `REVIEW_RANKS_WINNINGS.md`, `REVIEW_BLITZ_ADMIN.md` (both in `docs/build/`) |
| 2. Matchday Blitz (`squad/blitz.py`, routes, `/blitz`, `/blitz/banked`, Today card) | Built, head-reviewed, fixes applied. Plan: `docs/build/BLITZ_PLAN.md` |
| 3. Draft (`squad/draft.py`, routes, `/draft`, Today card) | Built. Head review in `docs/build/REVIEW_DRAFT_TODAY.md`: check whether its changes are applied. Plan: `docs/build/DRAFT_PLAN.md` |
| 4. Penalty Shootout, 5. retire Season, 6. home page, 7. News, 8. tutorial | Not started |

Decisions the lead took on 2026-11-21 (the owner was told; change them if he objects):
- Boards show an estimated pot before release (`pots.estimate`, `pot_estimated` in the API).
- A cancelled claim is held for 5 minutes. The locked half appears when a result is released.
- Draft tiers by value: top 20% Top, next 30% Mid, the rest Budget (`[draft].tier_shares`).
- The release screen sends the pot the owner checked; the server refuses if it changed, and results
  of one mode are released in date order.
- Boards are read without writing; the minute job keeps the results rows fresh.

Open with the owner:
- He must test Collect and Withdraw on devnet with a real wallet and a funded payout wallet. It
  could not be done here: the public devnet refuses airdrops. Steps: `docs/build/RUN_LOCAL.md`.
- Match bonus in Blitz: the rules say on, `config.toml` marks it deferred, so it is not counted.
- The real "Get $ELEVN" link.

Known gaps:
- While Season squads exist, fee income goes to Season's pots; Blitz and Draft get only the reserve
  top-ups until Season is retired or `payouts.record_income` is changed.
- A match's end is estimated as kickoff + 2 hours. Two open matchdays show the same estimated pot.
- The weekly board shows no would-be prize before release. Draft's swap control and the called-off
  path are untested in a browser. Nothing is deployed.
- The video session (promo video, `docs/design/video/`) pushes to this same branch: fetch and merge
  before pushing.

How to run things here:
- Tests: `scripts/db-container.sh` first (Postgres on 5433), then `uv run -q pytest -q`. Each test
  file uses its own database name.
- Web: `npx -y pnpm@8 install --frozen-lockfile` in `web/`. Never run two `next dev` in the same
  `web/`: each agent uses a private copy and its own port. Use the globally installed Playwright.
- Builders are Sonnet with short briefs (task, files owned, the rules needed, a short reading list);
  the lead reviews backend code itself; page reviews go to a fresh reviewer on a stronger model.

## Rules that are easy to get wrong

- Two modes: Matchday Blitz and Draft. Penalty Shootout is a side game with no prize.
- The Blitz board and prize are "Blitz matchday", never "daily". "Daily" is only the 24-hour
  withdrawal cooldown.
- Prizes are never sent. A result is final 15 minutes after the day's last match; the owner
  releases it by hand at the start (review switch); the winner presses Collect. Half is collectable
  at once; the other half joins a locked balance, 20% of which can be withdrawn once every 24
  hours. The timer starts at the wallet's first collect and restarts at each withdrawal. Below
  150,000 $ELEVN the locked balance and timer freeze. The locked balance has no floor.
- Guest mode is crucial: the whole site works without a wallet; nothing is saved.
- Every board pays the top 5 at 50 / 25 / 12 / 8 / 5. Weekly Blitz prize $500.
- One gold button per view. Red only for LIVE and FROZEN. No blue. "Play free", never "No entry fee".
- Report the price and get a yes before spending Higgsfield credits (balance about 1,132.5; 30
  spent so far). The Katana promo waits until the platform is ready. Legal review comes last.
- Older lines near the top of `CLAUDE.md` and the body of `docs/blueprint/BLITZ.md` still mention
  the 72-hour hold, "daily" and prizes being sent. The block "Rules changed on 2026-11-17 and
  2026-11-18" in `CLAUDE.md` and blueprint section 5.1 replace them.

## Section 3 (the build): how to start

Do not begin until the owner approves the foundations plan and says the build can start.

Order from the blueprint (section 8): foundations, Matchday Blitz, Draft, Penalty Shootout, retire
Season, home page, News, first-visit tutorial.

Pieces added by this week's decisions, which the older blueprint text does not plan in detail:

- **Winnings ledger and claim flow.** Per-wallet balances (ready to collect, locked), the 24-hour
  withdrawal timer, the freeze below 150,000 $ELEVN, and wallet-signed Collect and Withdraw paid
  from the separate payout wallet. `min_holding_hours = 72` in `config.toml` is obsolete.
- **Result finality.** Final 15 minutes after the day's last match, with the owner's review switch.
- **Guest mode.** Every screen usable without a wallet; saving and usernames need one.
- **Naming.** "Blitz matchday" in every string, table and API field shown to users.

Existing code to read before planning: `squad/` (scoring, ingest, game, api, payouts, holdings,
chat), `db/schema.sql`, `config.toml` (every game number lives there), and `web/` (Next.js 15,
React 19, Tailwind 4; three.js is not yet a dependency of `web/`). Season code is still present
and is retired in the build order above.

The plan for "foundations" is `docs/build/FOUNDATIONS_PLAN.md`. Build nothing until he approves it.

## How to work (the owner's instructions)

- **Model:** run the main session on Fable. It plans, briefs and checks. Give layout, styling and
  routine code to Sonnet workers; keep Fable for hard engine or architecture work and for the head
  agent's reviews.
- **Briefs:** agents never see the chat. Each gets one self-contained brief: the files it owns
  (one owner per file), the facts and numbers written out, a short reading list, what "done"
  means and how to check it. Do not send agents to read the whole blueprint.
- **Head agent:** builders' work is reviewed by a head agent against the checklist in
  `docs/design/LESSONS.md` before it reaches the owner. Start a fresh head agent for each review
  round rather than resuming an old one; the checklist and lessons carry the memory.
- **Lessons:** every agent appends a short entry to `docs/design/LESSONS.md`.
- **Reporting to the owner:** short and plain. Say what was done, what is weak, what he must
  decide. End a reply with "DONE." only when every task in hand is finished.
- **Git:** work on `claude/compassionate-carson-at7vkz`. Commit and push often; a hook asks for
  it. No pull request unless he asks.

## Practical notes for a fresh container

- `node_modules` is not committed. Run `npm install` in `docs/design/prototype/home` (three.js
  and two fonts) before serving or capturing.
- Serve the prototype from `docs/design/prototype` (`python3 -m http.server 8772`) and open
  `/home/index.html`. `?still=1&p=<0..1>` freezes a beat (0, 0.2, 0.4, 0.56, 0.72, 0.88, 1).
- Chromium and Playwright are pre-installed. WebGL needs the launch args
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
  and is software-rendered: it can count work but cannot show real speed.
- To republish the home page: from `docs/design/prototype/home`, bundle with
  `npx esbuild home.js --bundle --format=esm --minify --outfile=<out>/home.bundle.js`; copy
  `home.css` with font paths rewritten from `node_modules/@fontsource/<name>/files/` to `fonts/`;
  copy `index.html` with the importmap script removed and `src="home.js"` changed to
  `src="home.bundle.js"`; copy the six woff2 files into `fonts/`, plus `art/` and `poster/`.
  Then publish those files to the home artifact.
- To republish the screens: publish every `.html`, `.css` and `.js` in `docs/design/mockups/`,
  plus `art/pack.png` and the three `shots/compare-*.png` files, to the screens artifact.
- The owner cannot see a preview pane for servers in this container. Use the artifact links.
