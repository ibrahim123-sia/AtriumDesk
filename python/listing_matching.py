"""
========================================================
LISTING_MATCHING.PY - Layer 2 embeddings: dedup + semantic matching (Rev 5 §8)
========================================================

Separate ChromaDB collection from the chatbot's own knowledge-base
collection (`database.py`'s `university_chunks_*`) — per §8 Layer 2's own
note: "ChromaDB's client is collection-name-agnostic, so a second
collection alongside the existing chatbot knowledge base is
straightforward. The chatbot's hybrid keyword-search layer is
corpus-specific and should not be reused here — a simpler pure-semantic
query fits matching better." Reuses the same ChromaDB client/on-disk path
and the same embedding model as database.py, just a different collection
name and a plain semantic query (no keyword layer).

Two jobs:
  1. Store one embedding per approved listing ("one listing = one
     embedding. Embed the full structured record as a single document" —
     the same representation Phase 9's RAG-over-new-content layer will
     reuse directly, so this collection is built once and read twice).
  2. Ingestion-time duplicate detection: before a newly-scraped listing
     becomes a new pending record, check it against existing approved
     listings of the same type — above threshold, the caller (Node, via
     server/controllers/adminSourceController.js) merges into the existing
     record instead of creating a duplicate.
"""

import chromadb

import config
import database

_model = None  # Lazily loaded once, reused across all tenants/calls.


def _get_model():
    global _model
    if _model is None:
        _model = database.get_embedding_model()
    return _model


def _collection_name(tenant_slug):
    return f"listings_{tenant_slug or 'default'}"


def _get_collection(tenant_slug):
    client = database.get_chroma_client()
    name = _collection_name(tenant_slug)
    try:
        return client.get_collection(name=name)
    except Exception:
        # Explicit cosine distance (ChromaDB defaults to L2) so
        # `1 - distance` below is a mathematically correct similarity,
        # not just the same approximation database.py's search() uses
        # for the chatbot's own (differently-configured) collection.
        return client.create_collection(name=name, metadata={"hnsw:space": "cosine"})


def _listing_text(data):
    """Builds the one-document-per-listing text Rev 5 §5 (Phase 9) and this
    module both embed — title/organization first (most semantically
    distinctive), then whatever free-text fields the listing has."""
    parts = [data.get("title", ""), data.get("organization", "")]
    for key in ("description", "eligibilityCriteria", "location", "country", "experienceLevel"):
        value = data.get(key)
        if value:
            parts.append(str(value))
    for key in ("requiredDocuments", "skillsRequired"):
        value = data.get(key)
        if value:
            parts.append(", ".join(value))
    return "\n".join(p for p in parts if p)


def _clean_metadata(fields):
    """Chroma metadata rejects None outright — drop unset/empty values
    rather than sending them."""
    return {k: v for k, v in fields.items() if v is not None and v != ""}


def _build_metadata(listing_type, data):
    """Flattens the structured fields Phase 9's RAG-over-new-content layer
    needs to answer questions like "which scholarships don't require
    IELTS" directly from retrieval, without a live round-trip back to
    Node. Kept separate from `_listing_text` (the embedded prose used for
    semantic matching) — this is what gets displayed, not what gets
    embedded."""
    meta = {
        "listingType": listing_type,
        "title": data.get("title", ""),
        "organization": data.get("organization", ""),
        "officialLink": data.get("officialLink", ""),
    }
    deadline = data.get("deadline")
    if deadline:
        meta["deadline"] = str(deadline)[:10]
    if listing_type == "scholarship":
        for key in ("country", "degreeLevel", "fundingType"):
            if data.get(key):
                meta[key] = data[key]
        for key in ("cgpaRequirement", "ieltsRequirement", "toeflRequirement"):
            if data.get(key) is not None:
                meta[key] = data[key]
    elif listing_type == "job":
        for key in ("workMode", "location", "experienceLevel"):
            if data.get(key):
                meta[key] = data[key]
        if data.get("isFreshGradFriendly") is not None:
            meta["isFreshGradFriendly"] = bool(data["isFreshGradFriendly"])
    elif listing_type == "event":
        date = data.get("date")
        if date:
            meta["date"] = str(date)[:10]
        if data.get("location"):
            meta["location"] = data["location"]
    return _clean_metadata(meta)


