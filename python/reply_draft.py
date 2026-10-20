"""
========================================================
REPLY_DRAFT.PY - a first draft of a staff reply to a student's issue
========================================================

Department staff click "Draft a reply" on an issue; this retrieves the
university's own knowledge-base chunks for the issue and asks the model for
a reply the staff member reviews, edits and sends themselves — it is never
sent automatically.

Reuses rag.py's tenant collection, embedding model and `_llm_chat` (same
providers and failover as /ask), and only the knowledge-base text it
retrieves: anything the reply needs that isn't there (the student's own
records, a date the office hasn't published) becomes a [placeholder] for the
staff member to fill in, never an invented fact.
"""

import database
import rag

_SYSTEM_PROMPT = (
    "You draft replies for university staff answering a student's support "
    "request. The staff member will read and edit your draft before sending "
    "it. Rules:\n"
    "- Use facts only from the KNOWLEDGE BASE text. Never invent a fee, date, "
    "deadline, policy, room, phone number, email address or person's name.\n"
    "- Anything the reply needs that the knowledge base doesn't give — the "
    "student's own records, a decision, a date — goes in square brackets as "
    "a placeholder for the staff member, e.g. [new challan date].\n"
    "- Don't promise an outcome the staff member hasn't decided.\n"
    "- If the student must do something, say exactly what.\n"
    "- Address the student by first name, be warm and brief (under 150 "
    "words), plain text, no headings or markdown, and end with the staff "
    "member's name and department.\n"
    "- Never mention the knowledge base, sources, or that this is a draft."
)

_MAX_CONTEXT_CHARS = 6000


def _thread_text(thread):
    lines = []
    for entry in (thread or [])[-6:]:
        who = "Student" if entry.get("role") == "student" else "Staff"
        text = str(entry.get("message", "")).strip()
        if text:
            lines.append(f"{who}: {text[:800]}")
    return "\n".join(lines)


def draft_reply(tenant_slug, university_name, department_name, staff_name, student_name, title, description, thread=None):
    """Returns {"draft": str, "usage": dict|None}. Raises on a provider failure."""
    rag._initialize(tenant_slug)
    collection = rag._collections[tenant_slug]
    last_student = next(
        (str(e.get("message", "")) for e in reversed(thread or []) if e.get("role") == "student"),
        "",
    )
    query = f"{title}\n{description}\n{last_student}".strip()[:1200]
    chunks, _sources, _scores = database.search(question=query, collection=collection, model=rag._model, top_k=5)

    context, used = [], 0
    for i, chunk in enumerate(chunks, start=1):
        piece = f"[{i}] {chunk.strip()}"
        if used + len(piece) > _MAX_CONTEXT_CHARS:
            break
        context.append(piece)
        used += len(piece)

    first_name = (student_name or "").split(" ")[0] or "there"
    user_prompt = (
        f"UNIVERSITY: {university_name or 'the university'}\n"
        f"DEPARTMENT: {department_name or 'the department'}\n"
        f"STAFF MEMBER: {staff_name or 'Staff'}\n"
        f"STUDENT FIRST NAME: {first_name}\n\n"
        f"ISSUE TITLE: {title}\n"
        f"ISSUE DESCRIPTION:\n{description[:2000]}\n\n"
        f"CONVERSATION SO FAR:\n{_thread_text(thread) or '(no replies yet)'}\n\n"
        f"KNOWLEDGE BASE:\n{chr(10).join(context) or '(nothing relevant found)'}\n\n"
        "Write the staff member's reply to the student's latest message."
    )
    text = rag._llm_chat(
        [{"role": "system", "content": _SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}],
        temperature=0.3,
        max_tokens=700,
        reasoning_effort="low",
    )
    return {"draft": (text or "").strip(), "usage": rag.get_last_usage()}
