"""Scoring tests against hand-computed examples. Every expected number is worked out in the comment."""

import copy

import pytest

from squad.config import CFG
from squad.scoring import (MatchScore, Picks, PlayerMatch, accurate_pass_count, advance_rising_stars,
                           final_match_points, parse_fixture, rising_star_multiplier, score_gameweek,
                           score_match)


def pm(**kw):
    base = dict(player_id=1, fixture_id=100, team_id=10, position="MID", minutes=90)
    base.update(kw)
    return PlayerMatch(**base)


# ------------------------------------------------------------ core points ---
def test_defender_goal_assist_clean_sheet_yellow():
    # 4 (60+) + 12 goal + 6 assist + 8 clean sheet = 30 core+; yellow -2 core-
    # involvement: 40 x 0.02 + 1 x 0.5 + 3 x 0.3 + 5 x 0.1 = 0.8 + 0.5 + 0.9 + 0.5 = 2.7
    s = score_match(pm(position="DEF", goals=1, assists=1, conceded=0, yellow=1,
                       accurate_passes=40, key_passes=1, tackles=3, duels_won=5))
    assert (s.core_plus, s.core_minus, s.involvement) == (30, -2, 2.7)
    assert s.base == pytest.approx(30.7)


def test_goalkeeper_conceded_and_saves():
    # 4 + saves 7 // 3 = 2 blocks x 2 = 4 -> core+ 8; conceded 3 // 2 = 1 block x -2 -> core- -2
    s = score_match(pm(position="GK", conceded=3, saves=7))
    assert (s.core_plus, s.core_minus) == (8, -2)


def test_goalkeeper_penalty_save_clean_sheet():
    # 4 + 8 clean sheet + 10 pen save + 2 (3 saves) = 24
    s = score_match(pm(position="GK", conceded=0, saves=3, pen_saved=1))
    assert s.core_plus == 24 and s.core_minus == 0


def test_forward_two_goals_no_clean_sheet_points():
    # 4 + 2 x 8 = 20; forwards get 0 for a clean sheet and no conceded penalty
    s = score_match(pm(position="FWD", goals=2, conceded=0))
    assert s.core_plus == 20


def test_midfielder_clean_sheet_and_no_conceded_penalty():
    # MID: 4 + 2 clean sheet = 6; MID never loses points for goals conceded
    assert score_match(pm(position="MID", conceded=0)).core_plus == 6
    assert score_match(pm(position="MID", conceded=4)).core_minus == 0


def test_sub_under_60_minutes_gets_no_clean_sheet_or_conceded():
    # DEF 30 min: 2 appearance only, team conceded 4 does not count under 60 minutes
    s = score_match(pm(position="DEF", minutes=30, conceded=4))
    assert (s.core_plus, s.core_minus) == (2, 0)


def test_red_card_replaces_yellow():
    # second yellow: API shows yellow 1 + red 1 -> only -6, as FPL counts only the red
    s = score_match(pm(position="MID", yellow=1, red=1, conceded=1))
    assert s.core_minus == -6


def test_own_goal_and_missed_penalty():
    # -4 own goal, -4 missed pen; DEF conceded 2 -> -2; total core- = -10
    s = score_match(pm(position="DEF", own_goals=1, pen_missed=1, conceded=2))
    assert s.core_minus == -10


def test_involvement_cap():
    # 100 x 0.02 + 4 x 0.5 + 4 x 0.5 = 2 + 2 + 2 = 6 -> capped at 4
    s = score_match(pm(accurate_passes=100, key_passes=4, shots_on=4))
    assert s.involvement == 4.0


def test_did_not_play_scores_zero():
    s = score_match(pm(minutes=0, goals=1))
    assert s.base == 0 and s.breakdown == []


