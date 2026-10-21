"""
Unit tests for listing_scraper._hash_content — the hash-based change
detection at the core of Rev5 §9.2's "only create a new pending Listing if
the scraped content actually changed since last run." No mocking needed
(pure function, no network/DB), one of the spec's 4 "cheapest to test,
most valuable to prove correct" targets (§13.2) — the other 3 (hard-rule
matching, CGPA conversion, SSRF validator) already have Node-side tests
under server/test/.

Run: pytest test_listing_scraper.py -v
"""

from listing_scraper import _hash_content


def test_same_content_produces_same_hash():
    text = "Scholarship deadline: 15 January 2027. Award: $5000."
    assert _hash_content(text) == _hash_content(text)


def test_different_content_produces_different_hash():
    original = "Scholarship deadline: 15 January 2027."
    changed = "Scholarship deadline: 20 January 2027."
    assert _hash_content(original) != _hash_content(changed)


def test_hash_is_sensitive_to_any_change_no_normalization():
    # This is a literal content hash — even whitespace-only differences
    # must change it, otherwise a real (if small) content change would be
    # silently missed by the "did this page change since last run" check.
    assert _hash_content("Deadline: 15 January") != _hash_content("Deadline:  15 January")
    assert _hash_content("Deadline: 15 January") != _hash_content("Deadline: 15 January ")


def test_hash_is_a_valid_sha256_hex_digest():
    digest = _hash_content("some page content")
    assert len(digest) == 64
    assert all(c in "0123456789abcdef" for c in digest)


def test_empty_string_hashes_consistently():
    assert _hash_content("") == _hash_content("")
    assert len(_hash_content("")) == 64
