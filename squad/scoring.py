"""$ELEVN scoring engine: the one code path for live scores, settlement and pricing.

Match score = Core+ + Involvement + Core- (before any captain multiplier)
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
        """Points before any captain multiplier."""
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
