# Head review of the Ranks and Winnings pages (2026-11-19): changes still to apply

Both pages: approve with changes. None of the changes below has been applied yet. The claim flow
was driven end to end with a fake wallet signer and mocked routes, not with a real wallet.

## Ranks (`web/src/app/(site)/ranks/RanksView.tsx` unless noted)

1. **Pot is 0 before release (blocker).** The server sets `pot_lamports` only in
   `contests.release` (`pots.fund`), so every open, live and review board shows "0 SOL".
   - Page fix: when `c.state !== "final" && c.pot_sol === 0` on a non-weekly board, show "Set at
     full time" in `.rk-pot`, percentages only in the panel and the Pays column, and no amount in
     `YourLine`.
   - Proper fix (server): add an estimated pot to `contest_json` in `squad/api.py`, reusing the
     bucket logic of `prize_preview`. The same applies to the pots on the Today cards.
   - Owner to choose between the two (see the handoff).
2. **Amounts round up.** `sol()` (line 36) uses `toFixed(2)`: 0.375 shows as 0.38, and the five
   shares of a 1.30 pot add to 1.31. Move the flooring `sol(lamports)` from `WinningsView.tsx` into
   `lib/api.ts` and use it here on `prize_lamports` and `pot_lamports`.
3. **Ties before final are overstated.** Two wallets tied for 2nd each show 0.60 SOL; the server
   pays (25% + 12%) / 2 each. In `pays()` (lines 97 to 101) count the rows sharing the place (`n`)
   and pay `sum(SPLIT[place-1 .. place-1+n-1]) / n`; the same with `WEEKLY_USD`. Use it in
   `prizeCell` and `YourLine`. The side panel stays per place.
4. **Under 3 entrants while not final** still shows a prize line and amounts. When
   `b.entrants < 3`: no prize line, Pays "–", and a `.rk-note` "Needs 3 players, or the pot rolls
   forward."
5. **Rolled board** still lists amounts in the side panel. Eyebrow "Pot rolled forward", amounts "–".
6. **Phone tabs:** "Draft weekly" is cut off at 390. In `ranks.css`, inside
   `@media (max-width: 700px)`, replace the `.rk-tabs` line with:
   ```css
   .rk-tabs { gap: 0; margin-bottom: 24px; overflow: visible; }
   .rk-tabs a { flex: 1 1 0; justify-content: center; text-align: center; white-space: normal; font-size: 14px; line-height: 1.25; padding: 4px; }
   ```
7. **Small:** line 196 says "Pot for this week" on the matchday tab when there is no contest (use
   the tab's `noun`); line 45 `shortDay` duplicates `longDay`.

## Winnings (`web/src/app/(site)/winnings/`)

1. **Stale "Sent. Waiting for the network to confirm."** After `confirming`, `WinningsView.tsx`
   lines 177 to 179 look the event up with a second fetch; if it settled in between, the note never
   clears. Have `claim()` in `claim.ts` return `event_id`, call `setWaiting(out.event_id)`, and
   delete the extra fetch.
2. **After a cancelled signature** the server holds the amount for up to 5 minutes and the page
   shows Ready "0.00 SOL · Nothing waiting" beside a history row "COLLECTED · PENDING".
   - Find the pending non-credit event. Line 252: show "1.00 SOL is held for a claim in progress. It
     comes back here within 5 minutes if it is not signed." (the same on Locked for a withdrawal).
   - Lines 201 to 207: put "A claim is in progress. This page updates when it settles." ahead of the
     other hints.
   - Line 109: label unconfirmed rows "Collect" / "Withdraw", not "Collected".
3. **Connection lost on submit** shows "elevn can't be reached right now. Try again in a minute."
   although the claim may have gone through. In `claim.ts`, catch an `ApiError` with status 0 or
   5xx from the submit call only and throw "We could not confirm this claim yet. Do not start
   another. This page updates when it settles."
4. **Disabled-button reasons:** state 1's hint (line 204) gives no reason for Withdraw: append
   `w.withdraw_reason`. When frozen with something ready (line 203), add "Collect still works."
5. **Unreachable state** says "Loading." under Ready, repeats the message, and says "every few
   seconds" although the poll is 30 s. The session-ended state says "Nothing won yet" in History,
   which the page cannot know: use the guest sentence.
6. Lines 280 and 286: `Math.floor(w.locked_lamports * 0.2)` should be
   `Math.floor(w.locked_lamports / 5)` (integer maths, as on the server).

## At launch
- `NEXT_PUBLIC_ELEVN_BUY_URL` must be the swap link for the $ELEVN mint (the jup.ag fallback is for
  devnet only: a frozen player could buy the wrong token).
- Explorer links are hard-coded to `?cluster=devnet`: derive the cluster from
  `NEXT_PUBLIC_SOLANA_RPC`, as `TestSeason.tsx` does.

## Weak, not blocking
- The split percentages, the weekly dollar split, "3 entrants", "15 minutes", "20%" and "24 hours"
  are typed into the pages; the API has no rules route, so they can drift from `config.toml`.
- A rejected signature logs a wallet-adapter error to the console (`Providers.tsx` has no `onError`).
- The footer still links the three league pages and says "Prizes are paid in SOL from trading fees".
- Not tested: a real wallet, the real Python API, reduced motion.
