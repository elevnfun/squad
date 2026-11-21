# Head review: Blitz pick page, Banked screen, admin release, Winnings re-check (2026-11-21)

| Area | Verdict |
|---|---|
| Matchday Blitz pick page | approve with changes (1 blocker) |
| Banked screen | approve with changes (1 blocker) |
| Admin "Results to release" | approve with changes (2 blockers) |
| Winnings after its fixes | approve |

None of the changes below has been applied. I read the code and the screenshots (`real-blitz-*`,
`blitz-*`, `banked-*`, `admin-release-*`, `real-admin-*`). I did not run the site.

## 1. Matchday Blitz pick page (`web/src/app/(site)/blitz/BlitzView.tsx`, `blitz.css`)

1. **Blocker: "you'd win 0 SOL" while the matchday is open or live.** Line 576 shows
   `sol(you.prize_lamports)` from `/api/contests/{id}/board`. That route (`squad/api.py` lines 853 to 866)
   returns `results.prize_lamports`, which stays 0 until `contests.release` runs `pots.settle`. So a wallet
   in the top 5 reads "If the day ended now you'd be 2nd and win 0 SOL." The same 0 is why line 550 always
   falls back to a flat 5% that ignores ties (the 1440 live shot has five wallets tied 1st and still says
   "5th place pays 0.06 SOL").
   - Fix (server, one place, also fixes the same 0 on Ranks): in `contest_board`, when
     `c["state"] not in ("final", "rolled")`, work out
     `est = {w: lam for w, _, lam in pots.split(shown_pot(conn, c)[0], [(r["wallet"], r["points"], r["captain_points"]) for r in rows])}`
     and put `est.get(r["wallet"], 0)` in each line's `prize_lamports` / `prize_sol`. This is the same sum
     `place_and_prize` (lines 951 to 960) already does for the Banked screen, so the two pages agree.
   - Page: line 576 prefix "about " when `contest.pot_estimated`, as line 550 already does.
2. **"Today's" when the matchday is not today.** `/api/blitz/next` returns the next matchday that is not
   final, which on a Thursday is Saturday's. Line 608 ("today's matches") and line 616 ("Today's 3
   fixtures") are then wrong. Fix: `const ukToday = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });`
   `const dayWord = contest.day === ukToday ? "today's" : \`${new Date(\`${contest.day}T12:00:00Z\`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}'s\`;`
   and use `dayWord` in both lines (capitalised on line 616).
3. **Fixture names cut off at 1440.** `real-blitz-live-1440.png` shows "Munich Reds v Dortm…" and "Madrid
   Whites v Catal…". Real names ("Wolverhampton Wanderers v Nottingham Forest") lose much more. In
   `blitz.css` line 38, change `.bz-fxr .m` to `font-weight: 600; min-width: 0; overflow-wrap: anywhere;`
   (no `nowrap`, no ellipsis) and delete the now duplicate phone rule on line 177.
4. **Holder below 150,000 $ELEVN hits a dead end.** Line 482 says "Hold 150,000 $ELEVN to save squads."
   beside a disabled grey Save, with no way forward and no word that the picks vanish on leaving. Fix:
   line 482 text "Hold 150,000 $ELEVN to save squads. Your picks stay here until you leave the page.";
   in lines 536 to 538, when `blocked`, render
   `<a className="e2-btn e2-btn-gold" href={process.env.NEXT_PUBLIC_ELEVN_BUY_URL ?? "https://jup.ag"} target="_blank" rel="noopener noreferrer">Get $ELEVN</a>`
   instead of the disabled Save (the same button Winnings uses when frozen; it is the one gold in view).
5. **Board before any kick-off ranks everyone 1st.** `real-blitz-guest-ready-1440.png`: five rows all
   "1" with 0 points. Lines 561 to 565: `const scored = top.some((r) => r.points > 0);` and show
   `{scored ? r.place : "–"}`; same on line 568.

## 2. Banked screen (`web/src/app/(site)/blitz/banked/BankedView.tsx`)

