"""Prize pots for the two game modes (owner decisions, Nov 2026).

Of all fee income, 60% is prize money; `payouts.record_income` books it. Here that money splits by
mode (Blitz 60%, Draft 40%) into two buckets, `pot:blitz` and `pot:draft`.
  - A contest's pot is everything its mode bucket holds when it is funded, topped up to the
    minimum from the reserve. The money stays in the bucket until the contest settles.
  - Settling pays the top 5 (50 / 25 / 12 / 8 / 5) and moves the paid total to `owed2`: prizes
    awarded and not yet collected. A contest with fewer than 3 entrants pays nothing and rolls.
  - Rounding crumbs and unpaid places stay in the mode bucket and roll forward.
The Blitz weekly prize is a fixed $500 from the team's own wallet; here it only gets split.

All amounts are lamports. Money is only moved between buckets, never created.
"""

from . import chain, payouts
from .config import CFG

BOARDS = CFG["boards"]
BASIS = 10_000
PLACES = [round(p * BASIS) for p in BOARDS["place_split"]]      # 50 / 25 / 12 / 8 / 5 -> basis points
MODE_OF = {"blitz_matchday": "blitz", "draft_week": "draft"}


def minimum(kind):
    """Lamports a contest's pot is topped up to from the reserve; smaller on devnet."""
    key = "min_pot_sol_devnet" if CFG["fees"]["cluster"] == "devnet" else "min_pot_sol"
    return round(BOARDS[key][kind] * chain.LAMPORTS)


def allocate(conn, ref=None):
    """Move the prize money not yet split (pot:unassigned) into the mode buckets.
    Blitz gets 60% rounded down, Draft the rest. Returns (blitz, draft) lamports moved."""
    amount = payouts.bucket(conn, "pot:unassigned")
    if amount <= 0:
        return 0, 0
    blitz = amount * round(BOARDS["mode_split"]["blitz"] * 100) // 100
    draft = amount - blitz
    payouts.move(conn, "pot:unassigned", "pot:blitz", blitz, "allocation", ref)
    payouts.move(conn, "pot:unassigned", "pot:draft", draft, "allocation", ref)
    return blitz, draft


def fund(conn, contest_id):
    """Set a contest's pot to its whole mode bucket (topped up to the minimum from the reserve).
    Returns the pot. Weekly Blitz is fixed and set by the caller; a funded or closed contest is left alone."""
    kind, state, pot = conn.execute("SELECT kind, state, pot_lamports FROM contests WHERE id = %s",
                                    (contest_id,)).fetchone()
    mode = MODE_OF.get(kind)
    if mode is None or pot or state in ("final", "rolled"):
        return pot
    allocate(conn, f"contest:{contest_id}")
    name = f"pot:{mode}"
    short = minimum(kind) - payouts.bucket(conn, name)
    if short > 0:
        payouts.move(conn, "reserve", name, min(short, max(payouts.bucket(conn, "reserve"), 0)),
                     "topup", f"contest:{contest_id}")
    pot = payouts.bucket(conn, name)
    conn.execute("UPDATE contests SET pot_lamports = %s WHERE id = %s", (pot, contest_id))
    return pot


def estimate(conn, kind):
    """What `fund` would set as the pot for a contest of this kind right now, moving no money."""
    mode = MODE_OF.get(kind)
    if mode is None:
        return 0
    have = payouts.bucket(conn, f"pot:{mode}")
    extra = payouts.bucket(conn, "pot:unassigned")
    if extra > 0:       # as allocate would move it
        blitz = extra * round(BOARDS["mode_split"]["blitz"] * 100) // 100
        have += blitz if mode == "blitz" else extra - blitz
    short = minimum(kind) - have
    if short > 0:
        have += min(short, max(payouts.bucket(conn, "reserve"), 0))
    return have


def _groups(ranked):
    """Wallets (one line each, best line kept) ordered by points then captain points, grouped by
    ties. Returns [(place, [wallet, ...])] where a tied group shares the best place it covers."""
    best = {}
    for wallet, points, captain in ranked:
        if wallet not in best or (points, captain) > best[wallet]:
            best[wallet] = (points, captain)
    order = sorted(best, key=lambda w: (-best[w][0], -best[w][1], w))
    groups = []
    for w in order:
        if groups and best[groups[-1][1][0]] == best[w]:
            groups[-1][1].append(w)
        else:
            groups.append((len(order[:order.index(w)]) + 1, [w]))
    return groups


def split(pot, ranked):
    """Prizes for a board. ranked = [(wallet, points, captain_points)]. Returns [(wallet, place, lamports)].
    Tied wallets share equally the prizes of the places they cover; leftovers are not paid."""
    groups = _groups(ranked)
    if sum(len(g) for _, g in groups) < BOARDS["min_entrants"]:
        return []
    out = []
    for place, wallets in groups:
        covered = sum(PLACES[place - 1:place - 1 + len(wallets)])
        if not covered:
            break
        share = pot * covered // (BASIS * len(wallets))
        out += [(w, place, share) for w in wallets]
    return out


def settle(conn, contest_id):
    """Rank a contest's results, write places and prizes, and move the paid total from the mode
    bucket to owed2. Fewer than 3 entrants: places only, the contest becomes 'rolled'.
    Returns [(wallet, place, lamports)] for the paid wallets. Safe to call twice."""
    kind, pot = conn.execute("SELECT kind, pot_lamports FROM contests WHERE id = %s", (contest_id,)).fetchone()
    rows = conn.execute("""SELECT wallet, points, captain_points, is_final, place, prize_lamports
                           FROM results WHERE contest_id = %s""", (contest_id,)).fetchall()
    if any(r[3] for r in rows):
        paid = [(r[0], r[4], r[5]) for r in rows if r[5] > 0]
        return sorted(paid, key=lambda p: (p[1], p[0]))
    if kind in MODE_OF:     # never award more than the mode bucket holds (two contests funded at once)
        pot = min(pot, max(payouts.bucket(conn, f"pot:{MODE_OF[kind]}"), 0))
    prizes = split(pot, [(w, p, c) for w, p, c, *_ in rows])
    for place, wallets in _groups([(w, p, c) for w, p, c, *_ in rows]):
        for w in wallets:
            conn.execute("UPDATE results SET place = %s WHERE contest_id = %s AND wallet = %s",
                         (place, contest_id, w))
    for w, _, lamports in prizes:
        conn.execute("UPDATE results SET prize_lamports = %s WHERE contest_id = %s AND wallet = %s",
                     (lamports, contest_id, w))
    conn.execute("UPDATE results SET is_final = true WHERE contest_id = %s", (contest_id,))
    if not prizes:
        conn.execute("UPDATE contests SET state = 'rolled' WHERE id = %s", (contest_id,))
    elif kind in MODE_OF:
        payouts.move(conn, f"pot:{MODE_OF[kind]}", "owed2", sum(p[2] for p in prizes), "prize", f"contest:{contest_id}")
    return prizes


def collected(conn, lamports, ref):
    """A winner's Collect or Withdraw is confirmed: those lamports are no longer owed."""
    payouts.add(conn, "owed2", -lamports, "paid", ref)
