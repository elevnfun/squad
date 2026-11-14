"""Usernames: picked after sign-in, unique regardless of case, at least 3 characters, changed at most once a week."""

from datetime import datetime, timedelta, timezone

import pytest

from squad import profiles
from tests.test_game_db import conn  # noqa: F401

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
A, B = "WalletAAAA1111", "WalletBBBB2222"


@pytest.mark.parametrize("name, ok", [
    ("sam", True), ("Sam_99", True), ("x" * 20, True),
    ("ab", False), ("x" * 21, False), ("9lives", False), ("_sam", False),
    ("sam smith", False), ("sám", False), ("sam-1", False), ("", False),
])
def test_format_rules(name, ok):
    assert (profiles.problem(name) is None) == ok


@pytest.mark.parametrize("name", ["admin", "Admin", "elevn", "ELEVN_official", "real_admin", "Moderator", "support",
                                  "Adm1n", "eIevn", "el_evn", "E1evn_team", "Offic1al_news"])
def test_reserved_and_team_names_are_refused(name):
    assert "reserved" in profiles.problem(name)


@pytest.mark.parametrize("name", ["fuckface", "Sh1thead", "nazi_lad"])
def test_offensive_names_are_refused(name):
    assert profiles.problem(name) == "That username isn't allowed"


@pytest.mark.parametrize("name", ["Dickson", "Fagioli", "Nazionale", "Wankdorf_fan", "SpicyWings", "Hancock"])
def test_football_names_are_not_mistaken_for_abuse(name):
    assert profiles.problem(name) is None


def test_a_wallet_claims_a_name_and_sees_it(conn):
    assert profiles.claim(conn, A, "Sammy", NOW) == "Sammy"
    assert profiles.get(conn, A)["username"] == "Sammy"
    assert profiles.names(conn, [A, B]) == {A: "Sammy"}


def test_names_are_unique_regardless_of_case(conn):
    profiles.claim(conn, A, "Sammy", NOW)
    with pytest.raises(profiles.UsernameError) as e:
        profiles.claim(conn, B, "sAMMY", NOW)
    assert e.value.code == "taken"
    assert profiles.available(conn, "SAMMY") == (False, "That username is taken")
    assert profiles.available(conn, "SAMMY", wallet=A) == (True, None)          # your own name


def test_a_name_changes_at_most_once_a_week(conn):
    profiles.claim(conn, A, "Sammy", NOW)
    with pytest.raises(profiles.UsernameError) as e:
        profiles.claim(conn, A, "Samuel", NOW + timedelta(days=6))
    assert e.value.code == "too_soon"
    assert profiles.claim(conn, A, "Samuel", NOW + timedelta(days=7)) == "Samuel"
    assert profiles.get(conn, A)["next_change"] == NOW + timedelta(days=14)


def test_claiming_your_own_name_again_changes_nothing(conn):
    profiles.claim(conn, A, "Sammy", NOW)
    assert profiles.claim(conn, A, "Sammy", NOW + timedelta(hours=1)) == "Sammy"
    assert profiles.get(conn, A)["next_change"] == NOW + timedelta(days=7)        # the clock did not restart


def test_a_given_up_name_stays_locked_for_a_week(conn):
    profiles.claim(conn, A, "Sammy", NOW)
    profiles.claim(conn, A, "Samuel", NOW + timedelta(days=7))
    with pytest.raises(profiles.UsernameError) as e:
        profiles.claim(conn, B, "sammy", NOW + timedelta(days=8))
    assert e.value.code == "taken"
    assert profiles.claim(conn, B, "sammy", NOW + timedelta(days=15)) == "sammy"


def test_an_invalid_name_is_refused_before_anything_is_stored(conn):
    with pytest.raises(profiles.UsernameError) as e:
        profiles.claim(conn, A, "ab", NOW)
    assert e.value.code == "invalid"
    assert profiles.get(conn, A) is None