1. **Blocker: a live squad is told "Full time".** Line 196: anything not `open` gets "Full time. Points are
   final about 15 minutes after the whistle.", so during a live match the poster says Full time while line
   181 says "live". Fix line 196:
   `{sq.state === "open" ? "This squad has not kicked off." : sq.state === "live" ? "The match is live." : "Full time. Points are final about 15 minutes after the whistle."}`
   and drop the now repeated "The match is live, so" opening on line 197 (keep "These points can still change.").
2. **"If the matchday ended now" after it has ended.** Lines 134 to 136 use that wording even when
   `load.day.contest.state` is `"review"` or `"final"`. Fix: when `final`, "You won {sol} SOL." plus a
   `<Link href="/winnings">` "Collect on Winnings" (outlined); when `review`, "The matchday is over. Prizes
   are released once the result is checked." Keep the current sentences for `open` / `live`.
3. **"You are in the prizes" with fewer than 3 players.** Line 135 fires whenever the prize is 0, which is
   exactly the case `pots.split` returns nothing (under 3 entrants: the pot rolls forward). Fix:
   `else if (mine.place <= 5) prize = mine.entrants < 3 ? "Fewer than 3 players so far. With under 3 the pot rolls forward." : "You are in the prizes if the matchday ended now.";`
4. **Captain line reads "C ×2 · 3 × 2".** `real-blitz-banked-1440.png`. The ×2 chip is already beside the
   name and the mockup says "8 × 2". Line 149: drop the `C ×2 · ` prefix, giving
   `` `${Math.round((p.points! / 2) * 100) / 100} × 2` ``.
5. **"Squad 1 of 3" is hard-coded.** Line 181: use `load.day?.squads_allowed ?? 3` (a matchday with fewer
   fixtures allows fewer squads, and the pick page already says "1 of 2").

## 3. Admin "Results to release" (`web/src/app/(site)/admin/Release.tsx`, `squad/api.py`, `squad/contests.py`)

What is sound: the release is tied to the card's own `c.id`; `contests.release` locks the row
(`FOR UPDATE`) and refuses anything not in `review`, so a second click, a second tab or a retry after a
lost connection cannot pay twice; the client also blocks a second request (`inFlight`); a changed SOL
price closes an open confirm; the weekly preview is only shown for the price that was sent.

1. **Blocker: the amount released is not the amount approved.** The preview is computed at page load
   (and every 60 s) from `pots.estimate`; the POST (line 98) sends only `sol_usd`, and the server re-funds
   from whatever the bucket holds at that moment (`pots.fund`, `contests.py` line 193). Fee income keeps
   arriving, so the owner approves "Pot 1.20 SOL" and the server can credit a different pot without saying so.
   Fix:
   - `api.py` `ReleaseIn`: add `expect_pot_lamports: int`. Pass it to `contests.release(..., expect_pot=body.expect_pot_lamports)`.
   - `contests.release`: after the pot is set (after line 193 / line 191), read it back
     (`SELECT pot_lamports FROM contests WHERE id = %s`) and, if it differs from `expect_pot`, raise
     `ValueError("The pot is now {sol} SOL, not the {sol} SOL you checked. Look at the new figures and release again.")`.
     The route already rolls back on `ValueError`, so nothing is credited.
   - `Release.tsx` line 98: `body = { sol_usd: ..., expect_pot_lamports: c.preview_pot_lamports }`; in the
     `catch` (line 107) call `await load()` so the new figures appear under the refusal.
2. **Blocker: two results of the same mode in review show the same pot.** A matchday pot is the whole
   `pot:blitz` bucket at release (`pots.fund`). If Saturday and Sunday are both waiting, both cards preview
   the full bucket; whichever is released first takes it and the other drops to what is left (or the
   reserve minimum). The second preview is wrong, and releasing out of date order is unfair to the earlier
   day. Fix:
   - `Release.tsx`, in the map at line 133: `const earlier = data.review.find((o) => o.id !== c.id && o.kind === c.kind && c.kind !== "blitz_week" && (o.day ?? o.week_start) < (c.day ?? c.week_start));`
     When set, disable Release, hide the amounts, and show
     `<p className="rl-note">Release {title(earlier)} first. This pot is worked out from what is left after it.</p>`.
   - `contests.release`: refuse the same case on the server:
     `SELECT 1 FROM contests WHERE kind = %s AND state = 'review' AND id <> %s AND COALESCE(day, week_start) < (SELECT COALESCE(day, week_start) FROM contests WHERE id = %s)`
     raises `ValueError("Release the earlier result of this kind first.")`.
