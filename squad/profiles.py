"""Usernames: each wallet picks one after signing in (config.toml [usernames]).

3 to 20 letters, digits and underscores, starting with a letter, unique regardless of case (Sam and sam are
the same name). Reserved names (admin, elevn, ...) and offensive ones are refused. A name can change once a
week, and a name given up stays locked to its old owner for that week, so nobody can grab it straight away
or pose as someone who just renamed. Usernames reset with the test season when $ELEVN launches.
"""

import re
from datetime import datetime, timedelta, timezone

import psycopg

from . import moderation
from .config import CFG

U = CFG["usernames"]
WEEK = timedelta(days=U["change_days"])
_RESERVED = {moderation.skeleton(r) for r in U["reserved"]}
_RESERVED_PARTS = [moderation.skeleton(r) for r in U["reserved_parts"]]
_FORMAT = re.compile(rf"[A-Za-z][A-Za-z0-9_]{{{U['min_length'] - 1},{U['max_length'] - 1}}}")


class UsernameError(Exception):
    """A refused name, with a message the player can read. code: invalid, taken or too_soon."""

    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def problem(name):
    """Why a name can't be used, or None when it can (the format and word rules; not whether it is free)."""
    if not _FORMAT.fullmatch(name or ""):
        return (f"Use {U['min_length']} to {U['max_length']} letters, numbers or underscores, "
                "starting with a letter")
    folded = moderation.skeleton(name)   # Adm1n, eIevn and el_evn fold onto the real words
    if folded in _RESERVED or any(part in folded for part in _RESERVED_PARTS):
        return "That name is reserved"
    if moderation.offensive_name(name):
        return "That username isn't allowed"
    return None


def get(conn, wallet):
    row = conn.execute("SELECT username, changed_at FROM profiles WHERE wallet = %s", (wallet,)).fetchone()
    return row and {"username": row[0], "changed_at": row[1], "next_change": row[1] + WEEK}


def names(conn, wallets):
    """{wallet: username} for the wallets that have one."""
    wallets = list(set(wallets))
    if not wallets:
        return {}
    return dict(conn.execute("SELECT wallet, username FROM profiles WHERE wallet = ANY(%s)", (wallets,)).fetchall())


def _holder(conn, key, now):
    """The wallet that owns or holds this name right now, if any."""
    row = conn.execute("""SELECT wallet FROM profiles WHERE username_key = %s
                          UNION ALL
                          SELECT wallet FROM username_holds WHERE username_key = %s AND until > %s""",
                       (key, key, now)).fetchone()
    return row and row[0]


def available(conn, name, wallet=None, now=None):
    """(free to take, reason if not), for the live check while typing. Your own current name counts as free."""
    if (why := problem(name)) is not None:
        return False, why
    holder = _holder(conn, name.lower(), now or datetime.now(timezone.utc))
    return (True, None) if holder in (None, wallet) else (False, "That username is taken")


def claim(conn, wallet, name, now=None):
    """Give the wallet this name (first pick or a change). Returns the name; raises UsernameError."""
    now = now or datetime.now(timezone.utc)
    if (why := problem(name)) is not None:
        raise UsernameError(why, "invalid")
    key = name.lower()
    # one claim per wallet and per name at a time (always in this order), so neither two players racing for
    # a name nor one wallet sending two renames at once can get past the checks below
    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"username-wallet:{wallet}",))
    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"username:{key}",))
    current = get(conn, wallet)
    if current and current["username"] == name:
        conn.commit()
        return name
    if current and now < current["next_change"]:
        conn.rollback()
        raise UsernameError(f"You can change your username again on {current['next_change']:%d %b, %H:%M} UTC",
                            "too_soon")
    if _holder(conn, key, now) not in (None, wallet):
        conn.rollback()
        raise UsernameError("That username is taken", "taken")
    try:
        conn.execute("""INSERT INTO profiles (wallet, username, username_key, changed_at) VALUES (%s, %s, %s, %s)
                        ON CONFLICT (wallet) DO UPDATE SET username = EXCLUDED.username,
                            username_key = EXCLUDED.username_key, changed_at = EXCLUDED.changed_at""",
                     (wallet, name, key, now))
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        raise UsernameError("That username is taken", "taken") from None
    if current and current["username"].lower() != key:
        conn.execute("""INSERT INTO username_holds (username_key, wallet, until) VALUES (%s, %s, %s)
                        ON CONFLICT (username_key) DO UPDATE SET wallet = EXCLUDED.wallet, until = EXCLUDED.until""",
                     (current["username"].lower(), wallet, now + WEEK))
    conn.commit()
    return name
