"""$ELEVN game rules: save-time squad checks, transfer counting and weekly repricing.

Pure functions (no I/O, no database); every number comes from config.toml.
Drafts are never checked: these rules run only when a user saves a squad.
"""

from collections import Counter
from dataclasses import dataclass, field

from .config import CFG


NAMES = {"GK": ("goalkeeper", "goalkeepers"), "DEF": ("defender", "defenders"),
         "MID": ("midfielder", "midfielders"), "FWD": ("attacker", "attackers")}


def pos_name(pos, n):
    """Builder section wording: 1 goalkeeper, 3 attackers."""
    return NAMES[pos][0 if n == 1 else 1]


@dataclass
class PlayerInfo:
    id: int
    position: str                 # GK / DEF / MID / FWD
    club_id: int
    league_id: int
    name: str = ""


@dataclass
class Problem:
    """One reason a squad cannot be saved; the builder shows `message` and highlights `players`."""
    code: str
    message: str
    players: list = field(default_factory=list)


def validate_squad(starters, bench, captain, vice_captain, players, league_id, cost,
                   rising_stars=frozenset(), budget=None, cfg=CFG):
    """Every squad rule, checked on save. Returns a list of Problems (empty = can be saved).

    starters: 11 player ids; bench: 4 ids in auto-sub order, bench[0] the backup GK
    players:  player_id -> PlayerInfo for every id used
    cost:     player_id -> price counted against the budget
    rising_stars: ids of the league's current Rising Stars
    budget:   the squad's money (bank + selling value of last week's squad); default 100M
    """
    sq = cfg["squad"]
    budget = sq["budget"] if budget is None else budget
    probs = []
    ids = list(starters) + list(bench)

    unknown = [p for p in ids if p not in players]
    if unknown:
        probs.append(Problem("unknown_player", "Some players are not in the player list", unknown))
    if len(starters) != sq["starting_xi_size"]:
        probs.append(Problem("xi_size", f"Pick {sq['starting_xi_size']} starters (you have {len(starters)})"))
    if len(bench) != sq["size"] - sq["starting_xi_size"]:
        probs.append(Problem("bench_size", f"Pick {sq['size'] - sq['starting_xi_size']} substitutes "
                                           f"(you have {len(bench)})"))
    dupes = [p for p, n in Counter(ids).items() if n > 1]
    if dupes:
        probs.append(Problem("duplicate", "A player is picked more than once", dupes))

    known = [p for p in dict.fromkeys(ids) if p in players]
    if sq["single_league_per_squad"]:
        other = [p for p in known if players[p].league_id != league_id]
        if other:
            probs.append(Problem("wrong_league", "Only this league's players can be in this squad", other))

    count = Counter(players[p].position for p in known)
    for pos, n in sq["quota"].items():
        if count[pos] != n:
            probs.append(Problem("quota", f"Pick exactly {n} {pos_name(pos, n)} (you have {count[pos]})",
                                 [p for p in known if players[p].position == pos]))

    xi = [p for p in starters if p in players]
    xi_count = Counter(players[p].position for p in xi)
    if xi_count["GK"] != 1:
        probs.append(Problem("xi_formation", f"Start exactly 1 goalkeeper (you have {xi_count['GK']})",
                             [p for p in xi if players[p].position == "GK"]))
    for pos, n in sq["starting_xi_min"].items():
        if pos != "GK" and xi_count[pos] < n:
            probs.append(Problem("xi_formation", f"Start at least {n} {pos_name(pos, n)} (you have {xi_count[pos]})"))
    if bench and bench[0] in players and players[bench[0]].position != "GK":
        probs.append(Problem("bench_gk", "The first substitute must be your backup goalkeeper", [bench[0]]))

    total = round(sum(cost.get(p, 0) for p in known), 1)
    if total > round(budget, 1):
        probs.append(Problem("budget", f"Squad costs {total:.1f}M, over your {budget:.1f}M budget "
                                       f"by {total - budget:.1f}M"))

    clubs = Counter(players[p].club_id for p in known)
    for club, n in clubs.items():
        if n > sq["max_per_club"]:
            probs.append(Problem("club_limit", f"Max {sq['max_per_club']} players per club (you have {n})",
                                 [p for p in known if players[p].club_id == club]))

    if captain not in starters:
        probs.append(Problem("captain", "Choose a captain from your starting XI"))
    if sq["vice_captain"] and vice_captain not in starters:
        probs.append(Problem("vice_captain", "Choose a vice-captain from your starting XI"))
    if captain is not None and captain == vice_captain:
        probs.append(Problem("vice_captain", "Captain and vice-captain must be different players", [captain]))

    stars = [p for p in known if p in rising_stars]
    if len(stars) > sq["max_rising_stars"]:
        probs.append(Problem("rising_stars", f"Max {sq['max_rising_stars']} Rising Stars "
                                             f"(you have {len(stars)})", stars))
    return probs


# ------------------------------------------------------------- transfers ---
@dataclass
class Transfer:
    player_out: int
    player_in: int
    kind: str                     # free / replacement / extra
    penalty: int = 0


def plan_transfers(prev_ids, new_ids, positions, unavailable=frozenset(), cfg=CFG):
    """Transfers implied by moving from last gameweek's squad to the new one.

    Outgoing and incoming players are paired within each position. A player who is
    unavailable (injured, suspended, left the league, off-season) is replaced free, on top
    of the 3 free transfers; the rest are free until the allowance runs out, then -8 each.
    prev_ids None = the squad's first gameweek: building it is free.
    """
    if prev_ids is None:
        return []
    tr = cfg["transfers"]
    prev, new = set(prev_ids), set(new_ids)
    pairs = []
    for pos in cfg["squad"]["quota"]:
        outs = sorted((p for p in prev - new if positions[p] == pos),
                      key=lambda p: (p not in unavailable, p))
        ins = sorted(p for p in new - prev if positions[p] == pos)
        pairs += list(zip(outs, ins))
    out, free_left = [], tr["free_per_gameweek"]
    # replacements first so they never use up the free allowance
    for o, i in sorted(pairs, key=lambda x: x[0] not in unavailable):
        if tr["free_replacement_for_unavailable"] and o in unavailable:
            out.append(Transfer(o, i, "replacement"))
        elif free_left > 0:
            free_left -= 1
            out.append(Transfer(o, i, "free"))
        else:
            out.append(Transfer(o, i, "extra", tr["extra_transfer_penalty"]))
    return out


# -------------------------------------------------------------- repricing ---
def weekly_price(price, form, ppg, own_delta, cfg=CFG):
    """P_next = P x (1 + clamp(0.05 x (Form - PPG) / PPG + 0.5 x dOwn, -10%, +10%)), moved by at most
    0.3M a week and kept in 4.0-15.0.

    form: average points over the last 5 appearances; ppg: season average;
    own_delta: change in the share of the league's squads that own the player.
    A player without a positive PPG moves on ownership only.
    """
    pr, wk = cfg["pricing"], cfg["pricing"]["weekly"]
    form_term = wk["form_weight"] * (form - ppg) / ppg if ppg and ppg > 0 and form is not None else 0.0
    change = max(-wk["max_change"], min(wk["max_change"], form_term + wk["ownership_weight"] * own_delta))
    step = max(-wk["max_change_abs"], min(wk["max_change_abs"], price * change))
    new = round((price + step) / pr["rounding"]) * pr["rounding"]
    return round(max(pr["price_min"], min(pr["price_max"], new)), 1)
