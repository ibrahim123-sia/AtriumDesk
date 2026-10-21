"""The indexed keyword matcher must agree with `_has_word`, which it replaced
in the hot path (database._keyword_search), and rag's rate-limit wait parsing.

Run: python -m pytest test_keyword_search.py
"""
import database
from rag import _retry_after_seconds

TEXTS = [
    "Undergraduate Merit Scholarships: 85% marks in FA/FSc get a 100% fee waiver.",
    "The BS-CS programme has 134 credit-hours; evening classes start at 06:15.",
    "Admissions are open. Contact admissions@jinnah.edu for e-learning queries.",
    "Universities and courses: MS, PhD, post-graduate diplomas.",
]
TOKENS = ["scholarship", "scholarships", "programs", "program", "bscs", "credit", "hours", "admission",
          "elearning", "university", "course", "phd", "graduate", "postgraduate", "fee", "waiver", "missing"]


def test_indexed_match_agrees_with_has_word():
    for text in TEXTS:
        low = text.lower()
        words, stems = database._word_sets(low)
        for url in ("", "https://jinnah.edu/scholarships/", "https://jinnah.edu/bs-computer-science/"):
            url_tokens = database._url_tokens(url)
            for token in TOKENS:
                expected = database._has_word(token, low, url_tokens)
                got = database._indexed_match(token, database._stem(token), words, stems, url_tokens)
                assert got == expected, (token, text, url)


def test_retry_after_is_read_from_the_message():
    assert _retry_after_seconds(Exception("Rate limit reached. Please try again in 16.16s. Need more?")) == 16.16
    assert _retry_after_seconds(Exception("Please try again in 450ms.")) == 0.45
    assert _retry_after_seconds(Exception("Something else went wrong")) is None
