"""
========================================================
RAG.PY - Retrieval-Augmented Generation Pipeline
========================================================

Pipeline:
  Question -> Vector Search -> Relevant Chunks -> LLM Prompt -> Answer

LLM backend is selected by `config.USE_LOCAL_LLM`:
  true  -> local Ollama daemon (default)
  false -> Groq cloud API (requires GROQ_API_KEY)
"""

import re             # For regular expression operations in source matching and text cleanup
import threading      # thread-local usage tracking — /ask runs in Starlette's threadpool, real OS threads, not just async coroutines

import ollama         # The Ollama library for local LLM inference

import config         # Local application configuration and credentials settings
import database       # ChromaDB retrieval helper functions



# =============================================================
# PROMPT CREATION
# =============================================================

# English-only product — see LANGUAGE_INSTRUCTION's prior Roman-Urdu/mixed
# branches (removed) in git history if multi-language support is ever
# revisited. Kept as a short in-prompt reminder, same role the old
# per-language dict lookup served.
LANGUAGE_INSTRUCTION = "Respond in clear, natural English."
_LANGUAGE_HINT = "Reply in clear, natural English."

# Guidance phrase inside the prompt AND the no-chunks return value in `ask`.
NO_INFO_FALLBACK = "I don't have information about that in my database."

# Distinct from NO_INFO_FALLBACK above — that means "the knowledge base
# doesn't have this," which is a real answer. This means "the LLM provider
# itself is down," a temporary outage, so it gets its own message rather
# than reusing NO_INFO_FALLBACK (which would misleadingly suggest the KB was
# searched and came up empty) or leaking the raw provider exception text
# (which used to happen and could expose upstream HTTP bodies/stack details
# to the chat UI) — see LLMUnavailableError below.
LLM_UNAVAILABLE_MESSAGE = "I'm having trouble reaching my AI service right now. Please try again in a few minutes, or file a query with your department."


class LLMUnavailableError(Exception):
    """Raised by get_llm_response when every configured LLM provider (or
    the only one, when USE_LOCAL_LLM) fails. Callers must NOT surface
    str(exc) to the end user — it can contain upstream HTTP response bodies
    or internal exception text — only log it server-side."""


# Generic fallback when a caller doesn't supply tenant branding — kept
# neutral (not a specific pilot university's name) so a misconfigured
# request never silently identifies itself as the wrong school.
DEFAULT_UNIVERSITY_NAME = "your university"
DEFAULT_UNIVERSITY_SHORT = "the university"

# Rev 5 §8's three-tier retrieval confidence, computed in `ask()` from the
# top merged-search score (semantic + keyword) and surfaced through
# AnswerResponse for §4.2's chatbot-handoff tiering. These are the platform
# defaults — every tenant starts here, but a tenant with an unusually large
# or noisy knowledge base may need different tuning to hit the same answer
# quality, so `ask()` accepts a `rag_config` override (Tenant.ragConfig,
# admin-settable) that falls back to these constants when absent.
CONFIDENCE_HIGH_THRESHOLD = 0.55
CONFIDENCE_LOW_THRESHOLD = 0.35


def compute_confidence_tier(top_score, high_threshold=CONFIDENCE_HIGH_THRESHOLD, low_threshold=CONFIDENCE_LOW_THRESHOLD):
    """Maps a merged search score to high/medium/low. `top_score` is None or
    0 when no chunks were retrieved at all, which is always low."""
    if not top_score:
        return "low"
    if top_score >= high_threshold:
        return "high"
    if top_score >= low_threshold:
        return "medium"
    return "low"


