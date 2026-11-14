"""Sign in with a Solana wallet: the wallet signs a one-time message, we check the signature.

No passwords and no transactions. A valid signature gets a session token (HMAC-signed,
expires after web.session_hours). SESSION_SECRET must be set in production; without it a
random secret is used and sessions end when the API restarts.
"""

import base64
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import base58
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

from .config import CFG

WEB = CFG["web"]
_SECRET = (os.environ.get("SESSION_SECRET") or secrets.token_hex(32)).encode()


class AuthError(Exception):
    pass


def valid_wallet(wallet):
    try:
        return len(base58.b58decode(wallet)) == 32
    except ValueError:
        return False


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


STATEMENT = "Sign in to $ELEVN. This is free and does not move any tokens."


def new_sign_in(conn, origin=None, wallet=None, now=None):
    """Fields of a one-time Sign In With Solana request. The wallet builds the message from
    them and signs it in the same popup that connects it (one approval)."""
    origin = origin or f"https://{WEB['domain']}"
    if origin not in WEB["origins"]:
        raise AuthError("Sign-in is not allowed from this site")
    now = now or datetime.now(timezone.utc)
    expires = now + timedelta(minutes=WEB["nonce_minutes"])
    nonce = secrets.token_hex(12)
    conn.execute("DELETE FROM auth_nonces WHERE expires_at < %s", (now,))
    conn.execute("INSERT INTO auth_nonces (nonce, wallet, origin, expires_at) VALUES (%s, %s, %s, %s)",
                 (nonce, wallet, origin, expires))
    conn.commit()
    return {"domain": urlparse(origin).netloc, "statement": STATEMENT, "uri": origin, "version": "1",
            "nonce": nonce, "issuedAt": iso(now), "expirationTime": iso(expires)}


def new_message(conn, wallet, origin=None, now=None):
    """The same request as a ready-made message, for wallets that can only sign messages
    (they connect first, then sign: two approvals)."""
    if not valid_wallet(wallet):
        raise AuthError("Not a Solana wallet address")
    f = new_sign_in(conn, origin, wallet, now)
    return (f"{f['domain']} wants you to sign in with your Solana account:\n{wallet}\n\n{f['statement']}\n\n"
            f"URI: {f['uri']}\nVersion: 1\nNonce: {f['nonce']}\nIssued At: {f['issuedAt']}\n"
            f"Expiration Time: {f['expirationTime']}")


def parse(message):
    """(domain, address, {field: value}) of a Sign In With Solana message."""
    lines = message.split("\n")
    head = "wants you to sign in with your Solana account:"
    if len(lines) < 2 or not lines[0].endswith(" " + head):
        raise AuthError("Not a sign-in message")
    fields = dict(line.split(": ", 1) for line in lines[2:] if ": " in line)
    return lines[0][:-len(head) - 1], lines[1], fields


def verify(conn, wallet, message, signature, now=None):
    """Check a signed sign-in message (each nonce works once). The wallet may lay the message
    out itself, so its fields are checked rather than the exact text. Returns a session token."""
    now = now or datetime.now(timezone.utc)
    domain, address, fields = parse(message)
    row = conn.execute("DELETE FROM auth_nonces WHERE nonce = %s RETURNING wallet, origin, expires_at",
                       (fields.get("Nonce"),)).fetchone()
    conn.commit()
    if not row or row[2] < now:
        raise AuthError("Sign-in request expired or unknown. Try again.")
    expected_wallet, origin, _ = row
    if address != wallet or (expected_wallet and expected_wallet != wallet):
        raise AuthError("Sign-in message is for another wallet")
    if domain != urlparse(origin).netloc or fields.get("URI", origin) != origin:
        raise AuthError("Sign-in message is for another site")
    try:
        VerifyKey(base58.b58decode(wallet)).verify(message.encode(), base58.b58decode(signature))
    except (BadSignatureError, ValueError):
        raise AuthError("Signature does not match this wallet")
    return token_for(wallet, now)


def token_for(wallet, now=None):
    exp = int((now or datetime.now(timezone.utc)).timestamp()) + WEB["session_hours"] * 3600
    body = base64.urlsafe_b64encode(f"{wallet}|{exp}".encode()).decode().rstrip("=")
    sig = hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def wallet_from_token(token):
    """The wallet a session token belongs to, or None if it is forged or expired."""
    try:
        body, sig = token.split(".")
        if not hmac.compare_digest(sig, hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()):
            return None
        wallet, exp = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)).decode().split("|")
        return wallet if int(exp) > time.time() else None
    except (ValueError, UnicodeDecodeError):
        return None
