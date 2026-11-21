"""Scoring tests against hand-computed examples. Every expected number is worked out in the comment."""

import pytest

from squad.scoring import PlayerMatch, accurate_pass_count, parse_fixture, score_match


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