def create_prompt(
    question,
    relevant_chunks,
    chunk_sources=None,
    user_type="guest",
    confidence_tier="high",
    university_name=None,
    university_short=None,
):
    """Build the RAG prompt around six answer-states (Rev 5 §8.7.6).

    The prompt is organized around what *kind* of question the student
    is asking rather than a flat rule list, because the model
    handles "pick one state" much better than "weigh nine rules". The
    six states are:

      A) greeting / small-talk           -> warm reply, ignore context
      B) identity question               -> "I'm {UNIVERSITY_SHORT} Assistant"
      C) meta / conversation question    -> trust chat history, ignore context
      D) out of scope                    -> polite decline + redirect (widened scope, §8.7.1)
      E) in-scope question                -> answer from context, tiered by confidence
      F) draft / compose request         -> write it, reuse facts from history

    `user_type` is "guest" or "student" (§8.7's new USER_TYPE variable) —
    narrows scope and changes the personal-issue routing in Branch D/E.
    `confidence_tier` is "high" | "medium" | "low", from `ask()`'s merged
    search score — Branch E's only use of it is deciding whether to ask a
    clarifying question at the medium tier (§8.7.4); it never gates whether
    an answer is attempted at all, since that still depends on what's
    actually in the retrieved context.
    """
    uni_name = university_name or DEFAULT_UNIVERSITY_NAME
    uni_short = university_short or DEFAULT_UNIVERSITY_SHORT

    sources = chunk_sources or [{}] * len(relevant_chunks)
    blocks = []
    for i, (chunk, meta) in enumerate(zip(relevant_chunks, sources)):
        source_label = (meta or {}).get("source") or "unknown"
        blocks.append(f"[{i + 1} | source: {source_label} | updated: unknown]\n{chunk}")
    context = "\n\n---\n\n".join(blocks)
    lang_hint = _LANGUAGE_HINT
    no_info = NO_INFO_FALLBACK

    prompt = f"""CONTEXT FROM {uni_name.upper()} SOURCES (applies to the current question only — earlier turns are in the chat history above):
{context}

CURRENT QUESTION: {question}
USER TYPE: {user_type}
RETRIEVAL CONFIDENCE: {confidence_tier}

HOW TO ANSWER — first decide which type of question this is, then follow that branch:

A) GREETING or SMALL-TALK ("hi", "salam", "aoa", "thanks", "how are you"):
   Respond warmly in 1-2 sentences as {uni_short} Assistant and invite them to ask a question. Ignore the context above.

B) IDENTITY QUESTION ("who are you", "what model are you", "are you ChatGPT/Gemini/AI"):
   Say you are {uni_short} Assistant — the virtual helpdesk for {uni_name}. Do NOT name any AI model, company, or technology. 1-2 sentences.

C) META / CONVERSATION QUESTION about THIS chat itself — examples:
   - "what did I just ask?"
   - "do you remember my last question?"
   - "which program / topic are you discussing?"
   - "summarize our chat"
   - "tell me more"
   - "explain that again"
   - "translate your last reply"
   For ANY of these, answer using the chat history above (the prior user/assistant turns). IGNORE the CONTEXT block — the retrieval may have pulled unrelated chunks; trust the conversation history instead. If there is no prior conversation, say so warmly.

D) OUT OF SCOPE:
   IN SCOPE: {uni_name} information (admissions, fees, programs, courses, faculty, schedules, campus, contact, policies) AND scholarships, jobs, and events held in this system.
   OUT OF SCOPE: general world knowledge, coding help, math, weather, opinions, and other universities' admissions processes that are not part of a stored scholarship record.
   IF USER TYPE IS guest: narrower scope — {uni_name} information, internal scholarships, campus events, and programs only. Jobs and external scholarships are out of scope for guests.
   For out-of-scope questions, decline politely and steer back to {uni_short} topics in 1-2 sentences. Do not answer from your own knowledge.

E) IN-SCOPE QUESTION:
   - FIRST, check if this is a personal issue or complaint about the student's own account/records (registry error, payment problem, portal problem, wrong grade/CGPA showing, etc.) — this check comes BEFORE anything else in this branch, and applies REGARDLESS of whether the context happens to contain a relevant chunk, because a personal account problem is never described in general knowledge-base content:
     IF USER TYPE IS student -> tell them they can register an official ticket in the student portal under the relevant department (SFC, HOD, or IT). Do NOT reply with "{no_info}" for this case.
     IF USER TYPE IS guest -> they have no portal account. Give the admissions office contact instead. Never tell a guest to log in or file a ticket, and never reply with "{no_info}" for this case.
   - For follow-ups like "and its fee?", "or fee?", "what about for BSCS?", "tell me more" — first resolve pronouns and missing subjects using the chat history above (e.g. if the prior turn was about BSCS, "or fee?" means "BSCS fee"). Then answer using BOTH the CONTEXT and the topic from history.
   - If the CONTEXT looks unrelated to the topic the user is following up on, DO NOT switch topic — say what the context covers about the requested topic, or say you don't have details for that specific one.
   - Facts come from the CONTEXT. A fact you stated earlier IS reusable — but ONLY if it originally came from retrieved context (not something you invented in an earlier turn). If you cannot tell where an earlier figure came from, treat it as unverified: repeat it with "as mentioned earlier, though please confirm with the office" rather than asserting it as fact.
   - NEVER produce a new fee, deadline, email, phone number, course, faculty name, or policy that appears in neither the context nor the chat history.
   - Default assumption: numbers from different chunks describe different things and are BOTH correct, not a conflict — e.g. a flat per-program fee and a separate per-credit-hour rate are two different fee structures that coexist; a scholarship's amount and a program's tuition are unrelated figures. Present all such numbers together as complementary information, exactly like the CONSISTENCY behavior already expects.
   - Only call it a genuine conflict in the narrow case where two chunks state the SAME named fact (identical field, e.g. "the BSCS admission deadline") with two different values. Even then, prefer the chunk with the more recent "updated" date, and only say "sources differ, please confirm with the office" if neither is dated. Do not invent a conflict between numbers that are plausibly two different things.
   - Full answer in context -> answer directly.
   - Partial answer -> give what's covered, briefly note what's missing. Do not refuse over one missing detail.
   - No specific answer but a relevant office contact (email, phone, or office location) is present -> share the contact rather than falling back to "{no_info}".
   - IF USER TYPE IS guest (and this is not a personal-issue question), orient the answer to someone deciding whether to apply here — same warmth, but they are evaluating the university, not operating inside it. Do not assume enrolment, a student ID, or portal access.
   - If RETRIEVAL CONFIDENCE is medium AND the context contains two or more genuinely different candidate answers to the question (e.g. multiple distinct deadlines, multiple fee amounts for different programs), ask ONE specific clarifying question naming those exact candidates — e.g. "Do you mean the fee submission deadline or the course registration deadline?" Do not ask a vague "can you be more specific?", and do not offer to escalate at this tier. This clarifying-question behavior does NOT apply when the context simply has nothing relevant to the question at all — a medium confidence score with zero actual candidates in context is the SAME as low confidence for this purpose: it still means answer if you can, or reply with "{no_info}" if you cannot. Never invent a plausible-sounding clarifying question just because the tier says medium — only ask one when the context genuinely gives you multiple real candidates to choose between.
   - If neither the context nor the chat history can answer, reply exactly with: {no_info}

F) DRAFT / COMPOSE / WRITE request ("draft an email", "write a leave application", "email likh do", "compose a message", "draft it", "I said draft it", "likh ke do"):
   - The student wants you to actually WRITE the content, not just explain how. Produce the finished piece.
   - For an email, write a complete email: a salutation, a clear body covering the student's stated purpose (reason, dates, etc.), and a polite closing.
   - Resolve the recipient and their address from the chat history or context — e.g. if a name/email was already given earlier in the conversation, reuse it. If neither supplies one, use [recipient name] and [recipient email] as placeholders. Never supply a name or address from your own knowledge.
   - Only include details the student actually gave or that are in context/history; for genuinely unknown specifics (exact dates, student name/ID) leave a short clear placeholder like [your name] or [dates] rather than inventing them.
   - Do not refuse a drafting request for missing minor details — draft it with placeholders and the student can fill them in.

ALWAYS (applies to every branch):
- {lang_hint}
- Formatting: Bold (**email addresses**, **phone numbers**, **fee figures**, and **deadlines/dates**) so they stand out clearly.
- Keep the language natural and student-friendly, not overly formal.
- Quote fees, dates, emails, phone numbers, and other facts EXACTLY as they appear in the context.
- Start with the answer directly. No "Sure!", "Of course!", "Here is", "Based on the context", or sign-offs.
- Never mention sources, source numbers, "[1]", "[2]", or add a "Sources:" / "References:" section.
- Tone: warm, helpful, and professional — like a friendly student services officer. Be concise; use bullet lists only when the answer is genuinely a list (programs, requirements, steps).

ANSWER:"""

    return prompt


