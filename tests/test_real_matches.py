"""Hand check of real Premier League 2026/27 round 9 matches (Oct 31, 2026) from the API cache.

Each expected score was worked out by hand from the raw API-Football stats (see comments).
The raw data is not committed (API terms), so these tests skip when ./cache is absent.
"""

import json

import pytest

from squad.config import ROOT
from squad.scoring import parse_fixture, score_match

CACHE = ROOT / "cache" / "fixtures"


def scores_for(fixture_id):
    f = CACHE / f"{fixture_id}.json"
    if not f.exists():
        pytest.skip(f"fixture {fixture_id} not cached")
    return {pm.name: score_match(pm) for pm in parse_fixture(json.loads(f.read_text()))}


# Coventry 3-1 Sunderland (fixture 1557451)
COVENTRY_SUNDERLAND = {
    # MID 90' goal; Coventry conceded 1. 4 + 10 = 14 | inv 31x.02 + 2x.5 + 1x.5 + 4x.1 = 2.52
    "J. Rudoni": (14, 0, 2.52),
    # MID 90' goal, yellow. 4 + 10 = 14, -2 | inv 14x.02 + 1x.5 + 2x.1 = 0.98
    "T. Sakamoto": (14, -2, 0.98),
    # FWD 72' goal. 4 + 8 = 12 | inv 4x.02 + 1x.5 + 1x.3 + 5x.1 = 1.38
    "T. Awoniyi": (12, 0, 1.38),
    # GK 90', conceded 1 (no CS, 1 // 2 = 0 blocks), 1 save. 4 | inv 27x.02 + 1x.1 = 0.64
    "C. Rushworth": (4, 0, 0.64),
    # DEF 99', second yellow (API: R1 only), Sunderland conceded 3. 4 | -2 (3 // 2) -6 red = -8
    # inv 39x.02 + 4x.1 = 1.18 -> total -2.82
    "O. Alderete": (4, -8, 1.18),
}

# Chelsea 2-0 Manchester United (fixture 1557450)
CHELSEA_UNITED = {
    # MID 90' assist, clean sheet. 4 + 6 + 2 = 12 | inv 64x.02 + 2x.5 + 5x.3 + 7x.1 = 4.48 -> cap 4
    "R. Lavia": (12, 0, 4.0),
    # MID 97' penalty goal, clean sheet. 4 + 10 + 2 = 16 | inv 46x.02+3x.5+2x.5+2x.3+8x.1 = 4.82 -> 4
    "C. Palmer": (16, 0, 4.0),
    # GK 90' clean sheet, 3 saves, yellow. 4 + 8 + 2 = 14, -2 | inv 19x.02 = 0.38
    "M. Penders": (14, -2, 0.38),
    # GK 90' conceded 2, 8 saves. 4 + 2x2 = 8, -2 (2 // 2) | inv 16x.02 = 0.32
    "S. Lammens": (8, -2, 0.32),
    # DEF 63' straight red; v0.1 counts the team's full-match 2 conceded. 4 | -2 -6 = -8
    # inv 23x.02 + 1x.5 + 1x.3 + 2x.1 = 1.46 -> total -2.54
    "Lisandro Martínez": (4, -8, 1.46),
}


@pytest.mark.parametrize("fixture_id,expected", [(1557451, COVENTRY_SUNDERLAND), (1557450, CHELSEA_UNITED)])
def test_hand_checked_scores(fixture_id, expected):
    got = scores_for(fixture_id)
    for name, (core_plus, core_minus, inv) in expected.items():
        s = got[name]
        assert (s.core_plus, s.core_minus, s.involvement) == pytest.approx((core_plus, core_minus, inv)), name
