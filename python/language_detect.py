"""
language_detect.py — Detect English / Roman-Urdu / mixed for chat messages.

Why this exists:
  `langdetect` and similar libraries treat Roman-Urdu (Urdu typed using English
  letters, e.g. "fees kitni hai") as English because the alphabet is the same.
  Our chatbot must respond in the user's actual language, so we layer a small
  Roman-Urdu function-word lexicon on top of `langdetect` to catch this case.

Output:
  {
    "language": "en" | "roman_urdu" | "mixed" | "unknown",
    "confidence": float in [0, 1],
    "scores": {"en": float, "roman_urdu": float},
    "tokens": int,
    "matched_urdu_tokens": [str, ...],
  }
"""

from __future__ import annotations  # For modern type hinting/annotation parsing within older Python runtimes

import re             # For tokenizing query strings and regex patterns in language detection
from typing import Dict, List  # For type hinting of dicts and lists in class/function signatures

try:
    from langdetect import detect_langs, DetectorFactory  # The langdetect package to perform initial probabilistic language checks
    from langdetect.lang_detect_exception import LangDetectException  # Exceptions raised during langdetect failure cases
    DetectorFactory.seed = 0  # deterministic seed to avoid fluctuating predictions on short texts
    _LANGDETECT_OK = True
except ImportError:
    _LANGDETECT_OK = False



# ---------------------------------------------------------------------------
# Lexicons
# ---------------------------------------------------------------------------
# Function words / particles that are essentially exclusive to Roman Urdu.
# These are high-signal: if a sentence contains several of these, it's almost
# certainly Roman Urdu even if every other token also exists in English.

# NOTE: Homographs with common English words are deliberately excluded:
#   the (RU "they were"), to (RU "then/so"), main (RU "I"), at (RU N/A), be, on, in.
# We only keep tokens that are NOT plausible English words on their own.
ROMAN_URDU_FUNCTION_WORDS = {
    # Verbs / copulas
    "hai", "hain", "tha", "thi", "thay", "hoga", "hogi", "honge",
    "hota", "hoti", "hote", "hua", "hui", "huye", "huwa",
    # Bare/short forms: "ho" = 2nd-person "are" (e.g. "tm kon ho"),
    # "hu"/"hun"/"houn" = 1st-person "am". Risk of English collision
    # is low — "ho" as an English interjection is rare in chat.
    "ho", "hu", "hun", "houn", "hoo",
    "karna", "karta", "karti", "karte", "karo", "karenge", "karunga", "karoge",
    "kiya", "kiye", "kr", "krna", "krta", "krte",
    "jata", "jati", "jate", "jaye", "jaunga", "jaungi", "jana", "gaya", "gayi", "gaye",
    "ata", "ati", "ate", "aya", "ayi", "aye", "ana", "aana",
    "raha", "rahi", "rahe", "rehna", "rehta", "rehti", "rehte",
    # SMS-short forms — students drop vowels constantly ("horha" for ho raha,
    # "nh" for nahi, "rha" for raha). Without these, sentences that are
    # mostly Roman Urdu score zero because every RU word is vowel-dropped.
    "rha", "rhi", "rhe", "hora", "horha", "horaha", "hoorha", "hrha",
    "horahi", "horahe", "horhi", "horhe", "horhay",
    "diya", "diye", "dena", "deta", "deti", "dete",
    "liya", "lena", "leta", "leti", "lete",
    "sakta", "sakti", "sakte", "saktay", "sakey",
    "chahiye", "chahye", "chaiye", "chahta", "chahti", "chahte",
    "mila", "mili", "milay", "milega", "milegi",

    # Pronouns / determiners
    "mein", "hum", "tum", "aap", "woh", "yeh",
    # Common short / SMS-style spellings — Pakistani students very often
    # drop vowels in chat ("tm" for tum, "ap" for aap, "mjhe" for mujhe).
    # Adding these fixes detection of ultra-short queries like "tm kon ho".
    "tm", "ap", "tu", "tjhe", "tujhe", "tujh", "mujh", "mjhe", "mje", "mjh",
    "iska", "iski", "iske", "uska", "uski", "uske", "inka", "inki", "inke",
    "unka", "unki", "unke", "mera", "meri", "mere", "tera", "teri", "tere",
    "mra", "mri", "mre",  # SMS short forms of mera/meri/mere
    "humara", "humari", "humare", "tumhara", "tumhari", "tumhare",
    "apna", "apni", "apne", "khud",

    # Postpositions / particles
    "ka", "ki", "ke", "ko",
    "tak", "lia", "liye", "liey", "wala", "wali", "wale",
    "bhi", "toh", "phir", "fir", "abhi", "kab", "kahan", "kaha",
    "kyun", "kyon", "kiu", "kiun", "kese", "kaise", "kya", "kia", "kuch", "kuchh",
    "kon", "kaun", "kn",  # "who" — common in short queries like "tm kon ho"
    "nahi", "nahin", "nhi", "nh", "naa", "haan", "haa", "ji", "jee",
    "magar", "lekin", "agar", "jab", "warna", "kyunki", "kyonke",
    "bohat", "bahut", "bht", "thora", "thori", "thore", "zyada", "zayada",
    "acha", "achha", "acchi", "accha", "theek", "thik", "sahi", "ghalat",
    "bhai", "behen", "ammi", "abbu", "abba",

    # University-specific patterns we expect
    "kitna", "kitni", "kitne", "kahaan",
    "samajh", "samjha", "samjhi",
}