# =============================================================
# LLM INTEGRATION (Ollama local / Groq cloud)
# =============================================================

_ollama_client = None
_groq_clients = {}  # api_key -> Groq client, so each key keeps its own connection

# Super Admin Usage tab — token/request accounting for the LLM call the
# CURRENT /ask request made (or None if it was a cache hit / never got that
# far). Thread-local rather than returned from _llm_chat itself, because
# _llm_chat's plain-string return is also called from other modules
# (listing_explain.py etc.) that would break if the signature changed.
# Must be thread-local, not a plain module global: api.py's /ask handler is
# a sync `def`, which Starlette runs in its threadpool — concurrent
# requests are REAL OS threads, not single-threaded async interleaving, so
# a shared global would let one request's usage clobber another's between
# the LLM call returning and api.py reading it.
_usage_local = threading.local()


def get_last_usage():
    return getattr(_usage_local, "value", None)


def _set_last_usage(usage):
    _usage_local.value = usage


def _get_ollama_client():
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = ollama.Client(host=config.OLLAMA_HOST, timeout=config.LLM_REQUEST_TIMEOUT)
    return _ollama_client


def _get_groq_client(api_key):
    """Return a cached Groq client for the given API key (one per key)."""
    client = _groq_clients.get(api_key)
    if client is None:
        from groq import Groq  # Groq client SDK for calling Groq cloud LLM API, imported lazily so local-only installs don't need the dependency

        client = Groq(api_key=api_key, timeout=config.LLM_REQUEST_TIMEOUT)
        _groq_clients[api_key] = client
    return client


def _is_rate_limit_error(exc):
    """Heuristic: did this Groq error come from hitting a rate / quota limit?

    We match on the SDK's status_code (429) when present, otherwise on the
    message text. Used only for logging clarity — the failover tries the next
    key on ANY error so a dead/expired key also rolls over.
    """
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status == 429:
        return True
    msg = str(exc).lower()
    return any(s in msg for s in ("rate limit", "rate_limit", "429", "quota", "too many requests"))


def _llm_chat_gemini(messages, temperature):
    """Call Google Gemini OpenAI-compatible API via standard requests.
    Omit max_tokens to prevent the OpenAI proxy from truncating output.
    """
    if not config.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured in environment.")
    
    import requests    # Standard library for sending HTTP requests to the Gemini API endpoint

    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.GEMINI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": config.GEMINI_MODEL,
        "messages": messages,
        "temperature": temperature
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=config.LLM_REQUEST_TIMEOUT)
    if response.status_code == 200:
        res_json = response.json()
        try:
            content = res_json["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Unexpected response structure from Gemini API: {res_json}") from e
        usage = res_json.get("usage") or {}
        _set_last_usage({
            "provider": "gemini",
            "model": config.GEMINI_MODEL,
            "promptTokens": usage.get("prompt_tokens", 0),
            "completionTokens": usage.get("completion_tokens", 0),
            "totalTokens": usage.get("total_tokens", 0),
        })
        return content
    else:
        raise RuntimeError(f"Gemini API returned status {response.status_code}: {response.text}")


