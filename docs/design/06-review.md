# 06. Review of the desktop mockups

Reviewed 2026-11-17: all 7 screens at 1440 (supplied shots), 1920 and 1024 (rendered with Playwright), today.html at 390, plus the HTML and CSS. Contrast is computed from the hex pairs in `mock.css`. Rows marked (inferred) are not measured.

## Findings, most severe first

| # | Sev | Screen | What is wrong | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Rule/number | banked | Countdowns disagree. Squad 2 (Leverkusen, 15:30) says "Locks in 00:50:00"; squad 3 (Liverpool, 17:30) says "Locks in 49:12" and the rail names Liverpool as next kick-off at 00:49:12. | Both strings in banked.html; kick-offs are 2h apart | Rail and squad 2 show Leverkusen 00:50:00; squad 3 about 02:50:00 |
| 2 | Rule/number | banked | Red LIVE badge on the Blitz card although no squad is live (1 banked, 2 not started). Red is for a match being played now. | `.badge.live` in the dimmed Blitz card | Use an outlined "Banked" or "Open" state |
| 3 | Rule/number | home | Beat 2 says "Your points are banked at the final whistle". At full time points are provisional; banked is about 15 minutes later (BLITZ 2.4). | Beat 2 `.lead` | "Banked shortly after full time" |
| 4 | Rule/number | shootout | Sample board is impossible: 41 goals in 8 games with 5 rounds per game (max 40). Assumes at most one goal per round. | Row 5: 41 goals, 8 games | Change to 39, or state the scoring |
| 5 | Rule/number | draft, ranks | "Held 72 hours before a weekly prize is paid" reads as a payout delay. The rule is that the wallet must have held the tokens 72 hours; the blueprint says no fixed delay. The Blitz weekly card has no hold note. (reading is inferred) | draft.html top-5 card note; ranks.html weekly card | "Wallet must have held its $ELEVN for 72 hours"; add to both weekly cards |
| 6 | A11y | blitz-pick | Dimmed tiles drop to 2.35:1 (reason "One from each club") and 2.94:1 (avg pts); fails 4.5. The reason is the key message. | `.tile.dimmed{opacity:.5}` | Dim only the name; keep the reason at full `--steel-2` |
| 7 | A11y | all | Outline buttons, wallet pill and chip edges use `--edge-strong`: 2.41:1 on `--bg`, under the 3:1 the direction (section 9) requires. The token itself is 28% white. | Computed | Raise to about 40% white and amend the direction table |
| 8 | A11y | ranks | Banked and live dots are both filled circles; only hue differs (gold vs red, 1.83:1 between them). The legend does not fix this. | `.dots i.b` / `i.l` | Banked = ring with a tick; live = solid |
| 9 | A11y | all | Targets under 40px: nav links 75x38, "Menu +" 60x38, captain rings 20px. Text at 11px: 21 nodes on blitz-pick and draft (below the 12px eyebrow and 13px label floor). | Measured in Playwright | Nav padding to 40px high; text to 12px or more; captain ring needs a 40px hit area |
| 10 | A11y | shootout, blitz-pick | Shootout page opens with an h2 and has no h1; blitz-pick jumps h1 to h3. | HTML | Make the Shootout title h1; use h2 for the builder |
| 11 | A11y | blitz-pick, all | Picked tile differs from available only by border and fill. Wallet ring (unlocked tier) is an aria-hidden arc with no text. No `aria-current` on nav or tabs; the banked overlay has no dialog role. (screen-reader effects inferred) | `.tile.picked`; pill svg | Add a tick and the word "Picked"; label the ring "Blitz and Draft unlocked"; add ARIA |
| 12 | Layout | blitz-pick @1024 | Breaks in the 1024 tier the direction defines: fixture rows clip (LIVE badge, "in 2h 20" cut), "Pick 1 from Leipzig" spills out of its chip, titles wrap to 2 lines. | 1024 screenshot | Stack the board under the builder below about 1200 |
| 13 | Layout | today, blitz-pick | No obvious main action. Today has three outlined buttons ("Live", "View team", "Play"); the pick page's only button is disabled grey. "Live" next to a red LIVE badge reads twice. | Screens | Gold on the card needing action; label disabled button's reason beside it |
| 14 | Layout | home | Two gold "Connect wallet" buttons visible together (nav and hero), a third in the last beat. Direction: one gold action per view and the nav button is that one. | home.html | Hero becomes outlined or the nav button becomes outlined |
| 15 | Layout | shootout | 960px column against 1280 nav edges (left edge 480 vs 320 at 1920). Ignores the section header pattern. | `.so-wrap` | Use `.wrap` and the header pattern |
| 16 | Polish | home | Title-card stroke is `rgba(244,244,241,.55)`, not the 1px `--text` stroke in the direction. Hard-coded `#0f1115` behind "Prize line" on blitz-pick. | CSS, inline style | Use tokens |
| 17 | Polish | draft vs today | Draft page is dated Wed 18 Nov with 3 of 5 packs opened and no saved team; Today on Sat 21 shows the same wallet 9th with 41 pts. (inferred, different snapshots) | Both pages | Note the snapshot or align the story |
| 18 | Polish | blitz-pick | "If the day ended now you'd win X" is missing from the live board panel (direction section 6). | blitz-pick.html | Add one line |

Count: 5 rule/number, 6 accessibility, 4 layout, 3 polish.

## Verified correct

Splits 50/25/12/8/5 on all boards. Arithmetic: 2.4 SOL gives 1.20/0.60/0.29/0.19/0.12 and $192/96/46/31/19; the weekly $250/125/60/40/25 and 3.13 SOL; Draft 1.8 SOL gives 0.90/0.45/0.22/0.14/0.09. Today and ranks agree (70 pts, 6th, 74 to 5th, 4 behind). Squad points sum (34+36+0, 16+10+8). Pick-page fixture times match the "in Xh" labels. Access 150,000/300,000, the Draft rules (lock, Fri to Mon, 5x3, five-a-side, at most 2 per club, no goalkeepers), the "Tuesday to Monday UK time" line, mandatory captain, Shootout no prize/no holding/10 ranked. No "tonight" anywhere.

## Working well

One-glance Today with a strong Blitz card; the prize line and "You" row are clear and carry words, not colour alone; the pick screen's reasons for blocked players are honest; the header pattern holds on Draft; gold is disciplined elsewhere; phone view at 390 stacks cleanly with no overflow. Nothing is jumbled.

## Not checked

Hover, focus rendering and keyboard order; screen readers; home, draft, ranks and banked at 1024 by eye (only pick and today were viewed; home's SVG ball extends past 1024 by measurement); 1920 views of home and draft by eye; glass contrast over a real canvas; phone for any page but Today.
