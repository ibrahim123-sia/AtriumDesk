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

The model only words facts the hard-rule check already established: which
requirements were checked and met, which were missed (gaps), and which the
profile can't answer yet (unverified). It is given only the fields that
matter, never the raw listing document, so it has nothing to embellish.
"""

import rag

_SYSTEM_PROMPT = (
    "You write a short, personalized note on whether a scholarship or job "
    "suits a specific student. A rule-based check has already decided the "
    "outcome; you only put its facts into words. Rules:\n"
    "- Only say the student meets a requirement if the student has that value "
    "and it is not listed under gaps.\n"
    "- Never state or guess a student value that is missing (null or empty).\n"
    "- For each gap, say how far short they are and what would close it, "
    "using the deadline if one is given.\n"
    "- If 'Not yet checkable' lists anything, say plainly that eligibility "
    "can't be confirmed until they add it to their profile.\n"
    "- For a job, only mention skills from the student's skills list as "
    "skills they have; name the missing skills listed.\n"
    "Write 2-3 plain sentences in second person ('you'). No headers, no "
    "lists, no greetings."
)

_LISTING_FIELDS = (
    "listingType", "title", "organization", "country", "degreeLevel", "fundingType",
    "cgpaRequirement", "ieltsRequirement", "toeflRequirement", "deadline",
    "eligibilityCriteria", "requiredDocuments", "workMode", "location",
    "experienceLevel", "skillsRequired", "isFreshGradFriendly",
)


def _listing_facts(listing):
    facts = {}
    for key in _LISTING_FIELDS:
        value = listing.get(key)
        if value in (None, "", []):
            continue
        if key == "eligibilityCriteria" and isinstance(value, str):
            value = value[:600]
        facts[key] = value
    return facts


def _profile_facts(profile, skills):
    facts = {k: v for k, v in (profile or {}).items() if v not in (None, "", [])}
    if skills is not None:
        facts["skills"] = skills
    return facts or "nothing filled in yet"


def explain_match(profile, listing, match_state, gaps, unverified=None, skills=None, skill_gaps=None):
    """profile/listing are plain dicts; match_state is 'eligible'|'near_miss';
    gaps/unverified come from evaluateHardRules; skills/skill_gaps are set for
    jobs only. Returns the explanation text, or raises on total LLM failure
    (caller degrades to no explanation rather than crashing the feed)."""
    lines = [
        f"Student profile: {_profile_facts(profile, skills)}",
        f"Listing: {_listing_facts(listing)}",
        f"Outcome: {match_state}",
        f"Gaps (requirement missed): {gaps or 'none'}",
        f"Not yet checkable (missing from the profile): {unverified or 'none'}",
    ]
    if skill_gaps is not None:
        lines.append(f"Required skills the student doesn't list: {skill_gaps or 'none'}")
    lines.append("Write the note.")
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    # Low reasoning: the outcome is already decided, this only words it — and
    # on a reasoning model the reasoning would otherwise eat the token budget.
    return rag._llm_chat(messages, temperature=0.2, max_tokens=400, reasoning_effort="low").strip()
