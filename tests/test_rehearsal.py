"""The rehearsal's bot roster and squad rules, checked offline (no devnet, no database)."""
import csv
import random
from collections import Counter

import pytest

from squad.config import CFG, ROOT
from squad.rehearsal import BOTS, REQ, SELL_TO, SELLER, expected_squads, rule_key
from squad.simulate import build_squad

PRICES = ROOT / "out" / "prices_premier-league.csv"
SQ = CFG["squad"]


def test_roster_covers_refusals_and_multi_squad_wallets():
    allowed = {name: expected_squads(held, rules) for name, held, rules in BOTS}
    assert len(BOTS) == 10
    assert allowed["Zero"] == 0 and allowed["Short"] == 0
    assert all(n >= 1 for name, n in allowed.items() if name not in ("Zero", "Short"))
    assert max(allowed.values()) >= 3


def test_seller_ends_up_paying_for_exactly_one_squad():
    held, rules = next((h, r) for n, h, r in BOTS if n == SELLER)
    assert expected_squads(held, rules) == 2
    assert int(SELL_TO // REQ) == 1


def test_clock_shift_keeps_kickoffs_on_the_hour_and_in_the_future():
    from datetime import datetime, timedelta, timezone
    from squad.rehearsal import clock_shift
    kickoff = datetime(2026, 10, 4, 14, 30, tzinfo=timezone.utc)
    now = datetime(2026, 11, 11, 15, 57, 12, tzinfo=timezone.utc)
    shift = clock_shift(kickoff, now, timedelta(hours=2))
    assert shift % timedelta(hours=1) == timedelta(0)
    assert now + timedelta(hours=2) <= kickoff + shift < now + timedelta(hours=3)
    assert (kickoff + shift).minute == 30


def test_rpc_retries_when_rate_limited(monkeypatch):
    import io
    import urllib.error
    from squad import chain
    answers = [urllib.error.HTTPError("u", 429, "Too Many Requests", {}, None),
               io.BytesIO(b'{"jsonrpc": "2.0", "id": 1, "result": {"value": 5}}')]
    def answer(req, timeout):
        a = answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a
    monkeypatch.setattr(chain.urllib.request, "urlopen", answer)
    monkeypatch.setattr(chain.time, "sleep", lambda s: None)
    assert chain.Rpc("http://rpc.test").sol_balance("x") == 5


def test_rpc_gives_up_on_other_errors(monkeypatch):
    import urllib.error
    from squad import chain

    def refuse(req, timeout):
        raise urllib.error.HTTPError("u", 500, "Server Error", {}, None)
    monkeypatch.setattr(chain.urllib.request, "urlopen", refuse)
    with pytest.raises(urllib.error.HTTPError):
        chain.Rpc("http://rpc.test").sol_balance("x")


@pytest.mark.skipif(not PRICES.exists(), reason="needs out/prices_premier-league.csv")
@pytest.mark.parametrize("rule", sorted({r for _, _, rules in BOTS for r in rules}))
def test_every_rule_builds_a_valid_squad(rule):
    rows = list(csv.DictReader(open(PRICES, encoding="utf-8")))
    by_id = {int(r["player_id"]): r for r in rows}
    xi, bench, cap, vice = build_squad(rows, rule_key(rule, random.Random(rule)))
    squad = xi + bench
    assert len(squad) == len(set(squad)) == 15
    assert Counter(by_id[p]["position"] for p in squad) == Counter(SQ["quota"])
    assert max(Counter(by_id[p]["team_id"] for p in squad).values()) <= SQ["max_per_club"]
    assert round(sum(float(by_id[p]["price"]) for p in squad), 1) <= SQ["budget"]
    assert cap in xi and vice in xi and cap != vice
