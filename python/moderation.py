"""
moderation.py — Bad-language detection for chat messages.

Scans English + Roman-Urdu profanity. Returns a structured result so the
caller can decide whether to short-circuit a response and notify admins.
"""

import re             # For compiling and executing regular expressions to detect profanity


# English profanity (kept terse; expand as we collect false-positive feedback)
ENGLISH_BAD_WORDS = {
    "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "asshole",
    "dick", "cunt", "motherfucker", "douchebag", "wanker", "twat", "prick",
    "slut", "whore", "retard", "faggot", "nigger", "nigga",
    "piss", "pussy", "cock", "jackass", "dumbass", "crap", "fag",
    "screw you", "stfu", "wtf",
}

# Roman-Urdu profanity and disrespectful wordlist.
ROMAN_URDU_BAD_WORDS = {
    # Direct slurs & vulgarities (including spelling variants)
    "madarchod", "madarchood", "madarchode", "madarchoday",
    "behnchod", "behenchod", "bhenchod", "bhencho", "bhenchood", "bhanchod", "bhanchood",
    "bsdk", "bhosdike", "bhosdi", "bhosdiwale", "bhosdiwalay", "bhosri", "bhosda", "bhosday",
    "lawda", "lauda", "lavda", "loda", "loday", "lodu",
    "lund", "lundtopi",
    "chutiya", "chutia", "chutiye", "chootia", "chutya", "chootya", "chutyay",
    "gandu", "gaandu", "gand", "gaand",
    "kutta", "kutte", "kuttay", "kutti", "kuttiya", "kutto",
    "suar", "suwar", "sooar", "soowar", "khinzir", "khinzeer", "khinzeere",
    "kanjar", "kanjr", "kanjri", "kanjriyon",
    "saala", "saale", "saalay", "saali",
    "randi", "rand", "randiyon", "ranndi",
    "tatti", "tatte", "tattay", "tatta",
    "jhaant", "jhant", "jhaatu", "jhatu",
    "phudi", "phuddi", "fudi", "fuddi", "choot",
    "dalla", "dallay", "dalay", "dalal",
    "bharwa", "bharway", "bhadwa", "bhadway",
    "gashti", "gashtee", "gasti", "gastie",
    "hijra", "hijray", "khusra", "khusray",

    # Culturally disrespectful words (Urdu/Pakistani university context)
    "laanti", "lanti", "lanat", "laanat",
    "bakwas", "bakwaas",
    "badtameez", "badtameezi", "badtamez",
    "jahil", "jaahil", "jahill",
    "kameena", "kameene", "kameenay", "kameeni",

    # Disrespectful pronouns & verbs flagged in this helpdesk context
    "marjao", "mar jao",
    "tera", "teri", "tere",

    # Combos and phrases
    "teri maa", "teri behan", "teri bhen", "behan ki", "bhen ki", "bhenyak", "bhen yak", "penyak", "pen yak",
    "ullu ka patha", "ullu ka pattha", "ullu k pathe", "ullu ke pathe",
    "lanat ho", "lanti ho", "bhag yahan se", "bhaag yahan se", "bhago yahan se"
}

# Compile a single regex once. We allow non-word chars between letters so
# users can't bypass with "f.u.c.k" — but keep this conservative to limit
# false positives on short common words.
def _build_pattern(words):
    parts = [re.escape(w) for w in sorted(words, key=len, reverse=True)]
    return re.compile(r"(?<![a-z0-9])(" + "|".join(parts) + r")(?![a-z0-9])", re.IGNORECASE)


_EN_RE = _build_pattern(ENGLISH_BAD_WORDS)
_UR_RE = _build_pattern(ROMAN_URDU_BAD_WORDS)


def check_message(text: str) -> dict:
    """
    Scan `text` for profanity in English and Roman-Urdu.

    Returns: {
      "flagged": bool,
      "matches": [str, ...],
      "language": "en" | "roman_urdu" | "mixed" | None,
    }
    """
    if not text:
        return {"flagged": False, "matches": [], "language": None}

    en_matches = [m.group(0).lower() for m in _EN_RE.finditer(text)]
    ur_matches_raw = list(_UR_RE.finditer(text))
    
    ur_matches = []
    for m in ur_matches_raw:
        word = m.group(0).lower()
        if word == "tera":
            # Check if this "tera" match is a false positive (technical or date context)
            start_idx = m.start()
            text_lower = text.lower()
            
            # Check if followed by "byte" or "data"
            following = text_lower[start_idx + 4:].strip()
            if following.startswith(("byte", "data")):
                continue
                
            # Check if preceded by digits (like "13") or date indicators
            preceding = text_lower[:start_idx].strip()
            if preceding.endswith(("13", "tarik", "tarikh", "tareekh", "date")):
                continue
                
            # Check if followed by month names or date indicators
            months = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "tarik", "tarikh", "tareekh", "date")
            if following.startswith(months):
                continue
                
        ur_matches.append(word)

    matches = sorted(set(en_matches + ur_matches))
    if not matches:
        return {"flagged": False, "matches": [], "language": None}

    if en_matches and ur_matches:
        lang = "mixed"
    elif ur_matches:
        lang = "roman_urdu"
    else:
        lang = "en"

    return {"flagged": True, "matches": matches, "language": lang}