def test_accurate_pass_count_handles_percent():
    assert accurate_pass_count({"total": 50, "accuracy": "40"}) == 40
    assert accurate_pass_count({"total": 50, "accuracy": "80%"}) == 40
    assert accurate_pass_count({"total": 20, "accuracy": 85}) == 17   # 85 > 20 -> percentage


# -------------------------------------------------------------- multipliers ---
def ms(core_plus, core_minus=0.0, inv=0.0, pid=1, fid=100, minutes=90, rating=0.0):
    return MatchScore(pid, fid, minutes, rating, core_plus, core_minus, inv)


def test_captain_doubles_positive_points_only():
    # (10 + 2) x 2 + (-2) = 22, not 20
    assert final_match_points(ms(10, -2, 2), captain_mult=2) == 22


def test_captain_negatives_flag_respected():
    cfg = copy.deepcopy(CFG)
    cfg["scoring"]["captain_doubles_negatives"] = True
    assert final_match_points(ms(10, -2, 2), captain_mult=2, cfg=cfg) == 20


def test_rising_star_multiplier_levels():
    assert [rising_star_multiplier(l) for l in (1, 2, 3, 4, 5, 9)] == [1.1, 1.15, 1.2, 1.25, 1.3, 1.3]


def test_rising_star_and_captain_stack_on_positives():
    # (10 + 2) x 1.2 x 2 + (-2) = 28.8 - 2 = 26.8
    assert final_match_points(ms(10, -2, 2), rs_mult=1.2, captain_mult=2) == 26.8


def test_rising_star_brief_example():
    # Brief: week 1 14 pts at L1 -> 15.4, L2; week 2 6 pts at L2 -> 6.9, L2; week 3 18 at L2 -> 20.7, L3
    weeks = [ms(14, fid=1), ms(6, fid=2), ms(18, fid=3)]
    used, levels = advance_rising_stars({1: 1}, weeks)
    assert [used[(1, f)] for f in (1, 2, 3)] == [1, 2, 2]
    assert levels[1] == 3
    finals = [final_match_points(w, rising_star_multiplier(used[(1, w.fixture_id)])) for w in weeks]
    assert finals == [15.4, 6.9, 20.7]


def test_rising_star_upgrade_by_rating_and_cap():
    # 4 base points but rating 7.6 -> upgrade; already level 5 -> stays 5
    _, lv = advance_rising_stars({1: 2}, [ms(4, rating=7.6)])
    assert lv[1] == 3
    _, lv = advance_rising_stars({1: 5}, [ms(20)])
    assert lv[1] == 5


# ------------------------------------------------------------ squad / subs ---
POS = {1: "GK", 2: "DEF", 3: "DEF", 4: "DEF", 5: "MID", 6: "MID", 7: "MID", 8: "MID",
       9: "FWD", 10: "FWD", 11: "MID",                    # XI: 1 GK, 3 DEF, 5 MID, 2 FWD
       12: "GK", 13: "DEF", 14: "FWD", 15: "MID"}         # bench: GK, DEF, FWD, MID


def picks(**kw):
    p = dict(starters=list(range(1, 12)), bench=[12, 13, 14, 15], captain=9, vice_captain=5, positions=POS)
    p.update(kw)
    return Picks(**p)


def scores(points, dnp=()):
    """Every player scores `points[pid]` (default 2) in fixture 100 unless in dnp (0 minutes)."""
    out = {}
    for pid in POS:
        if pid in dnp:
            out[pid] = [ms(0, pid=pid, minutes=0)]
        else:
            out[pid] = [ms(points.get(pid, 2), pid=pid)]
    return out


def test_full_xi_captain_doubled():
    # 10 starters x 2 + captain (9) scores 10 x 2 = 20 -> 40
    r = score_gameweek(picks(), scores({9: 10}))
    assert r.points == 40 and r.auto_subs == [] and r.captain_used == 9


