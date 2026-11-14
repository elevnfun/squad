# elevn (squad repo)

## CRUCIAL: project outline for elevn 2.0

Read `docs/blueprint/BLUEPRINT.md` before any work on game modes, navigation or the home page.
It is the plan of record. Do not build anything in it until the owner has approved it.

The project runs in four sections, in this order:
1. Blueprint and planning: `docs/blueprint/BLUEPRINT.md`, debate record in `docs/blueprint/DEBATE.md`.
2. Design: design and motion on top of `web/DESIGN.md`. References: elevn.fun, rive.app (motion,
   layout, how sections connect), and the 3D website guide summarised in the blueprint, section 6.
   Crucial visuals are built in code, with no AI-generated imagery.
3. Functionality confirmed: build and test each mode.
4. Trial and error.

Owner's decisions (2026-11-14):
- Two game modes only: Matchday Blitz and Draft. Season (the weekly squad-of-15 game) is removed,
  and Squad Battles with it.
- Draft: weekly. 5 personal packs of 3 (15 players, different for every wallet) across the three
  leagues; a five-a-side with at least 1 defender, 1 midfielder, 1 attacker; no goalkeepers; at
  most 2 players per club; paid weekly.
- Blitz: full rules in `docs/blueprint/BLITZ.md`, which replaces every earlier Blitz rule. 3 squads
  per matchday on any 3 fixtures the player chooses; each squad is 3 players from one fixture (at
  least 1 from each club) and locks at its own kickoff; one live daily leaderboard; a "banked"
  moment after each full time; the daily prize is sent at the last whistle of the day; a fixed
  $500 weekly prize. No per-fixture prizes and no full-time leader bonus.
- Prize split: Blitz 60%, Draft 40%. Prizes in SOL while on devnet.
- Access: holding 150,000 $ELEVN unlocks Blitz (the main mode); 150,000 more (300,000 in all)
  also unlocks Draft. Draft pays the top 5.
- A captain on double points is mandatory in every Blitz squad and every Draft team.
- One entry per wallet however much it holds. A wallet can play as soon as it holds the tokens.
  The 72-hour hold applies only to weekly prizes (Blitz weekly and Draft), not Blitz daily prizes.
- The $500 weekly prize is paid from the team's own wallet, not from creator fees.
- Draft: a club's two matches in a week both count; a player whose match is postponed or cancelled
  is swapped out, automatically if the manager doesn't do it.
- Penalty Shootout stays as a side mini-game with no prize and no holding requirement; its
  leaderboard gets its own section.
- Chat: any connected wallet holding the tokens can post. Info pages stay in the side menu.
  Notifications are a feature for the future.
- Section 2 design goes through the Higgsfield MCP, with the references.
- Live predictions are parked.
- The site's News page carries football news, not platform news. Platform updates go on X.
  Our own short write-ups of the facts with the source named, items from the site's match data,
  and RSS headlines linking out. Never republish scraped articles.
  Sources: the three leagues' official sites, Sky Sports, BBC Sport and FotMob.
- First visit: an interactive tutorial built into the website highlights each area and explains
  it, and can be skipped. Not a PDF. Built last, after the rest of the website is complete.
- Above all: do not overcomplicate the platform or let it get jumbled.

Background: `docs/blueprint/reference/six-formats.md`. Every game number lives in `config.toml`.