# Endings / suffixes that strongly suggest Roman Urdu when seen on multiple tokens.
# (Used as a softer secondary signal, not a definitive match.)
ROMAN_URDU_SUFFIXES = ("ein", "iye", "iya", "aya", "ana", "ega", "egi", "enge", "ungi", "unga")

# A handful of English stopwords — used to confirm "this really is English"
# in ambiguous short inputs.
ENGLISH_STOPWORDS = {
    "the", "is", "are", "was", "were", "am", "i", "you", "he", "she", "it",
    "we", "they", "this", "that", "these", "those", "and", "or", "but", "if",
    "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "be",
    "do", "does", "did", "have", "has", "had", "what", "when", "where",
    "which", "who", "whom", "why", "how", "a", "an", "my", "your", "their",
    "our", "his", "her", "its",
}


_TOKEN_RE = re.compile(r"[a-zA-Z]+")


def _tokenize(text: str) -> List[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text or "")]


def _score_roman_urdu(tokens: List[str]) -> Dict[str, float]:
    """Return urdu_score, en_score, and the matched tokens for explainability.

    The scoring is intentionally simple — counts of distinctive function words
    normalised by sentence length. This trumps `langdetect` whenever the
    Roman-Urdu signal is strong, regardless of how confident langdetect is.
    """
    if not tokens:
        return {"urdu": 0.0, "en": 0.0, "matched": []}

    urdu_hits = [t for t in tokens if t in ROMAN_URDU_FUNCTION_WORDS]
    en_hits = sum(1 for t in tokens if t in ENGLISH_STOPWORDS)

    # Suffix signal: only count if not already a direct lexicon hit.
    suffix_hits = sum(
        1 for t in tokens
        if t not in ROMAN_URDU_FUNCTION_WORDS and t.endswith(ROMAN_URDU_SUFFIXES) and len(t) >= 5
    )

    n = len(tokens)
    urdu_raw = len(urdu_hits) + 0.5 * suffix_hits
    return {
        "urdu": urdu_raw / n,
        "en": en_hits / n,
        "matched": urdu_hits,
    }


