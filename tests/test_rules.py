"""Save-time squad rules, transfer counting and weekly repricing, against hand-worked cases."""

from squad.rules import PlayerInfo, plan_transfers, validate_squad, weekly_price

LEAGUE = 39


def pool():
    """6 clubs x (2 GK, 4 DEF, 4 MID, 2 FWD); player id = club*100 + n."""
    out = {}
    for c in range(1, 7):
        for n, pos in enumerate(["GK"] * 2 + ["DEF"] * 4 + ["MID"] * 4 + ["FWD"] * 2, start=1):
            out[c * 100 + n] = PlayerInfo(c * 100 + n, pos, c, LEAGUE)
    return out


# a legal 15 (max 3 per club): XI = GK, 4 DEF, 4 MID, 2 FWD; bench = GK, DEF, MID, FWD
XI = [101, 103, 203, 303, 403, 107, 207, 307, 507, 611, 511]
BENCH = [201, 603, 607, 411]


def check(starters=XI, bench=BENCH, captain=107, vice=207, players=None, cost=None, stars=frozenset(), budget=None):
    players = players or pool()
    cost = cost or {p: 6.0 for p in players}
    return [p.code for p in validate_squad(starters, bench, captain, vice, players, LEAGUE, cost, stars, budget)]


def test_legal_squad_saves():
    assert check() == []


def test_budget_is_checked_on_save():
    cost = {p: 6.0 for p in pool()}
    cost[101] = 16.0                                    # 14 x 6 + 16 = 100.0: still fine
    assert check(cost=cost) == []
    cost[101] = 16.1                                    # 100.1
    assert check(cost=cost) == ["budget"]
    # players who rose sell for more: a squad whose team value grew to 100.3M can spend it
    assert check(cost=cost, budget=100.3) == []
    assert check(budget=89.9) == ["budget"]             # 90.0M squad, 89.9M to spend


def test_club_limit():
    xi = [101, 103, 104, 105, 403, 107, 207, 307, 507, 611, 511]   # 4 from club 1
    assert "club_limit" in check(starters=xi)


def test_other_leagues_players_are_rejected():
    players = pool()
    players[611] = PlayerInfo(611, "FWD", 6, 140)
    assert check(players=players) == ["wrong_league"]


def test_position_quota_and_formation():
    xi = [101, 103, 203, 303, 403, 107, 207, 307, 507, 611, 508]   # MID in for FWD: 6 MID, 2 FWD
    assert check(starters=xi) == ["quota", "quota"]
    xi = [101, 201, 203, 303, 403, 107, 207, 307, 507, 611, 511]   # two GKs start, bench GK is a DEF
    assert check(starters=xi, bench=[103, 603, 607, 411]) == ["xi_formation", "bench_gk"]
    xi = [101, 103, 203, 107, 207, 307, 507, 607, 611, 511, 411]   # 2 DEF start
    assert check(starters=xi, bench=[201, 303, 403, 603]) == ["xi_formation"]


def test_sizes_and_duplicates():
    assert set(check(starters=XI[:10])) >= {"xi_size", "quota"}
    assert "duplicate" in check(bench=[201, 603, 607, 611])


def test_captain_and_vice():
    assert check(captain=201) == ["captain"]            # captain on the bench
    assert check(vice=107) == ["vice_captain"]          # same player


def test_rising_stars_max_two():
    assert check(stars={107, 207}) == []
    assert check(stars={107, 207, 307}) == ["rising_stars"]


def test_problems_are_all_reported_at_once():
    cost = {p: 7.0 for p in pool()}                     # 105M
    assert check(cost=cost, captain=201) == ["budget", "captain"]


# ------------------------------------------------------------- transfers ---
POS = {p.id: p.position for p in pool().values()}
SQUAD = XI + BENCH


def test_first_gameweek_build_is_free():
    assert plan_transfers(None, SQUAD, POS) == []


def test_reordering_is_not_a_transfer():
    assert plan_transfers(SQUAD, list(reversed(SQUAD)), POS) == []


def test_three_free_then_minus_eight():
    new = [p for p in SQUAD if p not in (103, 203, 107, 207, 611)] + [104, 204, 108, 208, 612]
    t = plan_transfers(SQUAD, new, POS)
    assert [x.kind for x in t].count("free") == 3
    assert [x.penalty for x in t if x.kind == "extra"] == [-8, -8]
    assert all(POS[x.player_out] == POS[x.player_in] for x in t)


def test_unavailable_player_is_replaced_free_on_top():
    new = [p for p in SQUAD if p not in (103, 203, 107, 207)] + [104, 204, 108, 208]
    t = plan_transfers(SQUAD, new, POS, unavailable={207})
    assert {(x.player_out, x.kind) for x in t if x.kind == "replacement"} == {(207, "replacement")}
    assert sorted(x.kind for x in t) == ["free", "free", "free", "replacement"]
    assert sum(x.penalty for x in t) == 0


# -------------------------------------------------------------- repricing ---
def test_weekly_price_form_and_ownership():
    assert weekly_price(10.0, 12, 10, 0) == 10.1        # 0.05 x 20% = +1%
    assert weekly_price(4.0, 4.4, 4, 0.04) == 4.1       # +0.5% + 2% = +2.5% = +0.1M
    assert weekly_price(10.0, 12, 10, 0.1) == 10.3      # +6% = +0.6M, capped at +0.3M a week
    assert weekly_price(10.0, 0, 10, -0.5) == 9.7       # -10% = -1.0M, capped at -0.3M
    assert weekly_price(4.1, 0, 10, -0.5) == 4.0        # never below 4.0M
    assert weekly_price(14.9, 30, 10, 0.5) == 15.0      # never above 15.0M
    assert weekly_price(5.0, None, None, 0.04) == 5.1   # no appearances: ownership only, +2%