def _llm_chat_groq(messages, temperature, max_tokens):
    """Call Groq, rolling over to the next API key when one is exhausted.

    `config.GROQ_API_KEYS` holds the keys in priority order (primary first,
    then keys from secondary accounts). We try them in turn: on a rate-limit
    (HTTP 429) — or any other failure — we move to the next key. Only when
    every key has failed do we raise, so the caller can fail over to the next
    provider in CLOUD_LLM_ORDER.
    """
    keys = config.GROQ_API_KEYS
    if not keys:
        raise RuntimeError(
            "USE_LOCAL_LLM=false and Groq selected, but no GROQ_API_KEY is set. "
            "Add GROQ_API_KEY (and optionally GROQ_API_KEY_2) to python/.env."
        )

    errors = []
    for idx, api_key in enumerate(keys):
        try:
            client = _get_groq_client(api_key)
            response = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if idx > 0:
                print(f"  Groq answered on key #{idx + 1} (primary key was unavailable).")
            content = (response.choices[0].message.content or "") if response.choices else ""
            usage = getattr(response, "usage", None)
            _set_last_usage({
                "provider": "groq",
                "model": config.GROQ_MODEL,
                "promptTokens": getattr(usage, "prompt_tokens", 0) or 0,
                "completionTokens": getattr(usage, "completion_tokens", 0) or 0,
                "totalTokens": getattr(usage, "total_tokens", 0) or 0,
            })
            return content
        except Exception as exc:
            reason = "rate-limited" if _is_rate_limit_error(exc) else "failed"
            errors.append(f"key#{idx + 1}: {exc}")
            if idx < len(keys) - 1:
                print(f"  Groq key #{idx + 1} {reason}; rolling over to key #{idx + 2}...")
                continue
            # Last key — give up so the caller can try the next provider.
            raise RuntimeError(
                f"All {len(keys)} Groq key(s) failed. Errors: {'; '.join(errors)}"
            ) from exc


def _llm_chat(messages, temperature, max_tokens):
    """Backend-agnostic chat call. Returns the assistant text or raises.

    Routes to local Ollama or cloud models based on `config.USE_LOCAL_LLM`.
    If USE_LOCAL_LLM is false, attempts to query cloud models using the preferred order
    defined in `config.CLOUD_LLM_ORDER`, failing over to secondary options if a provider fails.
    """
    # Reset before every attempt — a request that ultimately fails (or a
    # retry that never reaches a provider) must not report a stale usage
    # figure left over from an earlier, unrelated request on this same
    # thread (threadpool threads are reused across requests).
    _set_last_usage(None)

    if config.USE_LOCAL_LLM:
        client = _get_ollama_client()
        response = client.chat(
            model=config.OLLAMA_MODEL,
            messages=messages,
            options={
                "temperature": temperature,
                "num_predict": max_tokens,
            },
            keep_alive=config.LLM_KEEP_ALIVE,
        )
        _set_last_usage({
            "provider": "ollama",
            "model": config.OLLAMA_MODEL,
            "promptTokens": response.get("prompt_eval_count", 0) or 0,
            "completionTokens": response.get("eval_count", 0) or 0,
            "totalTokens": (response.get("prompt_eval_count", 0) or 0) + (response.get("eval_count", 0) or 0),
        })
        return (response.get("message") or {}).get("content", "")

    errors = []
    for provider in config.CLOUD_LLM_ORDER:
        if provider == "gemini":
            try:
                print(f"  Attempting to call Gemini ({config.GEMINI_MODEL})...")
                return _llm_chat_gemini(messages, temperature)
            except Exception as exc:
                err_msg = f"Gemini call failed: {exc}"
                print(f"  Warning: {err_msg}")
                errors.append(err_msg)
        elif provider == "groq":
            try:
                print(f"  Attempting to call Groq ({config.GROQ_MODEL})...")
                return _llm_chat_groq(messages, temperature, max_tokens)
            except Exception as exc:
                err_msg = f"Groq call failed: {exc}"
                print(f"  Warning: {err_msg}")
                errors.append(err_msg)
        else:
            print(f"  Warning: Unknown provider '{provider}' in CLOUD_LLM_ORDER")

    raise RuntimeError(f"All configured cloud LLM providers failed. Errors: {'; '.join(errors)}")


def _sanitize_history(history):
    """Coerce a history payload into the [{role, content}, ...] shape Ollama
    expects. Drops anything that isn't a user/assistant turn or that lacks
    string content. Caps at the most recent 6 messages as a safety net even
    if the caller forgot to trim — keeps the prompt small on a 3B model.
    """
    if not history:
        return []
    cleaned = []
    for msg in history:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        content = msg.get("content")
        if role not in ("user", "assistant"):
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        cleaned.append({"role": role, "content": content})
    return cleaned[-6:]


