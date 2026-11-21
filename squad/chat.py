"""The community chat: one room for every player (config.toml [chat]).

Anyone can read it, signed in or not. Posting needs a username. Messages are plain text, up to 500 characters and 8
lines, with no links (the commonest scam on crypto sites) and no slurs or abuse (squad/moderation.py).
Each wallet and each connection is slowed down; the connection is kept only as a keyed hash (an IPv6
network counts as one connection). Players delete their own messages and report others: three reports from
different players hide a message until the admin (the fee wallet) looks, and the admin can restore it.
The admin can hide any message, mute a wallet for some hours, or ban it, which also hides its messages.
The website asks for new messages every few seconds (after=<last id>); those answers also carry the ids
hidden in the last few minutes, so removed messages disappear from open pages.
"""

import hashlib
import hmac
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from . import auth, chain, faucet, holdings, moderation, profiles
from .config import CFG

C = CFG["chat"]
TEN_MIN = timedelta(minutes=10)
_IP_KEY = hmac.new(auth._SECRET, b"chat-ip", hashlib.sha256).digest()   # its own key, not the session key
# characters that show nothing: format marks (zero-width, direction overrides, tags), line and paragraph
# separators, and the blank "filler" letters some scripts have
_FILLERS = {"ᅟ", "ᅠ", "ㅤ", "ﾠ", "⠀", "­"}


class ChatError(Exception):
    """A refused chat action, with a message the player can read and the HTTP status to answer with."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def ip_key(ip):
    return hmac.new(_IP_KEY, faucet.network(ip or "unknown").encode(), hashlib.sha256).hexdigest()


def _held(conn, wallet):
    """The wallet's $ELEVN: the dev balance if set, else the balance the watcher last stored (0 if never seen)."""
    import os
    if os.environ.get("HOLDINGS_DEV_BALANCE"):
        return holdings.balance(wallet)
    return holdings.stored_balance(conn, wallet) or 0


def can_post(conn, wallet, now=None):
    """(allowed, reason): reason is username, banned, muted or holding (under the Blitz requirement of $ELEVN)."""
    now = now or datetime.now(timezone.utc)
    row = conn.execute("SELECT chat_banned, chat_muted_until FROM profiles WHERE wallet = %s", (wallet,)).fetchone()
    if row is None:
        return False, "username"
    if row[0]:
        return False, "banned"
    if row[1] and row[1] > now:
        return False, "muted"
    if holdings.enabled() and _held(conn, wallet) < CFG["blitz"]["requirement"]:
        return False, "holding"
    return True, None


def _require(conn, wallet, now):
    ok, why = can_post(conn, wallet, now)
    if ok:
        return
    if why == "muted":
        (until,) = conn.execute("SELECT chat_muted_until FROM profiles WHERE wallet = %s", (wallet,)).fetchone()
        raise ChatError(f"You're muted until {until:%d %b, %H:%M} UTC", 403)
    raise ChatError({"username": "Pick a username to chat",
                     "banned": "You're banned from the chat",
                     "holding": f"Hold {CFG['blitz']['requirement']:,} $ELEVN to post in the chat"}[why], 403)


def _visible(ch):
    return ch == "\n" or (ch not in _FILLERS and unicodedata.category(ch) not in ("Cc", "Cf", "Zl", "Zp", "Co", "Cn"))


def clean(body):
    body = "".join(ch for ch in (body or "").replace("\r\n", "\n") if _visible(ch))
    body = "\n".join(line.rstrip() for line in body.split("\n")).strip()
    body = re.sub(r"\n{3,}", "\n\n", body)
    if not body:
        raise ChatError("The message is empty")
    if len(body) > C["max_length"]:
        raise ChatError(f"Keep messages under {C['max_length']} characters")
    if body.count("\n") >= C["max_lines"]:
        raise ChatError(f"Keep messages to {C['max_lines']} lines")
    if moderation.has_link(body):
        raise ChatError("Links aren't allowed in chat")
    if moderation.offensive_text(body):
        raise ChatError("Keep it friendly: that message has a word we don't allow")
    return body


