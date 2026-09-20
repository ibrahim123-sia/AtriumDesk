"""
========================================================
HEALTH_CHECK.PY - External dependency pings
========================================================

Rev5 §13.2 — "System health / pre-demo check. One admin screen pinging
every external dependency — LLM providers, Mongo, ChromaDB — with
green/red status." Mongo is checked Node-side (it already holds that
connection); this module covers the two dependencies only Python can
see: ChromaDB and whichever LLM provider is currently configured.

Every check is read-only and cheap (list calls, not completions) so
running this right before a demo doesn't burn API quota or cost money.
"""

import config
import database


def check_chroma_health(tenant_slug=None):
    """Confirm the ChromaDB client is reachable and (if a tenant is given)
    that tenant's collection actually exists and is queryable."""
    try:
        client = database.get_chroma_client()
    except Exception as e:
        return {"reachable": False, "error": f"Could not open ChromaDB client: {e}"}

    if not tenant_slug:
        return {"reachable": True}

    collection_name = config.get_collection_name(tenant_slug)
    try:
        collection = client.get_collection(name=collection_name)
        count = collection.count()
        return {"reachable": True, "collection": collection_name, "chunkCount": count}
    except Exception as e:
        return {"reachable": False, "collection": collection_name, "error": str(e)}


def check_llm_health():
    """Ping whichever LLM backend is currently active (Ollama, or the first
    entry in CLOUD_LLM_ORDER), without spending completion tokens."""
    if config.USE_LOCAL_LLM:
        return _check_ollama()

    provider = config.CLOUD_LLM_ORDER[0] if config.CLOUD_LLM_ORDER else "groq"
    if provider == "gemini":
        return _check_gemini()
    return _check_groq()


def _check_ollama():
    try:
        import rag
        client = rag._get_ollama_client()
        client.list()
        return {"provider": "ollama", "model": config.OLLAMA_MODEL, "reachable": True}
    except Exception as e:
        return {"provider": "ollama", "model": config.OLLAMA_MODEL, "reachable": False, "error": str(e)}


def _check_groq():
    # Checking connectivity alone previously reported green even when
    # config.GROQ_MODEL itself was invalid/deprecated — the exact blind spot
    # behind a real incident where a deprecated model name silently fell
    # through to Gemini on every real request. models.list() is already a
    # read-only, no-completion-token call, so cross-checking the configured
    # model against it costs nothing extra.
    if not config.GROQ_API_KEYS:
        return {"provider": "groq", "reachable": False, "error": "No GROQ_API_KEY configured"}
    try:
        import rag
        client = rag._get_groq_client(config.GROQ_API_KEYS[0])
        available = {m.id for m in client.models.list().data}
        if config.GROQ_MODEL not in available:
            return {
                "provider": "groq",
                "model": config.GROQ_MODEL,
                "reachable": False,
                "error": f"Configured model '{config.GROQ_MODEL}' is not in Groq's available model list",
            }
        return {"provider": "groq", "model": config.GROQ_MODEL, "reachable": True}
    except Exception as e:
        return {"provider": "groq", "model": config.GROQ_MODEL, "reachable": False, "error": str(e)}


def _check_gemini():
    if not config.GEMINI_API_KEY:
        return {"provider": "gemini", "reachable": False, "error": "No GEMINI_API_KEY configured"}
    try:
        import requests
        response = requests.get(
            "https://generativelanguage.googleapis.com/v1beta/openai/models",
            headers={"Authorization": f"Bearer {config.GEMINI_API_KEY}"},
            timeout=10,
        )
        response.raise_for_status()
        return {"provider": "gemini", "model": config.GEMINI_MODEL, "reachable": True}
    except Exception as e:
        return {"provider": "gemini", "model": config.GEMINI_MODEL, "reachable": False, "error": str(e)}
