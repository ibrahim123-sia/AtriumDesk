"""
========================================================
DATABASE.PY - Vector Database Operations (ChromaDB)
========================================================

This file handles everything related to the vector database:
  - Building the database from chunks (embeddings)
  - Searching the database for relevant chunks

WHAT IS A VECTOR DATABASE?
  Normal databases search by exact keywords. A vector database
  converts text into numbers (vectors/embeddings) and searches
  by meaning. So "tuition cost" finds results about "fee structure"
  even though the words are different.

HOW IT WORKS:
  1. Each text chunk is converted to a 384-number vector
     using the embedding model (all-MiniLM-L6-v2)
  2. These vectors are stored in ChromaDB
  3. When you ask a question, it's also converted to a vector
  4. ChromaDB finds the chunks whose vectors are closest
     to your question's vector (= most similar meaning)
"""

import json           # For loading and parsing chunks and saving collection metadata
import os             # For handling database and metadata file paths
import chromadb       # The vector database client library for similarity search
from sentence_transformers import SentenceTransformer  # For generating text embeddings locally
from tqdm import tqdm  # For displaying progress bars during database build

import config         # Local application configuration parameters



# =============================================================
# INITIALIZATION - Setting up the database and model
# =============================================================

def get_chroma_client():
    """
    Create a ChromaDB client that saves data to disk.

    ChromaDB has two APIs (old and new). We try the modern one first
    and fall back to the legacy one for compatibility.

    Returns:
        A ChromaDB client connected to the local database folder
    """
    try:
        # Modern API (ChromaDB >= 0.4.0)
        client = chromadb.PersistentClient(path=config.CHROMA_DB_PATH)
    except AttributeError:
        # Legacy API (older ChromaDB versions)
        client = chromadb.Client(
            settings=chromadb.config.Settings(
                persist_directory=config.CHROMA_DB_PATH
            )
        )
    return client


def get_embedding_model():
    """
    Load the sentence embedding model.

    This model (all-MiniLM-L6-v2) converts text into 384-dimensional
    vectors. It's lightweight (~27MB) and fast, but still accurate
    for semantic similarity tasks.

    Returns:
        A SentenceTransformer model ready to encode text
    """
    model = SentenceTransformer(config.EMBEDDING_MODEL)
    return model


def get_collection(client, collection_name=None):
    """
    Get a ChromaDB collection (like a "table" in a normal database).

    One PersistentClient, one on-disk path, many named collections — a
    different collection per tenant, not a different client/path per tenant
    (Rev7 §5.4). Callers on a per-request path (rag.py) always pass an
    explicit tenant-resolved collection_name; the default here only exists
    for offline/legacy scripts that haven't been threaded through yet.

    Args:
        client: A ChromaDB client
        collection_name: Which collection to open. Defaults to the legacy
            single-tenant constant (MAJU's existing collection).

    Returns:
        The requested collection
    """
    # get_or_create: tenant provisioning (Node's T2 wizard) records the
    # collection name but never creates the collection itself — with a plain
    # get_collection every /ask for a fresh tenant raised until an admin
    # happened to upload a chunk. An empty collection instead yields zero
    # results and a clean low-confidence answer.
    return client.get_or_create_collection(name=collection_name or config.COLLECTION_NAME)


# =============================================================
# BUILD - Creating the vector database from chunks
# =============================================================