def _slow_down(conn, wallet, body, ip_hash, now):
    recent = conn.execute("""SELECT body, created_at FROM chat_messages WHERE wallet = %s
                             ORDER BY created_at DESC, id DESC LIMIT 3""", (wallet,)).fetchall()
    if recent and now - recent[0][1] < timedelta(seconds=C["min_seconds_between"]):
        raise ChatError("Slow down: wait a few seconds between messages", 429)
    if any(b == body and now - at < timedelta(minutes=2) for b, at in recent):
        raise ChatError("You just sent that", 429)
    (mine,) = conn.execute("SELECT count(*) FROM chat_messages WHERE wallet = %s AND created_at > %s",
                           (wallet, now - TEN_MIN)).fetchone()
    (here,) = conn.execute("SELECT count(*) FROM chat_messages WHERE ip_hash = %s AND created_at > %s",
                           (ip_hash, now - TEN_MIN)).fetchone()
    if mine >= C["per_wallet_per_10min"] or here >= C["per_ip_per_10min"]:
        raise ChatError("You've sent a lot of messages. Try again in a few minutes.", 429)


def _json(mid, wallet, username, body, at, admin):
    return {"id": mid, "wallet": wallet, "username": username, "body": body, "at": at, "admin": wallet == admin}


def post(conn, wallet, body, ip, now=None):
    """Post a message. Returns it as the room shows it; raises ChatError."""
    now = now or datetime.now(timezone.utc)
    try:
        _require(conn, wallet, now)
        body = clean(body)
        ip_hash = ip_key(ip)
        # one post per wallet at a time, so a burst of parallel requests can't all pass the limits below
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"chat:{wallet}",))
        _slow_down(conn, wallet, body, ip_hash, now)
        (mid,) = conn.execute("""INSERT INTO chat_messages (wallet, body, ip_hash, created_at) VALUES (%s, %s, %s, %s)
                                 RETURNING id""", (wallet, body, ip_hash, now)).fetchone()
        conn.commit()
    except ChatError:
        conn.rollback()
        raise
    return _json(mid, wallet, profiles.get(conn, wallet)["username"], body, now, chain.fee_wallet())


def messages(conn, after=None, before=None, viewer=None, now=None):
    """A page of the room, oldest first: the latest page, or newer than `after` (polling), or older than
    `before` (scrolling back). With `after`, also the ids up to it hidden in the last few minutes. The admin
    also sees each message's report count, and messages hidden by reports, marked held, to restore."""
    now = now or datetime.now(timezone.utc)
    admin = chain.fee_wallet()
    is_admin = viewer is not None and viewer == admin
    shown = "(m.hidden_at IS NULL OR m.hidden_by = 'reports')" if is_admin else "m.hidden_at IS NULL"
    sql = f"""SELECT m.id, m.wallet, p.username, m.body, m.created_at, m.hidden_at IS NOT NULL FROM chat_messages m
              LEFT JOIN profiles p ON p.wallet = m.wallet WHERE {shown}"""
    if after is not None:
        rows = conn.execute(sql + " AND m.id > %s ORDER BY m.id LIMIT %s", (after, C["page"])).fetchall()
    else:
        cond = " AND m.id < %s" if before is not None else ""
        args = (before, C["page"]) if before is not None else (C["page"],)
        rows = conn.execute(sql + cond + " ORDER BY m.id DESC LIMIT %s", args).fetchall()[::-1]
    out = []
    for *fields, held in rows:
        m = _json(*fields, admin)
        if is_admin:
            m["held"] = held
        out.append(m)
    if is_admin and out:
        counts = dict(conn.execute("SELECT message_id, count(*) FROM chat_reports WHERE message_id = ANY(%s) "
                                   "GROUP BY message_id", ([m["id"] for m in out],)).fetchall())
        for m in out:
            m["reports"] = counts.get(m["id"], 0)
    hidden = []
    if after is not None:
        window = now - timedelta(minutes=C["hidden_window_minutes"])
        kept = " AND hidden_by <> 'reports'" if is_admin else ""
        hidden = [i for (i,) in conn.execute(f"""SELECT id FROM chat_messages WHERE hidden_at > %s AND id <= %s{kept}
                                                  ORDER BY id DESC LIMIT 500""", (window, after)).fetchall()]
    return {"messages": out, "hidden": hidden}


