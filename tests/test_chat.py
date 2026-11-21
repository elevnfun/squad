"""Community chat: one room, readable by anyone; posting needs a username."""

from datetime import datetime, timedelta, timezone

import pytest

from squad import chat, profiles

NOW = datetime(2026, 8, 20, 14, 0, tzinfo=timezone.utc)
ADMIN = "FeeWalletAdmin0000"


def player(c, wallet, name):
    """A wallet with a username."""
    profiles.claim(c, wallet, name, NOW - timedelta(days=1))
    c.commit()
    return wallet


@pytest.fixture
def room(conn, monkeypatch):
    monkeypatch.setenv("FEE_WALLET", ADMIN)
    return conn


def say(c, wallet, body, at=NOW, ip="203.0.113.7"):
    return chat.post(c, wallet, body, ip, at)


def test_a_player_posts_and_everyone_reads_it(room):
    w = player(room, "WalletSam", "Sammy")
    msg = say(room, w, "  Haaland captain this week?  ")
    assert msg["body"] == "Haaland captain this week?" and msg["username"] == "Sammy"
    page = chat.messages(room, now=NOW)
    assert [m["body"] for m in page["messages"]] == ["Haaland captain this week?"]
    assert page["messages"][0]["admin"] is False


def test_posting_needs_a_username(room):
    assert chat.can_post(room, "NoNameWallet") == (False, "username")
    with pytest.raises(chat.ChatError, match="Pick a username"):
        say(room, "NoNameWallet", "hello")
    w = player(room, "WalletNamed", "Named")
    assert chat.can_post(room, w) == (True, None)


@pytest.mark.parametrize("body, why", [
    ("", "empty"), ("x" * 501, "500"),
    ("free tokens at https://scam.example", "Links"), ("go to www.drainer.io now", "Links"),
    ("claim at elevn-airdrop.xyz", "Links"), ("you absolute cunt", "friendly"),
    ("mint at evil.shop", "Links"), ("evil。com", "Links"), ("go to drainer dot com", "Links"),
    ("join t.me/freesol", "Links"), ("⁠﻿ㅤ", "empty"), ("\n".join(["line"] * 10), "lines"),
])
def test_messages_are_checked(room, body, why):
    w = player(room, "WalletSam", "Sammy")
    with pytest.raises(chat.ChatError, match=why):
        say(room, w, body)


def test_ordinary_football_talk_is_fine(room):
    w = player(room, "WalletSam", "Sammy")
    talk = ["Man Utd 2.1 xG, unlucky", "Saka (doubtful) or Palmer?", "Classic Scunthorpe vs Arsenal",
            "Dickson scored at the Wankdorf", "Fagioli and Nazionale call-ups", "Spicy derby, Cockerill sub",
            "Go Spurs. It was a pen, trust me. Me and Man.Utd fans agree"]
    for i, body in enumerate(talk):
        say(room, w, body, NOW + timedelta(seconds=10 * i))


def test_the_admin_restores_a_message_hidden_by_reports(room):
    admin = player(room, ADMIN, "Founder")
    target = player(room, "WalletFan", "Fanny")
    m = say(room, target, "Arsenal will bottle it again")
    for i in range(3):
        chat.report(room, player(room, f"WalletRival{i}", f"Rival{i}"), m["id"], NOW)
    assert chat.messages(room, now=NOW)["messages"] == []
    held = chat.messages(room, now=NOW, viewer=admin)["messages"]
    assert held[0]["held"] is True                                   # the admin still sees it, marked
    chat.restore(room, admin, m["id"], NOW)
    assert [x["body"] for x in chat.messages(room, now=NOW)["messages"]] == ["Arsenal will bottle it again"]
    chat.report(room, player(room, "WalletRival9", "Rival9"), m["id"], NOW)   # restored: reports no longer hide it
    assert len(chat.messages(room, now=NOW)["messages"]) == 1


def test_reports_per_wallet_are_limited(room, monkeypatch):
    monkeypatch.setitem(chat.C, "reports_per_hour", 2)
    r = player(room, "WalletReporter", "Reporter")
    w = player(room, "WalletTalker", "Talker")
    ids = [say(room, w, f"take {i}", NOW + timedelta(seconds=10 * i))["id"] for i in range(3)]
    chat.report(room, r, ids[0], NOW)
    chat.report(room, r, ids[1], NOW)
    with pytest.raises(chat.ChatError, match="reported a lot"):
        chat.report(room, r, ids[2], NOW)


def test_the_admin_cannot_ban_themselves(room):
    admin = player(room, ADMIN, "Founder")
    with pytest.raises(chat.ChatError, match="yourself"):
        chat.moderate(room, admin, admin, "ban", NOW)


