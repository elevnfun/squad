"""Word, link and lookalike checks shared by usernames (squad/profiles.py) and the chat (squad/chat.py).

A short list, not a perfect filter: it stops the obvious slurs, abuse and scam links. What gets past it,
players report and the admin removes. Letters disguised as digits or symbols (sh1t, @ss) are read as
letters first. The worst words count at the start of any word; the rest only as whole words, so football
names like Dickson, Fagioli, Nazionale or the Wankdorf stay fine.
"""

import re
import unicodedata

_LEET = str.maketrans("013457@$!", "oieastasi")

# refused at the start of any word in chat, and anywhere inside a username (no ordinary name contains these)
_ALWAYS = ("nigger", "nigga", "faggot", "kike", "tranny", "retard", "hitler", "paedo", "pedophile",
           "fuck", "shit", "cunt", "bitch", "whore", "twat", "asshole", "porn")
# refused only as a whole word (with a plural or possessive s): as parts of words they hit real names
_WHOLE = ("nazi", "wank", "wanker", "slut", "dick", "cock", "pussy", "rape", "rapist", "spic", "chink", "fag",
          "pedo", "bastard")
_ALLOWED = ("scunthorpe",)

# links: any web address, a bare domain ending in a common or scam-favoured ending, written with a dot,
# a lookalike dot or the word "dot", and the usual short-link and invite hosts by name
_TLDS = ("com|net|org|io|xyz|fun|gg|app|co|me|ly|link|site|online|top|sol|finance|money|club|info|biz|ru|to|cc|"
         "tv|dev|ai|live|pro|vip|win|bet|click|gift|claim|shop|store|zip|tk|ml|ga|cf|sh|ws|so|cx|lol|icu|cyou|"
         "buzz|rest|bond|sbs|world|today|network|exchange|airdrop|wallet|cash|uk|us|eu|de|fr|es|it|nl|in|cn")
# (no spaces around a real dot: "Spurs. It was" ends a sentence, it isn't a link to spurs.it)
_LINK = re.compile(rf"(https?:|www\.|\b[a-z0-9-]+(\.|\s?\bdot\b\s?)({_TLDS})\b|\b(t\.me|bit\.ly|discord\.gg|discord\.com)\b)",
                   re.IGNORECASE)
_DOTS = str.maketrans({"。": ".", "．": ".", "｡": ".", "․": ".", "·": "."})


def _words(text):
    plain = text.lower().translate(_LEET)
    return [w for w in re.findall(r"[a-z]+", plain) if w not in _ALLOWED]


def offensive_text(text):
    """True when a word in the text starts with one of the worst words, or is one of the others."""
    for w in _words(text):
        if any(w.startswith(bad) for bad in _ALWAYS) or w.rstrip("s") in _WHOLE or w in _WHOLE:
            return True
    return False


def offensive_name(name):
    """Usernames run words together (fuckface), so the worst words count anywhere in them."""
    joined = "".join(_words(name))
    return any(bad in joined for bad in _ALWAYS) or offensive_text(re.sub(r"[_0-9]", " ", name))


def has_link(text):
    return bool(_LINK.search(unicodedata.normalize("NFKC", text).translate(_DOTS)))


def skeleton(name):
    """A name folded so lookalikes match: Adm1n, 3levn, eIevn and el_evn all become the same as the real word."""
    return re.sub(r"[^a-z]", "", name.lower().translate(_LEET)).replace("i", "l")