def _message(conn, message_id, lock=False):
    row = conn.execute("SELECT wallet, restored_at FROM chat_messages WHERE id = %s AND hidden_at IS NULL"
                       + (" FOR UPDATE" if lock else ""), (message_id,)).fetchone()
    if row is None:
        raise ChatError("That message is gone", 404)
    return row


def _hide(conn, message_id, by, now):
    conn.execute("UPDATE chat_messages SET hidden_at = %s, hidden_by = %s WHERE id = %s AND hidden_at IS NULL",
                 (now, by, message_id))


def hide(conn, wallet, message_id, now=None):
    """The author or the admin removes a message."""
    now = now or datetime.now(timezone.utc)
    author, _ = _message(conn, message_id)
    if wallet == chain.fee_wallet():
        _hide(conn, message_id, "admin", now)
    elif wallet == author:
        _hide(conn, message_id, "author", now)
    else:
        raise ChatError("You can only delete your own messages", 403)
    conn.commit()


def report(conn, wallet, message_id, now=None):
    """A player flags a message; enough different players hide it until the admin looks."""
    now = now or datetime.now(timezone.utc)
    try:
        _require(conn, wallet, now)
        author, restored = _message(conn, message_id, lock=True)   # reports on one message are counted one at a time
        if author == wallet:
            raise ChatError("You can't report your own message")
        if author == chain.fee_wallet():
            conn.rollback()
            return
        (lately,) = conn.execute("SELECT count(*) FROM chat_reports WHERE wallet = %s AND created_at > %s",
                                 (wallet, now - timedelta(hours=1))).fetchone()
        if lately >= C["reports_per_hour"]:
            raise ChatError("You've reported a lot of messages. Try again later.", 429)
    except ChatError:
        conn.rollback()
        raise
    conn.execute("""INSERT INTO chat_reports (message_id, wallet, created_at) VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING""", (message_id, wallet, now))
    (n,) = conn.execute("SELECT count(*) FROM chat_reports WHERE message_id = %s", (message_id,)).fetchone()
    if n >= C["reports_to_hide"] and restored is None:
        _hide(conn, message_id, "reports", now)
    conn.commit()


def _admin_only(admin):
    if admin != chain.fee_wallet():
        raise ChatError("Only the admin can do that", 403)


def restore(conn, admin, message_id, now=None):
    """The admin puts back a message that reports hid; further reports no longer hide it."""
    _admin_only(admin)
    done = conn.execute("""UPDATE chat_messages SET hidden_at = NULL, hidden_by = NULL, restored_at = %s
                           WHERE id = %s AND hidden_by = 'reports' RETURNING id""",
                        (now or datetime.now(timezone.utc), message_id)).fetchone()
    if done is None:
        conn.rollback()
        raise ChatError("That message isn't waiting for review", 404)
    conn.commit()


def moderate(conn, admin, target, action, now=None, hours=24):
    """The admin mutes (for `hours`), unmutes, bans or unbans a wallet. A ban hides all its messages."""
    now = now or datetime.now(timezone.utc)
    _admin_only(admin)
    if target == admin:
        raise ChatError("You can't do that to yourself")
    if profiles.get(conn, target) is None:
        raise ChatError("No player with that wallet", 404)
    if action == "mute":
        conn.execute("UPDATE profiles SET chat_muted_until = %s WHERE wallet = %s", (now + timedelta(hours=hours), target))
    elif action == "unmute":
        conn.execute("UPDATE profiles SET chat_muted_until = NULL WHERE wallet = %s", (target,))
    elif action == "ban":
        conn.execute("UPDATE profiles SET chat_banned = true WHERE wallet = %s", (target,))
        conn.execute("UPDATE chat_messages SET hidden_at = %s, hidden_by = 'ban' WHERE wallet = %s AND hidden_at IS NULL",
                     (now, target))
    elif action == "unban":
        conn.execute("UPDATE profiles SET chat_banned = false WHERE wallet = %s", (target,))
    else:
        raise ChatError("Unknown action")
    conn.commit()