def get_llm_response(prompt, history=None, university_name=None, university_short=None):
    """Send a prompt to the configured LLM backend and return the assistant text.

    `history` (optional): prior turns of the conversation as
    [{"role": "user"|"assistant", "content": str}, ...], oldest first.
    They are inserted between the system message and the current RAG
    prompt so the model can resolve follow-ups ("and its fee?") without
    re-explaining context. The RAG prompt itself still gets fresh
    retrieved chunks for THIS question — retrieval is not history-aware.

    `university_name`/`university_short` brand the assistant's system-level
    identity per tenant — without this a second tenant's bot would still
    introduce itself under another tenant's name (create_prompt was
    parametrized but the system message wasn't).
    """
    uni_name = university_name or DEFAULT_UNIVERSITY_NAME
    uni_short = university_short or DEFAULT_UNIVERSITY_SHORT
    system_msg = (
        f"You are {uni_short} Assistant — the official virtual helpdesk for "
        f"{uni_name}. You help current "
        "and prospective students with admissions, fees, programs, courses, "
        "faculty, schedules, contact details, and campus information, as "
        "well as scholarships, jobs, and events held in the university's own "
        "system (§8.7.1's widened scope — this must match the CONTEXT's own "
        "in-scope statement below, or you will wrongly decline questions "
        "about real scholarship/job/event records that are provided to you). "
        "You are warm, supportive, professional, and accurate — you never "
        "invent facts and never give citations or source references. "
        "You never reveal what AI model, company, or technology built you; "
        f"you are simply {uni_short} Assistant.\n\n"
        + LANGUAGE_INSTRUCTION
    )
    messages = [{"role": "system", "content": system_msg}]
    messages.extend(_sanitize_history(history))
    messages.append({"role": "user", "content": prompt})

    try:
        return _llm_chat(messages, config.LLM_TEMPERATURE, config.LLM_MAX_TOKENS)
    except ollama.ResponseError as exc:
        if "not found" in str(exc).lower():
            print(f"  LLM unavailable: model `{config.OLLAMA_MODEL}` is not installed in Ollama.")
        else:
            print(f"  LLM unavailable: Ollama error: {exc}")
        raise LLMUnavailableError(str(exc)) from exc
    except Exception as exc:
        if config.USE_LOCAL_LLM:
            print(f"  LLM unavailable: cannot reach Ollama at {config.OLLAMA_HOST}: {exc}")
        else:
            print(f"  LLM unavailable: all cloud LLM providers failed: {exc}")
        raise LLMUnavailableError(str(exc)) from exc


# Llama 3.2:3b reliably opens replies with one of these throat-clearing
# phrases despite a "no preamble" rule. Strip whichever one shows up at
# the very start (case-insensitive, optional trailing comma/colon/dash).
_PREAMBLE_PATTERNS = [
    r"sure[!,.\s]*",
    r"of course[!,.\s]*",
    r"certainly[!,.\s]*",
    r"absolutely[!,.\s]*",
    r"great question[!,.\s]*",
    r"here(?:'s| is)(?: the answer)?[:,\s\-]*",
    r"based on the (?:context|information|provided context|provided information)[:,\s\-]*",
    r"according to the (?:context|information|provided context)[:,\s\-]*",
    r"as (?:per|stated in) the (?:context|information)[:,\s\-]*",
    r"the answer (?:is|to your question is)[:,\s\-]*",
    # "It seems / sounds / looks like ..." sympathy preambles. We strip up
    # to the next comma or period, because these phrases usually paraphrase
    # the user's question before the actual answer ("It seems like you're
    # having trouble with X, ..." — drop everything up to that comma).
    r"it (?:seems|sounds|looks)(?: like)?[^,.\n]*[,.][\s\-]*",
    r"i (?:see|understand)(?: that)?[^,.\n]*[,.][\s\-]*",
    r"i (?:can|will) (?:help|try to help)[^,.\n]*[,.][\s\-]*",
    r"thanks? for (?:asking|your question)[!,.\s]*",
]
_PREAMBLE_RE = re.compile(
    r"^\s*(?:" + "|".join(_PREAMBLE_PATTERNS) + r")",
    re.IGNORECASE,
)


def clean_answer(answer):
    """Strip preambles, citation markers, and trailing 'Sources:' blocks."""
    if not answer:
        return ""
    answer = re.sub(r"\[\d+\]", "", answer)
    answer = re.sub(r"(?i)(sources?:.*?)(?=\n\n|\Z)", "", answer, flags=re.DOTALL)
    answer = re.sub(
        r"(?i)\n\n(?:📎\s*)?(?:source|references?):.*", "", answer, flags=re.DOTALL
    )
    # Strip up to two stacked preambles ("Sure! Based on the context, ...").
    for _ in range(2):
        new = _PREAMBLE_RE.sub("", answer, count=1)
        if new == answer:
            break
        answer = new
    answer = answer.strip()
    # Re-capitalize the first letter if a preamble strip left it lowercase.
    if answer and answer[0].islower():
        answer = answer[0].upper() + answer[1:]
    return answer


# =============================================================
# MAIN PIPELINE
# =============================================================

# The embedding MODEL is tenant-agnostic (every tenant uses the same
# all-MiniLM-L6-v2 in this phase) so it stays a single shared singleton, same
# as transcribe.py's Whisper model. The ChromaDB COLLECTION is tenant-specific
# data, so it cannot be — a bare `_collection = None` singleton would mean
# whichever tenant's first /ask happened to run first "wins" the collection
# for the life of the process, silently answering every other tenant against
# the wrong knowledge base (Rev7 §5.2/§5.4). Keyed by tenant_slug instead.
_collections = {}
_model = None