def test_wallets_are_slowed_down(room):
    w = player(room, "WalletSam", "Sammy")
    say(room, w, "first")
    with pytest.raises(chat.ChatError, match="Slow down"):
        say(room, w, "second", NOW + timedelta(seconds=1))
    with pytest.raises(chat.ChatError, match="just sent"):
        say(room, w, "first", NOW + timedelta(seconds=10))
    for i in range(1, chat.C["per_wallet_per_10min"]):
        say(room, w, f"message {i}", NOW + timedelta(seconds=10 * i))
    with pytest.raises(chat.ChatError, match="a lot of messages"):
        say(room, w, "one more", NOW + timedelta(seconds=300))
    say(room, w, "one more", NOW + timedelta(minutes=12))


def test_one_connection_is_slowed_down_across_wallets(room, monkeypatch):
    monkeypatch.setitem(chat.C, "per_ip_per_10min", 3)
    ws = [player(room, f"Wallet{i}", f"Player{i}") for i in range(4)]
    for i, w in enumerate(ws[:3]):
        say(room, w, f"hi {i}", NOW + timedelta(seconds=i))
    with pytest.raises(chat.ChatError, match="a lot of messages"):
        say(room, ws[3], "hi 3", NOW + timedelta(seconds=5))
    say(room, ws[3], "hi 3", NOW + timedelta(seconds=5), ip="198.51.100.1")


def test_polling_returns_only_new_messages_and_scrollback_returns_older_ones(room, monkeypatch):
    monkeypatch.setitem(chat.C, "page", 3)
    w = player(room, "WalletSam", "Sammy")
    ids = [say(room, w, f"m{i}", NOW + timedelta(seconds=10 * i))["id"] for i in range(5)]
    assert [m["body"] for m in chat.messages(room, now=NOW)["messages"]] == ["m2", "m3", "m4"]   # the latest page
    assert [m["body"] for m in chat.messages(room, after=ids[3], now=NOW)["messages"]] == ["m4"]
    assert [m["body"] for m in chat.messages(room, before=ids[2], now=NOW)["messages"]] == ["m0", "m1"]


def test_authors_delete_their_own_messages_and_pollers_hear_about_it(room):
    a, b = player(room, "WalletSam", "Sammy"), player(room, "WalletKim", "Kimmy")
    m = say(room, a, "oops wrong thread")
    with pytest.raises(chat.ChatError, match="your own"):
        chat.hide(room, b, m["id"], NOW)
    chat.hide(room, a, m["id"], NOW)
    page = chat.messages(room, after=m["id"], now=NOW)               # a page that still shows it hears it's gone
    assert page["messages"] == [] and page["hidden"] == [m["id"]]


def test_three_reports_hide_a_message(room):
    spam = player(room, "WalletSpam", "Spammer")
    m = say(room, spam, "buy my course")
    reporters = [player(room, f"WalletR{i}", f"Reporter{i}") for i in range(3)]
    with pytest.raises(chat.ChatError, match="your own"):
        chat.report(room, spam, m["id"], NOW)
    for r in reporters[:2]:
        chat.report(room, r, m["id"], NOW)
        chat.report(room, r, m["id"], NOW)                       # twice counts once
    assert len(chat.messages(room, now=NOW)["messages"]) == 1
    chat.report(room, reporters[2], m["id"], NOW)
    assert chat.messages(room, now=NOW)["messages"] == []


def test_the_admin_hides_mutes_and_bans(room):
    admin = player(room, ADMIN, "Founder")
    troll = player(room, "WalletTroll", "Trolly")
    m1 = say(room, troll, "first rude thing")
    assert chat.messages(room, now=NOW)["messages"][0]["admin"] is False
    chat.hide(room, admin, m1["id"], NOW)
    chat.moderate(room, admin, troll, "mute", NOW, hours=24)
    with pytest.raises(chat.ChatError, match="muted"):
        say(room, troll, "still here", NOW + timedelta(hours=1))
    say(room, troll, "back again", NOW + timedelta(hours=25))
    chat.moderate(room, admin, troll, "ban", NOW + timedelta(hours=26))
    assert chat.messages(room, now=NOW + timedelta(hours=26))["messages"] == []    # a ban clears their messages
    with pytest.raises(chat.ChatError, match="banned"):
        say(room, troll, "let me in", NOW + timedelta(days=3))
    with pytest.raises(chat.ChatError, match="Only the admin"):
        chat.moderate(room, troll, admin, "ban", NOW)
    assert say(room, admin, "Welcome to the beta", NOW + timedelta(days=3))["admin"] is True


def test_reports_are_shown_to_the_admin_only(room):
    a, r = player(room, "WalletSam", "Sammy"), player(room, "WalletKim", "Kimmy")
    admin = player(room, ADMIN, "Founder")
    m = say(room, a, "borderline")
    chat.report(room, r, m["id"], NOW)
    assert "reports" not in chat.messages(room, now=NOW, viewer=r)["messages"][0]
    assert chat.messages(room, now=NOW, viewer=admin)["messages"][0]["reports"] == 1


def test_the_connection_is_stored_only_as_a_hash(room):
    w = player(room, "WalletSam", "Sammy")
    say(room, w, "hello", ip="203.0.113.7")
    (stored,) = room.execute("SELECT ip_hash FROM chat_messages").fetchone()
    assert "203.0.113.7" not in stored and len(stored) >= 32
