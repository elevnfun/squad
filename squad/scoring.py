"""$ELEVN scoring engine: the one code path for live scores, settlement and pricing.

Match score = (Core+ + Involvement) x RisingStar x Captain + Core-
  Core+   positive core points (FPL x2): appearance, goals, assists, clean sheet, saves, pen saves
  Core-   negative core points: cards, own goals, missed pens, goals conceded; never multiplied
  Involvement  accurate passes, key passes, shots on target, tackles, duels won; capped per match

All numbers come from config.toml. Functions here are pure: no I/O, no database.
"""

from collections import Counter
from dataclasses import dataclass, field

from .config import CFG

POS_MAP = {"G": "GK", "D": "DEF", "M": "MID", "F": "FWD"}


def num(x):
    if x is None or x == "":
        return 0
    if isinstance(x, (int, float)):
        return x
    try:
        return float(str(x).replace("%", ""))
    except ValueError:
        return 0


# ------------------------------------------------------------ match stats ---
@dataclass
class PlayerMatch:
    """One player's counted stats for one match, normalised from API-Football."""
    player_id: int
    fixture_id: int
    team_id: int
    name: str = ""
    position: str = "MID"          # GK / DEF / MID / FWD for this match
    minutes: int = 0
    goals: int = 0
    assists: int = 0
    conceded: int = 0              # GK: own field; others: team's full-match goals against
    saves: int = 0
    pen_saved: int = 0
    pen_missed: int = 0
    yellow: int = 0
    red: int = 0
    own_goals: int = 0
    accurate_passes: int = 0
    key_passes: int = 0
    shots_on: int = 0
    tackles: int = 0
    duels_won: int = 0
    rating: float = 0.0
    substitute: bool = False


def accurate_pass_count(passes):
    """`passes.accuracy` is a count, except when it is a % string or exceeds the pass total."""
    total, raw = num(passes.get("total")), passes.get("accuracy")
    acc = num(raw)
    if (isinstance(raw, str) and "%" in raw) or (total and acc > total):
        acc = round(total * acc / 100)
    return int(acc)


def parse_fixture(fx):
    """API-Football fixture (with embedded `players` and `events`) -> list of PlayerMatch.

    Players without a G/D/M/F position are skipped; players with 0 minutes are kept
    (minutes = 0) so the squad logic can see who did not play.
    """
    teams = fx["teams"]
    gh, ga = num(fx["goals"]["home"]), num(fx["goals"]["away"])
    conceded_by = {teams["home"]["id"]: ga, teams["away"]["id"]: gh}
    own_goals, missed_pens = Counter(), Counter()
    for ev in fx.get("events") or []:
        pid = (ev.get("player") or {}).get("id")
        if ev.get("type") == "Goal" and pid:
            if ev.get("detail") == "Own Goal":
                own_goals[pid] += 1
            elif ev.get("detail") == "Missed Penalty":
                missed_pens[pid] += 1
    out = []
    fid = fx["fixture"]["id"]
    for block in fx.get("players") or []:
        team_id = block["team"]["id"]
        for p in block.get("players", []):
            st = (p.get("statistics") or [{}])[0]
            g = st.get("games") or {}
            if g.get("position") not in POS_MAP:
                continue
            pos = POS_MAP[g["position"]]
            goals = st.get("goals") or {}
            pen = st.get("penalty") or {}
            cards = st.get("cards") or {}
            pid = p["player"]["id"]
            if pos == "GK" and goals.get("conceded") is not None:
                conceded = num(goals.get("conceded"))
            else:
                conceded = conceded_by.get(team_id, 0)
            out.append(PlayerMatch(
                player_id=pid, fixture_id=fid, team_id=team_id, name=p["player"].get("name") or "",
                position=pos, minutes=int(num(g.get("minutes"))),
                goals=int(num(goals.get("total"))), assists=int(num(goals.get("assists"))),
                conceded=int(conceded), saves=int(num(goals.get("saves"))),
                pen_saved=int(num(pen.get("saved"))),
                pen_missed=int(max(num(pen.get("missed")), missed_pens[pid])),
                yellow=int(num(cards.get("yellow"))), red=int(num(cards.get("red"))),
                own_goals=own_goals[pid],
                accurate_passes=accurate_pass_count(st.get("passes") or {}),
                key_passes=int(num((st.get("passes") or {}).get("key"))),
                shots_on=int(num((st.get("shots") or {}).get("on"))),
                tackles=int(num((st.get("tackles") or {}).get("total"))),
                duels_won=int(num((st.get("duels") or {}).get("won"))),
                rating=float(num(g.get("rating"))), substitute=bool(g.get("substitute")),
            ))
    return out