3. **Preview amounts round up and change format.** `real-admin-confirm-1440.png`: "1.20 SOL" next to
   "0.6000 SOL". `fmtSol` (`lib/api.ts` line 130) rounds to 2 places at 1 SOL and above, so a share can show
   more than is credited. Lines 103, 177, 190, 193, 196, 216, 241: show `` `${sol(x.lamports)} SOL` ``
   (the flooring `sol` from `lib/api.ts`), and make `total` (line 44) sum `lamports`, not `sol`. For the
   weekly line 177 use `sol(Math.round(WEEKLY_USD / p * 1e9))`.
4. **Prize list names do not match the board above it.** The board shows usernames ("player1"), the list
   under "Release will credit" shows short wallets ("Wa01…Zq01"), so the owner cannot check one against the
   other. Line 193: `const name = c.board.find((r) => r.wallet === x.wallet)?.username ?? shortWallet(x.wallet);`
   and show `name`. Same in the "released" line (line 103).

## 4. Winnings (`web/src/app/(site)/winnings/`)

All 6 items from `REVIEW_RANKS_WINNINGS.md` are applied as written:
1. `claim()` returns `event_id`; `setWaiting(out.event_id)`; the extra fetch is gone (line 173).
2. A held claim shows "… SOL is held for a claim in progress …" under Ready/Locked (lines 253, 262); the
   "A claim is in progress" hint comes first (line 202); unconfirmed rows read "Collect" / "Withdraw" (line 104).
3. A lost connection or 5xx on submit throws "We could not confirm this claim yet. Do not start another…"
   (`claim.ts` lines 36 to 38).
4. The Withdraw reason is appended (line 204); frozen adds "Collect still works." (line 203).
5. "Not available right now." (line 252), "Trying again every 30 seconds" (line 209), and the session-ended
   History uses the guest sentence (line 320).
6. `Math.floor(w.locked_lamports / 5)` (lines 283, 289).

The Explorer cluster now follows `NEXT_PUBLIC_SOLANA_RPC` (line 19). No regressions found.
`NEXT_PUBLIC_ELEVN_BUY_URL` must still be set at launch.

## Weak, not blocking
- Blitz: a guest who connects a wallet that already has saved squads has the saved fixture written over
  the guest's fixture in that slot (line 230). The guest picks stay in `drafts` but drop off the cards.
- Blitz: a stale session (401, line 93) loads guest data but keeps the signed-in view; Save then fails
  with "Request failed (401)".
- Blitz: line 549 builds 5th place from the float `pot_sol`; the API also sends `pot_lamports`.
- Blitz and Banked: the mockups show the score on live and finished fixtures ("Arsenal 2-1 Tottenham");
  the build shows none, because `BlitzFixture` carries no goals.
- Banked: the mockup's "Share to X" is not built; at 390 the captain figure sits above the h1.
- Banked line 131: the 5th-place figure ignores ties (fixed for free if Blitz item 1 is applied and this
  line reads the board's 5th row).
- Admin: `.rl-err` is red (`--danger`) and the page has two gold buttons ("Yes, release" and the older
  "Approve in wallet"). This is admin only, but it breaks the red and one-gold rules.
- Admin: "Recently released" prints the pot beside "Rolled forward" although nothing was paid; show "–".
- Admin: a mistyped SOL price (15 for 150) is only caught by reading the confirm line. Consider a note
  when the result is above 2× the last weekly pot.
- Split percentages, "3 entrants", "15 minutes" and the $500 are still typed into the pages, not read from
  `config.toml`.