def detect_language(text: str) -> Dict:
    """Classify `text` as en / roman_urdu / mixed / unknown.

    Heuristic:
      - Tokenize ASCII letter runs.
      - Score Roman-Urdu function-word density.
      - Score English stopword density.
      - Use `langdetect` as a tiebreaker when both densities are weak.
      - "mixed" requires meaningful density on BOTH sides (not just 1 hit).
    """
    if not text or not text.strip():
        return {
            "language": "unknown",
            "confidence": 0.0,
            "scores": {"en": 0.0, "roman_urdu": 0.0},
            "tokens": 0,
            "matched_urdu_tokens": [],
        }

    tokens = _tokenize(text)
    if not tokens:
        # Non-Latin script. Check Unicode ranges first — langdetect is
        # unreliable on very short Urdu/Hindi inputs ("آپ کیسے ہیں" → throws).
        # Arabic-script range covers Urdu; Devanagari range covers Hindi.
        # Either way we want the LLM to reply in Roman Urdu, so we return
        # "ur" — `normalize_for_prompt("ur")` maps it to "roman_urdu".
        if re.search(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]", text):
            return {
                "language": "ur",
                "confidence": 0.95,
                "scores": {"en": 0.0, "roman_urdu": 1.0},
                "tokens": 0,
                "matched_urdu_tokens": [],
            }
        if re.search(r"[ऀ-ॿ]", text):
            return {
                "language": "hi",
                "confidence": 0.95,
                "scores": {"en": 0.0, "roman_urdu": 1.0},
                "tokens": 0,
                "matched_urdu_tokens": [],
            }
        # Fall back to langdetect for other non-Latin scripts.
        if _LANGDETECT_OK:
            try:
                top = detect_langs(text)[0]
                return {
                    "language": top.lang,
                    "confidence": float(top.prob),
                    "scores": {"en": 0.0, "roman_urdu": 0.0},
                    "tokens": 0,
                    "matched_urdu_tokens": [],
                }
            except LangDetectException:
                pass
        return {
            "language": "unknown",
            "confidence": 0.0,
            "scores": {"en": 0.0, "roman_urdu": 0.0},
            "tokens": 0,
            "matched_urdu_tokens": [],
        }

    scored = _score_roman_urdu(tokens)
    urdu = scored["urdu"]
    en = scored["en"]
    matched = sorted(set(scored["matched"]))

    # Decision rules. Tuned for short chat utterances (3-30 tokens).
    URDU_STRONG = 0.20   # >=20% of tokens are RU function words -> definitely RU
    URDU_WEAK = 0.08
    MIXED_BAND = 0.15

    if urdu >= URDU_STRONG and en < urdu:
        lang = "roman_urdu"
        conf = min(1.0, 0.5 + urdu)
    elif urdu >= URDU_WEAK and en >= MIXED_BAND:
        lang = "mixed"
        conf = min(1.0, 0.4 + (urdu + en) / 2)
    elif urdu >= URDU_WEAK:
        lang = "roman_urdu"
        conf = 0.5 + urdu / 2
    else:
        # If English stopwords are present, trust that signal over langdetect
        # (langdetect frequently misclassifies short English as nl/de/af).
        if en > 0:
            lang = "en"
            conf = min(1.0, 0.6 + en)
        elif _LANGDETECT_OK:
            try:
                top = detect_langs(text)[0]
                lang = top.lang  # "en", "fr", "es", ...
                conf = float(top.prob)
            except LangDetectException:
                lang = "en"
                conf = 0.3
        else:
            lang = "en"
            conf = 0.3

    return {
        "language": lang,
        "confidence": round(conf, 3),
        "scores": {"en": round(en, 3), "roman_urdu": round(urdu, 3)},
        "tokens": len(tokens),
        "matched_urdu_tokens": matched,
    }


def normalize_for_prompt(language: str) -> str:
    """Map any detector output to one of the three labels the LLM prompt uses.

    Actual Urdu script ("ur" from langdetect) is treated as Roman Urdu intent:
    the corpus is English so we can't reply in Urdu anyway, and we want to
    keep the conversation in the same language family the user picked. The
    LLM prompt's script-ban rules will keep the reply in Latin letters.
    """
    if language in ("roman_urdu", "mixed", "en"):
        return language
    if language in ("ur", "urdu", "hi", "hindi"):
        return "roman_urdu"
    return "en"