_llm_warmed = False


def _warm_llm():
    """Pre-load the local model into Ollama's RAM so the first real /ask is fast.

    Ollama lazy-loads weights on the first request to a model, which can take
    30-60s for a 3B on CPU. Calling once at boot trades startup time for
    predictable per-request latency. No-op when Groq is the backend (cloud
    models don't need warmup).
    """
    global _llm_warmed
    if _llm_warmed or not config.USE_LOCAL_LLM:
        return
    try:
        client = _get_ollama_client()
        client.chat(
            model=config.OLLAMA_MODEL,
            messages=[{"role": "user", "content": "ok"}],
            options={"num_predict": 1, "temperature": 0.0},
            keep_alive=config.LLM_KEEP_ALIVE,
        )
        _llm_warmed = True
        print(f"  LLM warmed: {config.OLLAMA_MODEL}")
    except Exception as exc:
        print(f"  LLM warmup skipped: {exc}")


def invalidate_collection_cache(tenant_slug):
    """Drop the cached collection handle for one tenant so the next request
    re-fetches it via _initialize().

    Needed because content_scrape_service.py's self-service re-scrape calls
    database.build_database(), which deletes and recreates the ChromaDB
    collection under the same name — the handle already sitting in
    _collections is left pointing at a deleted collection. Without this, any
    tenant that served one /ask before re-scraping would keep querying the
    stale handle until the process restarts.
    """
    _collections.pop(tenant_slug, None)


def _initialize(tenant_slug=None):
    global _model
    if tenant_slug not in _collections:
        print(f"Initializing RAG system for tenant '{tenant_slug}'...")
        client = database.get_chroma_client()
        collection_name = config.get_collection_name(tenant_slug)
        _collections[tenant_slug] = database.get_collection(client, collection_name)
        print(f"  Database loaded: {_collections[tenant_slug].count()} documents ({collection_name})")
    if _model is None:
        _model = database.get_embedding_model()
        print(f"  Embedding model loaded: {config.EMBEDDING_MODEL}")
    if config.USE_LOCAL_LLM:
        print(f"  LLM: {config.OLLAMA_MODEL} via Ollama @ {config.OLLAMA_HOST}")
    else:
        print(f"  LLM: Cloud LLM failover order: {', '.join(config.CLOUD_LLM_ORDER)}")
    _warm_llm()


# Markers that signal a question is an ELLIPTICAL follow-up — it leans on the
# previous turn for its subject ("or fee?", "what about BSCS?"). For these,
# and ONLY these, we prepend the prior user turn to the retrieval query. A
# self-contained question like "Admission requirements?" carries its own
# subject and must NOT be prepended, otherwise the previous turn's topic
# ("what programs...") dominates the embedding and buries the chunks that
# actually answer it.
_ELLIPTICAL_PREFIXES = (
    "or ", "and ", "also ", "plus ", "what about", "how about", "whatabout",
)
# Back-reference pronouns that, when present, mean the subject lives in history.
_BACKREF_WORDS = {
    "it", "its", "it's", "they", "them", "their", "this", "that", "these",
    "those", "one", "same",
}


def _is_elliptical_followup(question):
    """True if the question relies on the previous turn for its subject.

    Two signals: it opens with a connector ("or...", "aur...") OR it is short
    and contains only a back-reference pronoun as its noun ("its fee?",
    "uska deadline?"). A question that names its own topic noun
    ("admission requirements", "application deadlines") is self-contained
    and returns False.
    """
    q = (question or "").strip().lower()
    if not q:
        return False
    if q.startswith(_ELLIPTICAL_PREFIXES):
        return True
    words = re.findall(r"[a-z']+", q)
    # Short question whose only "subject-ish" words are back-references.
    if len(words) <= 4 and any(w in _BACKREF_WORDS for w in words):
        return True
    return False


def _build_retrieval_query(question, history):
    """For elliptical follow-ups, prepend the latest prior user turn so the
    retrieval embedding regains the subject that lives in the conversation.

    Why: "or fee" alone embeds to "fees in general" and retrieves the generic
    fee chunk. Prepending the prior user turn ("bscs admission") biases the
    embedding back toward the actual topic. But this is done ONLY for
    elliptical follow-ups — a self-contained question keeps its own subject,
    so prepending would only dilute it.

    Only the LATEST prior user message is added — older turns dilute the
    embedding without much benefit, and the prior assistant reply often
    contains too much off-topic detail to be useful here.
    """
    if not history or not _is_elliptical_followup(question):
        return question
    prior_user = None
    for msg in reversed(history):
        if not isinstance(msg, dict):
            continue
        if msg.get("role") == "user" and isinstance(msg.get("content"), str):
            prior_user = msg["content"].strip()
            break
    if not prior_user or prior_user.lower() == question.strip().lower():
        return question
    return f"{prior_user}\n{question}"