def build_database(collection_name=None, chunks=None):
    """
    Build the vector database from scraped chunks.

    Reads chunks.json (the CLI tool's fixed single-tenant path) and stores
    everything in ChromaDB, unless `chunks` is passed directly — used by
    the self-service per-tenant scrape (content_scrape_service.py), which
    has its own tenant-scoped chunks in memory and must never touch the
    CLI tool's shared file. This is the most time-consuming step because
    every chunk needs to be converted to a vector.

    Run this after scraping: python run.py build

    Args:
        collection_name: Which tenant's collection to (re)build. Defaults to
            the legacy single-tenant constant (MAJU).
        chunks: Optional in-memory chunk list. Skips the CHUNKS_FILE read
            when provided.
    """
    name = collection_name or config.COLLECTION_NAME

    print("=" * 60)
    print("BUILDING VECTOR DATABASE")
    print("=" * 60)

    if chunks is None:
        print("\nLoading chunks...")
        with open(config.CHUNKS_FILE, "r", encoding="utf-8") as f:
            chunks = json.load(f)
    print(f"  Loaded {len(chunks)} chunks")

    # Step 2: Set up ChromaDB
    print("\nSetting up ChromaDB...")
    client = get_chroma_client()

    # Delete old collection if it exists, then create a fresh one
    try:
        client.delete_collection(name=name)
        print(f"  Deleted old collection '{name}'")
    except Exception:
        pass  # Collection didn't exist — that's fine

    collection = client.create_collection(name=name)
    print(f"  Created new collection: '{name}'")

    # Step 3: Load the embedding model
    print("\nLoading embedding model...")
    model = get_embedding_model()
    print(f"  Model loaded: {config.EMBEDDING_MODEL}")

    # Step 4: Process chunks in batches and add to database
    print(f"\nAdding {len(chunks)} chunks to database...")
    total_batches = (len(chunks) + config.BATCH_SIZE - 1) // config.BATCH_SIZE

    for batch_idx in tqdm(range(total_batches), desc="Processing"):
        # Get the current batch of chunks
        start = batch_idx * config.BATCH_SIZE
        end = min(start + config.BATCH_SIZE, len(chunks))
        batch = chunks[start:end]

        # Prepare data for ChromaDB
        ids = []           # Unique ID for each chunk
        documents = []     # The actual text
        metadatas = []     # Extra info (source URL)
        embeddings = []    # The vector representation

        for i, chunk in enumerate(batch):
            chunk_id = f"chunk_{start + i}"

            # Combine page title, heading, and text to make the chunk self-contained for search
            title = chunk.get("page_title", "")
            heading = chunk.get("heading", "")
            text = chunk["text"]

            prefix_parts = []
            if title:
                prefix_parts.append(title)
            if heading and heading != title:
                prefix_parts.append(heading)

            if prefix_parts:
                doc_text = "\n\n".join(prefix_parts) + "\n\n" + text
            else:
                doc_text = text

            ids.append(chunk_id)
            documents.append(doc_text)
            metadatas.append({"source": chunk["source"], "chunk_id": chunk_id})

            # Convert combined text to a 384-dimensional vector
            embedding = model.encode(doc_text).tolist()
            embeddings.append(embedding)

        # Add this batch to ChromaDB
        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings,
        )

    # Step 5: Verify the database
    count = collection.count()
    print(f"\nDatabase built successfully!")
    print(f"  Total documents: {count}")

    # Step 6: Run a test query to make sure it works
    print("\nRunning test query: 'What is the admission fee?'")
    test_embedding = model.encode("What is the admission fee?").tolist()
    results = collection.query(query_embeddings=[test_embedding], n_results=3)

    if results["documents"][0]:
        print(f"  Found {len(results['documents'][0])} results")
        print(f"  Top match: {results['documents'][0][0][:120]}...")
    else:
        print("  WARNING: Test query returned no results!")

    # Step 7: Save metadata for reference
    metadata = {
        "total_chunks": count,
        "embedding_model": config.EMBEDDING_MODEL,
        "embedding_dimension": config.EMBEDDING_DIMENSION,
        "collection_name": name,
        "chunk_sources": len(set(chunk["source"] for chunk in chunks)),
    }

    # Per-collection filename — config.METADATA_FILE alone would have every
    # tenant's build overwrite the last one's metadata.
    metadata_file = os.path.join(config.CHROMA_DB_PATH, f"metadata_{name}.json")
    os.makedirs(config.CHROMA_DB_PATH, exist_ok=True)
    with open(metadata_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"  Metadata saved to {metadata_file}")
    print("=" * 60)
    return count


# =============================================================
# SEARCH - Finding relevant chunks for a question
# =============================================================

import re as _re      # For regular expressions used in query tokenization
import math as _math  # For calculation of TF-IDF / BM25 term weights in keyword search


_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "of", "in", "on", "at", "to", "for", "and", "or", "but", "with",
    "from", "by", "as", "that", "this", "these", "those", "it", "its",
    "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
    "do", "does", "did", "have", "has", "had", "can", "could", "should",
    "would", "will", "may", "might", "i", "you", "we", "they", "he", "she",
    "me", "my", "your", "our", "their", "his", "her",
    "tell", "give", "list", "show", "please", "any", "some", "all",
    "about", "into", "than", "then", "there", "here",
    # Roman-Urdu stopwords (very common, low-signal)
    "kya", "kia", "mein", "main", "hai", "hain", "ho", "hoon", "ka", "ki",
    "ke", "se", "ko", "par", "pe", "or", "aur", "yeh", "ye", "wo", "wah",
    "kaisay", "kaise",
}


_ABBREVIATION_MAP = {
    "bscs": ["bs", "cs", "computer", "science"],
    "bsse": ["bs", "se", "software", "engineering"],
    "bsee": ["bs", "ee", "electrical", "engineering"],
    "bsai": ["bs", "ai", "artificial", "intelligence"],
    "mscs": ["ms", "cs", "computer", "science"],
    "msse": ["ms", "se", "software", "engineering"],
    "msds": ["ms", "ds", "data", "science"],
    "phdcs": ["phd", "cs", "computer", "science"],
    "bba": ["business", "administration"],
    "mba": ["business", "administration"]
}


