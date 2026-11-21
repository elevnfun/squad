# Head review: Draft page, Today's Blitz and Draft cards, Ranks "your line" (2026-11-21)

| Area | Verdict |
|---|---|
| Draft page | approve with changes (2 blockers) |
| Today: Blitz card and Draft card | approve with changes (2 blockers) |
| Ranks "your line" | approve with changes (no blocker) |

None of the changes below has been applied. I read the code, `config.toml` `[draft]`, the "draft" routes in
`squad/api.py` (lines 967 to 1069), `squad/draft.py`, the mockups (`draft.html`, `draft-guest.html`,
`today.html`) and the screenshots (`draft-*`, `real-draft-*`, `real-blitz-today-*`). I did not run the site.

What is right on the Draft page: every rule on the page is read from `rules` in the API answer and matches the server
(5 packs of 3, one Top / Mid / Budget each, team of 5, at least 1 DEF / MID / FWD, no goalkeepers, at most 2 per club,
at most 2 Top and 2 Mid, Budget unlimited, captain ×2, 300,000 to save). There is no formation picker; the board follows
the picks ("Shape 3-1-1"). The board is steel with green lines, the reveal panel is there, the pack hover video plays on
hover only and not under reduced motion. Captain points are shown as the API sends them (already doubled, e.g. "19 pts"),
not doubled again. Prize split 50 / 25 / 12 / 8 / 5, SOL only. One gold button per view (Open pack while packs are
sealed, Save team after). LIVE is the only red.

## 1. Draft page (`web/src/app/(site)/draft/DraftView.tsx`, `draft.css`; server `squad/draft.py`, `squad/api.py`)

1. **Blocker: a valid team can be refused Save by the check.** `DraftView.tsx` line 382 needs the server check to pass
   (`problems.length === 0`) before Save is enabled. The check route (`api.py` lines 1041 to 1045) calls `draft.check`
   (`draft.py` lines 159 to 167), which works out every player's tier again from today's prices (`_eligible`), while the
   page and `draft.save` use the tier stored when the packs were dealt (`_info`, from `draft_packs`). Tiers are ranks by
   price, so any new price row after Tuesday's deal moves players across the Top / Mid line, and a player who changed club
   returns "Some of those players are not available this week." The player then sees "Pick at most 2 top players." beside
   a board that shows 2 Top, and cannot save. Fix (server, signed-in wallets use their stored 15, guests unchanged):
   - `api.py` line 1042: `def draft_check(week: str, body: DraftCheckIn, wallet=Depends(optional_wallet), conn=Depends(db)):`
     and line 1044: `draft_call(conn, draft.check, c["id"], body.pool_player_ids, body.team_ids, body.captain_id, wallet)`.
   - `draft.py` line 159: `def check(conn, contest_id, pool_player_ids, team_ids, captain_id, wallet=None):` and, right after
     `contest = _contest(...)` on line 161:
     `if wallet and (info := _info(conn, contest_id, wallet)): return _problems(info, team_ids, captain_id)`.
   The page already sends the token (line 263, `tk`).

2. **Blocker: a guest's team is wiped when he connects, with no warning, by a button that says it will save it.** The
   guest builds a five from sample packs; "Connect wallet to save" (line 632) signs in, line 223 clears the picks, and the
   wallet's own 15 replace the sample. Nothing is saved, and nothing said so. The label is the owner's standing one
   (checklist line 12) and stays; the words beside it must tell the truth:
   - line 394, guest branch: `"Sample team: connecting deals your own fifteen, so this team is not kept."`
   - line 638: `Guest view: everything here works, nothing is saved. Connecting deals your own five packs.`

3. **Holder below 300,000 $ELEVN hits a dead end.** Line 391: "Hold 300,000 $ELEVN to save a team." beside a disabled
   outlined Save, and the player learns it only after building the whole five. Same fix as Blitz review item 4: line 391
   text `` `Hold ${count(rules.requirement)} $ELEVN to save a team. Your picks stay here until you leave the page.` ``; in
   lines 630 to 631, when `blocked`, render
   `<a className="e2-btn e2-btn-gold" href={process.env.NEXT_PUBLIC_ELEVN_BUY_URL ?? "https://jup.ag"} target="_blank" rel="noopener noreferrer">Get $ELEVN</a>`
   instead of Save, and make "Open pack" (line 450) outlined when `blocked` so there is still one gold.