def _merge_search_results(result_sets, top_k):
    """Merge several (chunks, sources, scores) tuples into one ranked list.

    Dedup key is the first 120 chars of the chunk text (same convention as
    `database.search`). When a chunk appears in more than one result set we
    keep its HIGHEST score. Used to combine a standalone-question retrieval
    with the history-prepended one so neither view's relevant chunks are lost.
    """
    merged = {}
    for chunks, sources, scores in result_sets:
        for c, m, s in zip(chunks, sources, scores):
            key = (c or "")[:120]
            existing = merged.get(key)
            if existing is None or s > existing["score"]:
                merged[key] = {"text": c, "meta": m, "score": s}
    ranked = sorted(merged.values(), key=lambda r: r["score"], reverse=True)[:top_k]
    return (
        [r["text"] for r in ranked],
        [r["meta"] for r in ranked],
        [r["score"] for r in ranked],
    )


# §8 Layer 4 — RAG over the new content. The listings collection (Phase 8)
# uses true cosine similarity (hnsw:space=cosine), a different scale from
# the FAQ collection's `1 - L2 distance` above, so listing hits are NOT
# merged into the same ranked list — they're a separate, independently
# thresholded context section. Calibrate against real query/listing pairs
# if this under- or over-fires in practice.
LISTING_RELEVANCE_THRESHOLD = 0.30

# Separate, higher bar than the inclusion threshold above — used only to
# decide whether a listing hit is "confident" enough to upgrade a weak FAQ
# confidence_tier (see the upgrade in `ask()`). Reusing the 0.30 inclusion
# threshold for that upgrade meant ANY included hit — not actually a
# confident one — could silently upgrade "low" to "medium" and suppress
# §4.2's chatbot-handoff/"file a query" offer for a question the listings
# database only weakly matched.
LISTING_CONFIDENT_THRESHOLD = 0.55

_LISTING_TYPE_LABEL = {"scholarship": "SCHOLARSHIP", "job": "JOB", "event": "EVENT"}


def _format_listing_block(listing):
    """Structured record, not a prose chunk — §8 Layer 4's own rule: don't
    reuse the heading-chunking strategy for listings, since splitting one
    listing's fields across chunks could answer from an incomplete
    fragment. Every field that matters for a query like "which don't
    require IELTS" is on one line, backed by `_build_metadata`."""
    label = _LISTING_TYPE_LABEL.get(listing.get("listingType"), "LISTING")
    lines = [f"{label}: {listing.get('title', '')}", f"Organization: {listing.get('organization', '')}"]
    for key, prefix in (
        ("country", "Country"), ("degreeLevel", "Degree level"), ("fundingType", "Funding"),
        ("cgpaRequirement", "Minimum CGPA"), ("ieltsRequirement", "Minimum IELTS"), ("toeflRequirement", "Minimum TOEFL"),
        ("workMode", "Work mode"), ("location", "Location"), ("experienceLevel", "Experience level"),
        ("isFreshGradFriendly", "Fresh-grad friendly"), ("date", "Date"), ("deadline", "Deadline"),
    ):
        if key in listing:
            lines.append(f"{prefix}: {listing[key]}")
    if listing.get("officialLink"):
        lines.append(f"Link: {listing['officialLink']}")
    if listing.get("text"):
        lines.append(listing["text"])
    return "\n".join(lines)


def _retrieve_listing_context(tenant_slug, retrieval_query, user_type, relevance_threshold=LISTING_RELEVANCE_THRESHOLD):
    """Returns (chunks, sources, top_similarity) for listings above the
    relevance threshold, ready to append to the FAQ chunks/sources already
    built in `ask()`. `top_similarity` is the highest similarity among the
    included hits (0.0 if none) — the caller uses it against
    LISTING_CONFIDENT_THRESHOLD (or a tenant's own override) to decide
    whether to upgrade confidence_tier, which is a stricter bar than the
    inclusion threshold applied below.

    §8.7.6 Branch D: guests get a narrower scope — external scholarships
    and jobs are out of it, only campus events are in scope for them.
    """
    import listing_matching

    listing_types = ["event"] if user_type == "guest" else None
    try:
        hits = listing_matching.search_listings(tenant_slug, retrieval_query, listing_types=listing_types, top_k=5)
    except Exception as exc:
        print(f"  _retrieve_listing_context failed (degrading to no listing context): {exc}")
        return [], [], 0.0

    chunks, sources, top_similarity = [], [], 0.0
    for hit in hits:
        similarity = hit.get("similarity", 0)
        if similarity < relevance_threshold:
            continue
        chunks.append(_format_listing_block(hit))
        sources.append({"source": f"{_LISTING_TYPE_LABEL.get(hit.get('listingType'), 'Listing')} database"})
        top_similarity = max(top_similarity, similarity)
    return chunks, sources, top_similarity