def _meaningful_tokens(text):
    """Pull useful keywords out of a free-form question.

    Returns lowercased tokens of length >= 3 that aren't English/Roman-Urdu
    stopwords. These drive the keyword-fallback pass in `search`.
    """
    text = (text or "").lower()
    # Normalize course codes like cs-3413 or cs 3413 to cs3413
    text = _re.sub(r"\b([a-z]+)[\s\-]+(\d+)\b", r"\1\2", text)
    # Treat hyphens/slashes as word separators but keep alphanumerics
    text = _re.sub(r"[^a-z0-9\s\-/]+", " ", text)
    raw = [t.strip("-/") for t in text.split() if t.strip("-/")]
    tokens = [t for t in raw if len(t) >= 3 and t not in _STOPWORDS]
    
    # Query expansion for programs/degrees/courses to capture structured lists
    expanded = list(tokens)
    
    # 1. Expand abbreviations
    for t in tokens:
        if t in _ABBREVIATION_MAP:
            expanded.extend(_ABBREVIATION_MAP[t])
            
    # 2. Expand general program queries
    has_program_query = False
    for t in tokens:
        stemmed = _stem(t)
        if stemmed in ("program", "degree", "course", "offer", "admission", "fee"):
            has_program_query = True
            break
            
    if has_program_query:
        expanded.extend(["undergraduate", "graduate", "postgraduate", "phd", "bachelor", "master", "doctorate", "bs", "ms"])
        
    return list(set(expanded))