def embed_listing(tenant_slug, listing_id, listing_type, data):
    """Stores/updates one listing's embedding. Called once, at approval
    time — not on every read (§8's explicit "precompute at write time,
    not read time" rule)."""
    collection = _get_collection(tenant_slug)
    model = _get_model()
    text = _listing_text(data)
    embedding = model.encode(text).tolist()
    collection.upsert(
        ids=[str(listing_id)],
        embeddings=[embedding],
        documents=[text],
        metadatas=[_build_metadata(listing_type, data)],
    )


def remove_listing_embedding(tenant_slug, listing_id):
    """Called on delete/unmerge cleanup so a stale embedding never gets
    matched against again."""
    collection = _get_collection(tenant_slug)
    try:
        collection.delete(ids=[str(listing_id)])
    except Exception:
        pass  # Nothing to remove is not an error.


# Cosine similarity above this is treated as "the same listing, re-posted
# elsewhere" rather than a coincidentally-similar different one. Calibrated
# against a real pair (same Chevening scholarship, reworded as if scraped
# from a second page describing it -> 0.88) vs. a genuinely different
# scholarship (-> 0.45) — a wide, clean gap. 0.80 sits comfortably below
# the real-duplicate score (catches reworded re-posts) and well above the
# different-listing score (avoids merging similar-but-distinct postings,
# the false-positive risk the spec explicitly calls out). Re-calibrate if
# real merge/no-merge cases from the admin review queue suggest otherwise.
DUPLICATE_THRESHOLD = 0.80


def find_duplicate(tenant_slug, listing_type, data, exclude_id=None):
    """Embeds `data` and queries existing listings of the same type for the
    closest match. Returns {"listingId": str, "score": float} if above
    DUPLICATE_THRESHOLD, else None. Only ever called at ingestion time,
    before a new record is created (§8 Layer 2)."""
    collection = _get_collection(tenant_slug)
    if collection.count() == 0:
        return None

    model = _get_model()
    text = _listing_text(data)
    embedding = model.encode(text).tolist()

    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(5, collection.count()),
        where={"listingType": listing_type},
    )
    ids = results.get("ids", [[]])[0]
    distances = results.get("distances", [[]])[0]
    for doc_id, distance in zip(ids, distances):
        if exclude_id and doc_id == str(exclude_id):
            continue
        # Collection is created with hnsw:space=cosine, so distance is
        # cosine distance (0 = identical) and similarity = 1 - distance.
        similarity = 1 - distance
        if similarity >= DUPLICATE_THRESHOLD:
            return {"listingId": doc_id, "score": round(similarity, 4)}
    return None


def search_listings(tenant_slug, query, listing_types=None, top_k=5):
    """§8 Layer 4 — semantic retrieval for the chatbot's RAG-over-new-content
    layer. Returns a list of dicts, each the listing's flattened metadata
    (title, organization, requirement fields, etc. — see `_build_metadata`)
    plus its embedded prose and similarity score, ranked descending.

    `listing_types`, when given, restricts results to those discriminator
    values (e.g. guests never see job/external-scholarship content per
    §8.7.6 Branch D — rag.py passes `["event"]` for a guest caller).
    """
    collection = _get_collection(tenant_slug)
    if collection.count() == 0:
        return []

    model = _get_model()
    embedding = model.encode(query).tolist()
    where = {"listingType": {"$in": listing_types}} if listing_types else None

    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(top_k, collection.count()),
        where=where,
    )
    ids = results.get("ids", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    documents = results.get("documents", [[]])[0]

    out = []
    for doc_id, meta, dist, doc in zip(ids, metadatas, distances, documents):
        out.append({
            "id": doc_id,
            "similarity": round(1 - dist, 4),
            "text": doc,
            **(meta or {}),
        })
    return out