4. **The swap offers swaps the server refuses.** Lines 313 to 318 and 602 to 613: the drop-down lists all five players,
   and `swapIn` takes the highest-valued unused player of the position without the server's other tests
   (`draft.py` `_swap_problem`, lines 235 to 248: the player's match must be called off, the replacement's match must not
   have kicked off, the club and tier caps still hold). So the player is offered "Swap" for a player whose match is on,
   or one replacement the server rejects, with no other choice. Fix, all from data the page already has
   (`data.fixtures` carries `status`, `kickoff`, `home`, `away`, and those names are the same club names as the pool):
   - `const OFF = ["PST", "CANC", "AWD", "WO"];`
     `const clubFx = (club: string) => data.fixtures.filter((f) => f.home === club || f.away === club);`
     `const calledOff = (club: string) => clubFx(club).every((f) => OFF.includes(f.status));`
     `const canPlay = (club: string) => clubFx(club).some((f) => !OFF.includes(f.status) && Date.parse(f.kickoff) > (now ?? Date.now()));`
   - `swapIn`: filter `all` also by `canPlay(p.club)` and by `evaluate(newTeam, captainAfter, rules).every((c) => c.state === "ok")`,
     where `newTeam` is the team with `out` replaced by `p` (players looked up in `all`).
   - Options on line 607: only `mine.team` players with `calledOff(club)`; render the `<details>` (line 601) only when there
     is at least one. The `value` default on lines 606, 609, 610 becomes the first such player.

5. **The board clips a row of three.** `real-draft-live-1440.png`: the captain "DEF 9143 · Madrid White…" is cut at the
   pitch's right edge; `real-draft-team-ready-1440.png` shows the same row touching both edges. Three seats need
   3 × 120 + 2 × 72 = 504px, the pitch is about 410px inside. `draft.css` line 163:
   `.dp-brow { display: flex; align-items: center; justify-content: space-evenly; gap: 8px; }` and line 164:
   `.dp-pl { flex: 0 1 120px; min-width: 0; text-align: center; font-size: 13px; font-weight: 600; color: var(--text); }`.
   Delete the phone `gap: 24px` on line 263 (keep `width: 76px` as `flex-basis: 76px`).

6. **Server refusals use words the page does not.** The page says "attacker" / "ATT" and "Top"; `draft.py` line 147
   says "Pick at least 1 FWD." and line 153 "Pick at most 2 top players." These reach the player verbatim on a refused
   save (line 307). Fix line 147: `problems.append(f"Pick at least {need} {dict(DEF='defender', MID='midfielder', FWD='attacker')[pos]}.")`
   and line 153: `problems.append(f"Pick at most {most} {tier.capitalize()} players.")`.

7. **The release rule reads as automatic.** Line 551: "the rest is released 20% every 24 hours". Nothing is released by
   itself; the player withdraws 20% of what is locked. Fix: `Half is collectable at once; you can withdraw 20% of the locked rest once every 24 hours. See <Link …>Winnings</Link>.`
   (The mockups carry the old words too.)

8. **The lead line runs into the rays.** At 1440 the lead ends at x ≈ 930, under the light rays beside the h1; "the top
   five." loses contrast (`real-draft-team-ready-1440.png`). `draft.css` line 37: `max-width: 62ch;`.

## 2. Today: Blitz card and Draft card (`web/src/app/(site)/today/TodayView.tsx`)

1. **Blocker: the page is wider than a phone.** `real-blitz-today-guest-390.png` and `real-blitz-today-pick-390.png` are
   493px wide, `real-draft-today-guest-390.png` and `real-draft-today-packs-390.png` 570px: "Pick 3 fixtures" and "Open
   your 5 packs" are 36px `nowrap` text in a half-width cell, and the countdown and pot are pushed off the card. Say it as a
   number, like "3 of 3 set" already does:
   - line 194: `<span className="e2-big">{allowed}<small>to pick</small></span>`
   - line 317: `<span className="e2-big">{total - opens}<small>{opens ? "still to open" : "to open"}</small></span>`
     (this also stops "Open your 5 packs" showing after 3 of 5 are opened).