def _stem(word):
    """Normalize common academic suffixes and spelling variations (singular/plural, UK/US spelling)."""
    w = word.lower()
    # Normalize common academic terms
    if w in ("programme", "programmes", "programming"):
        return "program"
    if w in ("admissions", "admission"):
        return "admission"
    if w in ("scholarships", "scholarship"):
        return "scholarship"
    if w in ("courses", "course"):
        return "course"
    if w in ("fees", "fee"):
        return "fee"
    if w in ("universities", "university"):
        return "university"
        
    # Standard suffixes
    for suffix in ("ies", "es", "s", "ed", "ing"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            res = w[:-len(suffix)]
            if suffix == "ies":
                res += "y"
            return res
    return w


def _has_word(token, text_low, url_tokens=None):
    """Check if token matches a word in text_low (raw or stemmed) or in url_tokens."""
    token_stem = _stem(token)
    
    if url_tokens and token_stem in url_tokens:
        return True, True
        
    words = _re.findall(r"[a-z0-9\-]+", text_low)
    for w in words:
        if w == token:
            return True, False
        if _stem(w) == token_stem:
            return True, False
        if "-" in w:
            w_norm = w.replace("-", "")
            if w_norm == token or _stem(w_norm) == token_stem:
                return True, False
    return False, False


# Keyed by collection name — a bare module-level cache (no key) would let
# one tenant's cached chunks get served for a different tenant's collection
# whenever their counts happened to match, exactly the same "process-lifetime
# global state" bug class as rag.py's _collection/_model singletons (Rev7 §5.4).
_keyword_cache = {}


def clear_keyword_cache(collection_name=None):
    """Clear the cached chunks in RAM to force reload on the next search.

    With no argument, clears every tenant's cached entry."""
    global _keyword_cache
    if collection_name is None:
        _keyword_cache = {}
    else:
        _keyword_cache.pop(collection_name, None)
    print("  Database keyword search cache cleared")


def _load_all_chunks(collection):
    """Cache the full chunk list in RAM for keyword scans, per collection.

    ChromaDB doesn't offer keyword search on its own. For ~4k chunks the
    cost of holding one tenant's corpus in memory is negligible (~5MB). The
    per-collection cache entry is invalidated when that collection's
    count() changes — covers admin CRUD.
    """
    name = collection.name
    entry = _keyword_cache.get(name)
    count = collection.count()
    if entry is not None and entry["version"] == count:
        return entry["chunks"], entry["ids"], entry["metas"]

    data = collection.get(include=["documents", "metadatas"])
    chunks = data.get("documents", []) or []
    ids = data.get("ids", []) or []
    metas = data.get("metadatas", []) or [{} for _ in chunks]
    _keyword_cache[name] = {"chunks": chunks, "ids": ids, "metas": metas, "version": count}
    return chunks, ids, metas


def _keyword_search(question, collection, top_k):
    """Score chunks by TF-IDF based keyword matching over text and URLs.

    Uses stemmed whole-word matching so variations (like "programs" vs "programmes",
    "admissions" vs "admission") match correctly, while protecting against
    substring matches.
    """
    tokens = _meaningful_tokens(question)
    if not tokens:
        return [], [], []

    chunks, ids, metas = _load_all_chunks(collection)
    
    # 1. Precompute stemmed URL tokens for all chunks
    precomputed_urls = []
    for idx, text in enumerate(chunks):
        meta = metas[idx] if idx < len(metas) else {}
        source_url = meta.get("source", "").lower()
        raw_url_tokens = _re.findall(r"[a-z0-9\-]+", source_url)
        url_tokens = set()
        for w in raw_url_tokens:
            url_tokens.add(w)
            url_tokens.add(_stem(w))
            if "-" in w:
                url_tokens.add(w.replace("-", ""))
                url_tokens.add(_stem(w.replace("-", "")))
        precomputed_urls.append(url_tokens)
    
    # 2. Compute Document Frequency (DF) and IDF for each token in the query
    dfs = {t: 0 for t in tokens}
    for idx, text in enumerate(chunks):
        if not text:
            continue
        low = text.lower()
        url_tokens = precomputed_urls[idx]
        
        for t in tokens:
            matched, _ = _has_word(t, low, url_tokens)
            if matched:
                dfs[t] += 1
                
    idfs = {}
    total_docs = len(chunks)
    total_query_idf = 0.0
    for t in tokens:
        df = dfs[t]
        # Calculate IDF with standard smoothing
        idf = _math.log((total_docs + 1) / (df + 1))
        idfs[t] = idf
        total_query_idf += idf

    if total_query_idf <= 0.0:
        return [], [], []

    # 3. Score each chunk
    scored = []
    for idx, text in enumerate(chunks):
        if not text:
            continue
        low = text.lower()
        url_tokens = precomputed_urls[idx]
        
        matched_idf_sum = 0.0
        for t in tokens:
            matched, in_url = _has_word(t, low, url_tokens)
            if matched:
                term_score = idfs[t]
                # Boost match if it's found in the source URL path
                if in_url:
                    term_score *= 1.5
                matched_idf_sum += term_score
                
        if matched_idf_sum > 0:
            # Normalized score between 0 and 1 (can exceed 1 if URL boosts apply)
            norm_score = matched_idf_sum / total_query_idf
            # Tie breaker: prefer shorter, more focused chunks
            scored.append((norm_score, -len(text), idx))

    if not scored:
        return [], [], []

    scored.sort(reverse=True)
    out_chunks, out_metas, out_scores = [], [], []
    for score, _neglen, idx in scored[:top_k]:
        out_chunks.append(chunks[idx])
        out_metas.append(metas[idx] if idx < len(metas) else {})
        out_scores.append(score)
    return out_chunks, out_metas, out_scores


def search(question, collection, model, top_k=None):
    """Hybrid retrieval: semantic top-K merged with a keyword fallback.

    Why hybrid?
      - Semantic search (vector similarity) is great for paraphrased
        questions ("what's the cost of CS?" finds "BSCS fee structure").
      - But it under-weights *exact tokens* — course codes like "CS-201",
        phone numbers, faculty names, fee figures. Those are caught by
        the keyword pass instead.
      - We dedupe by chunk text so a chunk found by both methods only
        appears once but with a boosted combined score.

    Returns (chunks, sources, scores) in descending relevance.
    """
    if top_k is None:
        top_k = config.TOP_K_RESULTS

    # --- semantic pass --------------------------------------------------
    question_embedding = model.encode(question).tolist()
    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )
    sem_chunks = results["documents"][0] if results["documents"] else []
    sem_metas = results["metadatas"][0] if results["metadatas"] else []
    sem_dists = results["distances"][0] if results["distances"] else []
    sem_scores = [(1 - d) for d in sem_dists]

    # --- keyword pass ---------------------------------------------------
    kw_k = getattr(config, "KEYWORD_BOOST_TOP_K", 4)
    kw_chunks, kw_metas, kw_scores = _keyword_search(question, collection, top_k=kw_k)

    # --- merge with dedup -----------------------------------------------
    # Identity key: first 120 chars of chunk text (good enough — chunks
    # don't collide on the prefix in practice).
    merged = {}
    for c, m, s in zip(sem_chunks, sem_metas, sem_scores):
        key = (c or "")[:120]
        merged[key] = {"text": c, "meta": m, "score": s, "kw": 0.0}
    for c, m, s in zip(kw_chunks, kw_metas, kw_scores):
        key = (c or "")[:120]
        if key in merged:
            merged[key]["kw"] = s
        else:
            merged[key] = {"text": c, "meta": m, "score": 0.0, "kw": s}

    # Combined score: semantic + 1.0 * keyword (semantic is primary,
    # keyword is a boost for exact term matching)
    ranked = sorted(
        merged.values(),
        key=lambda r: r["score"] + 1.0 * r["kw"],
        reverse=True,
    )[:top_k]

    chunks = [r["text"] for r in ranked]
    sources = [r["meta"] for r in ranked]
    scores = [r["score"] + 1.0 * r["kw"] for r in ranked]
    return chunks, sources, scores