def ask(
    question,
    tenant_slug=None,
    history=None,
    user_type="guest",
    university_name=None,
    university_short=None,
    rag_config=None,
):
    """Run the full RAG pipeline for a student question.

    `tenant_slug` selects which university's knowledge base to search —
    required for correct multi-tenant behavior; `None` falls back to the
    legacy single-tenant (MAJU) collection for any caller not yet updated.

    `history` (optional): prior chat turns as [{role, content}, ...] oldest
    first. Used for two things: (1) passed to the LLM so it can resolve
    follow-ups conversationally, and (2) the latest prior user turn is
    prepended to the retrieval query so follow-ups like "or fee" still
    pull topic-relevant chunks instead of generic ones.

    `user_type` ("guest" | "student") and `university_name`/`university_short`
    (tenant branding, falls back to the generic defaults if not supplied) feed
    the Rev 5 §8.7.6 prompt template.

    `rag_config` (optional dict): a tenant's own retrieval-tuning overrides
    (Tenant.ragConfig, admin-settable) — any of confidenceHigh, confidenceLow,
    topK, listingRelevance, listingConfident. Missing/absent keys fall back
    to this module's platform-default constants, so callers that don't pass
    it (or a tenant that hasn't set overrides) behave exactly as before.

    Returns a dict: {"answer": str, "confidence_tier": "high"|"medium"|"low"}.
    §4.2's chatbot-handoff tiering reads `confidence_tier`; the score it's
    computed from was previously thrown away (see `compute_confidence_tier`).
    """
    rag_config = rag_config or {}
    top_k = rag_config.get("topK") or config.TOP_K_RESULTS
    confidence_high = rag_config.get("confidenceHigh") or CONFIDENCE_HIGH_THRESHOLD
    confidence_low = rag_config.get("confidenceLow") or CONFIDENCE_LOW_THRESHOLD
    listing_relevance = rag_config.get("listingRelevance") or LISTING_RELEVANCE_THRESHOLD
    listing_confident = rag_config.get("listingConfident") or LISTING_CONFIDENT_THRESHOLD

    # Reset up front, not just inside _llm_chat — the `if not chunks` branch
    # below returns a canned answer without ever calling _llm_chat, and this
    # thread may have leftover usage from an earlier, unrelated request
    # (threadpool threads are reused). Without this, that early-return path
    # would report stale token counts instead of "no LLM call was made."
    _set_last_usage(None)
    _initialize(tenant_slug)
    collection = _collections[tenant_slug]

    # Retrieve for the standalone question FIRST — a complete question like
    # "Admission requirements?" must not be diluted by the previous turn.
    # Then, if this looks like a follow-up, ALSO retrieve with the prior user
    # turn prepended (helps elliptical follow-ups like "or fee?") and merge.
    # Merging keeps the best of both views instead of letting the prepended
    # query bury the chunks that actually answer a self-contained question.
    result_sets = [
        database.search(
            question=question,
            collection=collection,
            model=_model,
            top_k=top_k,
        )
    ]
    retrieval_query = _build_retrieval_query(question, history)
    if retrieval_query != question:
        result_sets.append(
            database.search(
                question=retrieval_query,
                collection=collection,
                model=_model,
                top_k=top_k,
            )
        )
    chunks, sources, scores = _merge_search_results(result_sets, top_k)
    confidence_tier = compute_confidence_tier(scores[0] if scores else None, confidence_high, confidence_low)

    # §8 Layer 4 — a separate, independently-thresholded context section
    # (see _retrieve_listing_context's own docstring for why this isn't
    # merged into the ranked FAQ list above).
    listing_chunks, listing_sources, listing_top_similarity = _retrieve_listing_context(
        tenant_slug, retrieval_query, user_type, listing_relevance
    )
    if listing_chunks:
        chunks = chunks + listing_chunks
        sources = sources + listing_sources
        # A confident listings-database hit is a real answer even when the
        # unrelated FAQ collection came back weak — don't let FAQ's score
        # alone suppress the medium-tier clarifying-question behavior for a
        # question that's actually well-answered by the listings context.
        # Gated on listing_confident (stricter than the inclusion
        # threshold) so a merely-included-but-weak hit doesn't upgrade it.
        if confidence_tier == "low" and listing_top_similarity >= listing_confident:
            confidence_tier = "medium"

    if not chunks:
        return {
            "answer": NO_INFO_FALLBACK,
            "confidence_tier": "low",
        }

    prompt = create_prompt(
        question,
        chunks,
        chunk_sources=sources,
        user_type=user_type,
        confidence_tier=confidence_tier,
        university_name=university_name,
        university_short=university_short,
    )
    try:
        answer = get_llm_response(
            prompt,
            history=history,
            university_name=university_name,
            university_short=university_short,
        )
    except LLMUnavailableError:
        # A total provider outage used to return the raw exception text as
        # if it were a normal answer, tagged with whatever confidence the
        # RETRIEVAL score happened to compute (often "high") — leaking
        # upstream error text into the chat UI and suppressing §4.2's
        # chatbot-handoff/"file a query" offer exactly when it's needed
        # most. Force a safe canned message and low confidence instead.
        return {
            "answer": LLM_UNAVAILABLE_MESSAGE,
            "confidence_tier": "low",
        }
    cleaned = clean_answer(answer)

    # The retrieval score only measures how strongly something was found —
    # not whether it actually answers THIS question, so a genuinely
    # unanswerable question can still score "high" (e.g. strong semantic
    # match to an unrelated but topically-close chunk). When the model's
    # own final answer IS the no-info fallback, that is the more reliable
    # signal for §4.2's handoff gating: force the tier to "low" regardless
    # of what the raw score said, so the "file a query" offer actually
    # appears for every question the bot didn't answer.
    if cleaned.strip() == NO_INFO_FALLBACK.strip():
        confidence_tier = "low"

    return {"answer": cleaned, "confidence_tier": confidence_tier}