2. **Blocker: a guest, or a wallet that never played, is shown a result.** `real-blitz-today-guest-390.png`, Draft card,
   week over: "Final total 0 pts · Final place – · Prize won: Nothing this time · Collect it on Winnings". A guest cannot
   have played. Same for a signed-in wallet with no team or squads once the contest is over (`state` is "closed" whatever
   `hasTeam` is, lines 302 and 178). Fix:
   - Draft line 302: start with `over && !hasTeam ? "missed" :`. In the `missed` branch (lines 323 to 326), when `over`
     use `nums = <><div><span className="lbl">Team</span><span className="e2-big">{signedIn ? "None" : "–"}</span></div>{potBox}</>`
     and note `{signedIn ? "No team this week" : "Guests can try the Draft; nothing is saved"}`; the button stays
     "Open the board".
   - Blitz line 178: `over && squads.length === 0 ? "plain" :` before `over ? "closed"`, so the plain card with the pot
     and "Open the board" (lines 231 to 240) shows.

3. **"Collect it on Winnings" when nothing was won.** Lines 223 and 350 say it for every final result. Fix: in both,
   `c?.state === "final" && (mine?.prize_lamports ?? 0) > 0 ? "Collect it on Winnings" : "Final result"`.

4. **Guest cards drift from the mockup.** `today.html` gives a guest one plain sentence and a "Try" button; the build
   shows the signed-in numbers. Fix, when `!signedIn && !over`:
   - Blitz: `nums` replaced by `<p className="none">Build three squads on any three of this matchday's matches. You can try it now; connect a wallet to save them.</p>`, button text "Try Blitz" (outlined).
   - Draft: `<p className="none">Look at sample packs and pick a five-a-side. Your own five packs are dealt when you connect.</p>`, button "Try Draft".
   (The mockup's "today's" and "5th place pays … today" are not used: "matchday", never "today" or "daily".)

## 3. Ranks "your line" (`web/src/app/(site)/ranks/RanksView.tsx`)

Ties are right: tied wallets share the prizes of the places they cover (lines 102 to 114 match `pots.split`), the line
under 3 entrants says the pot rolls forward, a final board reads the stored prize, the weekly board is in dollars.

1. **An estimated pot is stated as fixed.** Line 108 prints "1st pays 0.30 SOL" while the server only estimates the pot
   (`contest.pot_estimated`). Fix line 108: `` return { text: `${c.pot_estimated && c.state !== "final" ? "about " : ""}${solOf(c.pot_lamports * pct / 100 / n)}`, usd: false }; ``

## Weak, not blocking
- Draft: after the lock the headings still read "Open your five packs" and "Pick five, name a captain"
  (`real-draft-live-1440.png`); "Your five packs" and "Your five-a-side" would fit every state.
- Draft: the guest banner (line 405) says "save your squads"; on this page it is a team.
- Draft: "Not ready: at most 2 Top and 2 Mid players." (line 387) does not say which rule is over; "You have 3 Top players; the most is 2." is clearer.
- Draft: club names cut in the chips ("Dortmund Yell…", `real-draft-tier-refused-1440.png`).
- Draft: prize rows mix formats ("0.30 SOL", "0.072 SOL") because they are built from the float `pot_sol`; use `pot_lamports`.
- Draft: the mockup's line "Every fifteen holds at least 2 defenders, 2 midfielders and 2 attackers" was dropped (true on the server, `MIN_IN_DEAL`).
- Draft: the server does not refuse a save before Tuesday; it relies on the week's contest being created then.
- Today: "Matchday Blitz · 3 squads" (line 248) is typed in; use `live?.day.squads_allowed ?? 3`.
- Ranks: before any kick-off every entrant is tied 1st, so the line says "You are 1st, in the prizes" with a share of the pot.
- Footer (every page): "Premier League / La Liga / Bundesliga" links under Play; league pages are removed (checklist line 3).
- Split percentages, "3 players", "15 minutes" and the $500 are still typed into the pages, not read from `config.toml`.