def test_vice_captain_takes_over():
    # captain 9 did not play -> first bench outfielder 13 (DEF) comes in (3-5-2 -> 4-5-1, legal)
    # vice 5 (6 pts) doubled = 12; the other 10 in the XI (1-4, 6-8, 10, 11, 13) x 2 = 20 -> 32
    r = score_gameweek(picks(), scores({5: 6}, dnp={9}))
    assert r.captain_used == 5
    assert r.auto_subs == [(9, 13)]
    assert r.points == 32


def test_auto_sub_respects_formation():
    # DEF 2 did not play; only 3 DEF in XI, so a DEF is needed: bench order 13 (DEF) first -> fine.
    # Now make 13 also a non-player: next outfielder 14 is FWD -> would leave 2 DEF (illegal), skip;
    # 15 is MID -> also 2 DEF, illegal -> no sub; XI plays with 10 men.
    r = score_gameweek(picks(), scores({}, dnp={2, 13}))
    assert r.auto_subs == []
    assert r.points == 10 * 2 + 2          # 10 players x 2, captain 9 doubled (+2)


def test_goalkeeper_only_replaced_by_goalkeeper():
    r = score_gameweek(picks(), scores({}, dnp={1}))
    assert r.auto_subs == [(1, 12)]
    r = score_gameweek(picks(), scores({}, dnp={1, 12}))
    assert r.auto_subs == []


def test_bench_points_do_not_count():
    r = score_gameweek(picks(), scores({12: 50, 13: 50}))
    assert r.points == 11 * 2 + 2


def test_rising_star_in_squad():
    # player 6 is a Rising Star at L3 (x1.2): 10 pts -> 12; others 2 each; captain 9 2 -> 4
    # total = 9 x 2 (1,2,3,4,5,7,8,10,11) + 12 + 4 = 34
    r = score_gameweek(picks(), scores({6: 10}), rs_levels={(6, 100): 3})
    assert r.players[6] == 12 and r.points == 34


# ------------------------------------------------------------ API parsing ---
def test_parse_fixture_events_and_conceded():
    fx = {
        "fixture": {"id": 7}, "goals": {"home": 2, "away": 1},
        "teams": {"home": {"id": 1}, "away": {"id": 2}},
        "events": [{"type": "Goal", "detail": "Own Goal", "player": {"id": 22}},
                   {"type": "Goal", "detail": "Missed Penalty", "player": {"id": 11}}],
        "players": [
            {"team": {"id": 1}, "players": [
                {"player": {"id": 11, "name": "Home Fwd"}, "statistics": [{
                    "games": {"minutes": 90, "position": "F", "rating": "7.9"},
                    "goals": {"total": 1, "assists": 0, "conceded": None}, "passes": {"total": 20, "accuracy": "15"},
                    "penalty": {"missed": None}, "cards": {"yellow": 0, "red": 0}}]}]},
            {"team": {"id": 2}, "players": [
                {"player": {"id": 21, "name": "Away GK"}, "statistics": [{
                    "games": {"minutes": 90, "position": "G"}, "goals": {"total": 0, "conceded": 2, "saves": 4}}]},
                {"player": {"id": 22, "name": "Away Def"}, "statistics": [{
                    "games": {"minutes": 90, "position": "D"}, "goals": {"total": 0, "conceded": None}}]},
                {"player": {"id": 23, "name": "Unused"}, "statistics": [{"games": {"minutes": None, "position": "M"}}]},
                {"player": {"id": 24, "name": "No pos"}, "statistics": [{"games": {"minutes": 10}}]}]},
        ],
    }
    rows = {p.player_id: p for p in parse_fixture(fx)}
    assert set(rows) == {11, 21, 22, 23}
    assert rows[11].pen_missed == 1 and rows[11].accurate_passes == 15 and rows[11].rating == 7.9
    assert rows[11].conceded == 1                       # home team conceded 1
    assert rows[22].own_goals == 1 and rows[22].conceded == 2
    assert rows[21].conceded == 2 and rows[21].saves == 4
    assert rows[23].minutes == 0
