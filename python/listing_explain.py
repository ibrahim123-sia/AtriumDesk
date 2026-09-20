"""
========================================================
LISTING_EXPLAIN.PY - Layer 3: personalized match explanations (Rev 5 §8)
========================================================

Plain chat completion, not structured extraction, so this reuses rag.py's
existing `_llm_chat` (backend-agnostic: local Ollama or cloud Groq/Gemini
with the same failover already proven by /ask) directly rather than
reimplementing a client — unlike cv_parser.py, which needs Instructor's
`response_model=` and so keeps its own small client.

Node (server/services/matchExplanations.js) owns the cache — this module is
only ever called on a cache miss, so it's fine for this to be a plain
synchronous LLM call with no caching of its own.
"""

import rag

_SYSTEM_PROMPT = (
    "You write short, personalized explanations of why a scholarship or job "
    "listing is or isn't a good match for a specific student, based on a "
    "hard-rule eligibility check that has already been computed. Never "
    "invent eligibility criteria or student details beyond what is given. "
    "Write 2-3 plain sentences, second person ('you'), no headers or lists."
)


def explain_match(profile, listing, match_state, gaps):
    """profile/listing are plain dicts (already-serialized Mongoose
    documents); match_state is 'eligible'|'near_miss'; gaps is the list from
    evaluateHardRules. Returns the explanation text, or raises on total LLM
    failure (caller degrades to no explanation rather than crashing the
    matched feed)."""
    user_prompt = (
        f"Student profile: {profile}\n\n"
        f"Listing: {listing}\n\n"
        f"Match state: {match_state}\n"
        f"Gaps (if any): {gaps}\n\n"
        "Explain why this is a good match, or a near-miss and what would "
        "close the gap."
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    return rag._llm_chat(messages, temperature=0.3, max_tokens=200).strip()