# ------------------------------------------------------------ match score ---
@dataclass
class MatchScore:
    player_id: int
    fixture_id: int
    minutes: int
    rating: float = 0.0
    core_plus: float = 0.0
    core_minus: float = 0.0
    involvement: float = 0.0
    breakdown: list = field(default_factory=list)   # [(label, points)] for alerts and the UI

    @property
    def base(self):
        """Points before Rising Stars and captain multipliers."""
        return self.core_plus + self.involvement + self.core_minus


def score_match(pm, cfg=CFG):
    """Core + involvement points for one player-match (no multipliers). 0 minutes -> all zero."""
    sc = cfg["scoring"]
    s = MatchScore(pm.player_id, pm.fixture_id, pm.minutes, pm.rating)
    if pm.minutes <= 0:
        return s

    def add(label, pts):
        if not pts:
            return
        s.breakdown.append((label, pts))
        if pts > 0:
            s.core_plus += pts
        else:
            s.core_minus += pts

    pos, full = pm.position, pm.minutes >= sc["clean_sheet_min_minutes"]
    add("appearance", sc["appearance_60_plus"] if full else sc["appearance_under_60"])
    add("goals", sc["goal"][pos] * pm.goals)
    add("assists", sc["assist"] * pm.assists)
    conceded = pm.conceded if (pos == "GK" or full) else 0
    if full and conceded == 0:
        add("clean sheet", sc["clean_sheet"][pos])
    if pos in ("GK", "DEF"):
        add("goals conceded", sc["goals_conceded_block_points"] * (conceded // sc["goals_conceded_per_block"]))
    if pos == "GK":
        add("saves", sc["saves_block_points"] * (pm.saves // sc["saves_per_point_block"]))
        add("penalty saves", sc["penalty_save"] * pm.pen_saved)
    # a sending-off replaces any yellow in the same match (FPL: a second yellow is -3, not -4)
    if pm.red:
        add("red card", sc["red_card"] * pm.red)
    else:
        add("yellow card", sc["yellow_card"] * pm.yellow)
    add("own goals", sc["own_goal"] * pm.own_goals)
    add("missed penalties", sc["penalty_miss"] * pm.pen_missed)

    iv = sc["involvement"]
    raw = (iv["accurate_pass"] * pm.accurate_passes + iv["key_pass"] * pm.key_passes
           + iv["shot_on_target"] * pm.shots_on + iv["tackle"] * pm.tackles + iv["duel_won"] * pm.duels_won)
    s.involvement = round(min(raw, iv["cap_per_match"]), 2)
    if s.involvement:
        s.breakdown.append(("involvement", s.involvement))
    return s


# ----------------------------------------------------------- rising stars ---
def rising_star_multiplier(level, cfg=CFG):
    rs = cfg["rising_stars"]
    level = max(rs["start_level"], min(level, rs["max_level"]))
    return round(rs["start_multiplier"] + rs["level_step"] * (level - rs["start_level"]), 4)


def rising_star_next_level(level, ms, cfg=CFG):
    """Level after a match: +1 for 12+ base points or a 7.5+ rating, capped at max_level."""
    rs = cfg["rising_stars"]
    if ms.minutes > 0 and (ms.base >= rs["upgrade_min_points"] or ms.rating >= rs["upgrade_min_rating"]):
        return min(level + 1, rs["max_level"])
    return level


def advance_rising_stars(levels, scores, cfg=CFG):
    """Walk a Rising Star's matches in kickoff order.

    levels: player_id -> current level; scores: MatchScores in kickoff order.
    Returns ({(player_id, fixture_id): level used for that match}, levels after the matches).
    Levels belong to the player (not a squad) and persist for the season.
    """
    levels, used = dict(levels), {}
    for ms in scores:
        if ms.player_id not in levels:
            continue
        used[(ms.player_id, ms.fixture_id)] = levels[ms.player_id]
        levels[ms.player_id] = rising_star_next_level(levels[ms.player_id], ms, cfg)
    return used, levels


def final_match_points(ms, rs_mult=1.0, captain_mult=1.0, cfg=CFG):
    """(Core+ + Involvement) x RisingStar x Captain + Core-.

    Negatives are multiplied only if config says so (both flags are false: never multiplied).
    """
    positive = (ms.core_plus + ms.involvement) * rs_mult * captain_mult
    negative = ms.core_minus
    if cfg["rising_stars"]["multiply_negatives"]:
        negative *= rs_mult
    if cfg["scoring"]["captain_doubles_negatives"]:
        negative *= captain_mult
    return round(positive + negative, 2)


# --------------------------------------------------------- squad gameweek ---
@dataclass
class Picks:
    """A saved squad for one gameweek. starters: 11 player ids; bench: 4 ids, bench[0] is the GK."""
    starters: list
    bench: list
    captain: int
    vice_captain: int
    positions: dict              # player_id -> GK / DEF / MID / FWD


@dataclass
class GameweekResult:
    points: float
    players: dict                 # player_id -> points counted (after multipliers)
    final_xi: list
    auto_subs: list               # [(out_id, in_id)]
    captain_used: int | None


def formation_ok(xi, positions, cfg=CFG):
    mins = cfg["squad"]["starting_xi_min"]
    count = Counter(positions[p] for p in xi)
    return all(count[pos] >= n for pos, n in mins.items())


def auto_substitute(picks, played, cfg=CFG):
    """FPL-style auto-subs: each non-playing starter (in XI order) is replaced by the first
    bench player, in bench order, who played and keeps a legal formation. GK only for GK."""
    xi, bench_left, subs = list(picks.starters), list(picks.bench), []
    pos = picks.positions
    for out_id in picks.starters:
        if played(out_id):
            continue
        for in_id in bench_left:
            if not played(in_id) or (pos[out_id] == "GK") != (pos[in_id] == "GK"):
                continue
            trial = [in_id if p == out_id else p for p in xi]
            if formation_ok(trial, pos, cfg):
                xi, subs = trial, subs + [(out_id, in_id)]
                bench_left.remove(in_id)
                break
    return xi, subs


def score_gameweek(picks, match_scores, rs_levels=None, cfg=CFG):
    """Squad total for one round.

    match_scores: player_id -> list of MatchScore for the round's matches
    rs_levels:    (player_id, fixture_id) -> Rising Star level used for that match
                  (from advance_rising_stars); players not in it get no bonus
    A player "played" if they had minutes in any of the round's matches.
    """
    rs_levels = rs_levels or {}

    def played(pid):
        return any(ms.minutes > 0 for ms in match_scores.get(pid, []))

    xi, subs = auto_substitute(picks, played, cfg)
    captain = next((c for c in (picks.captain, picks.vice_captain) if c in xi and played(c)), None)
    cap_mult = cfg["squad"]["captain_multiplier"]

    per_player = {}
    for pid in xi:
        total = 0.0
        for ms in match_scores.get(pid, []):
            level = rs_levels.get((pid, ms.fixture_id))
            rs_mult = rising_star_multiplier(level, cfg) if level is not None else 1.0
            total += final_match_points(ms, rs_mult, cap_mult if pid == captain else 1.0, cfg)
        per_player[pid] = round(total, 2)
    return GameweekResult(points=round(sum(per_player.values()), 2), players=per_player, final_xi=xi,
                          auto_subs=subs, captain_used=captain)
