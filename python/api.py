"""
========================================================
API.PY - FastAPI Server for the RAG System
========================================================

Exposes the RAG system + admin vector-DB CRUD over HTTP.

PUBLIC ENDPOINT:
  POST /ask          — RAG question/answer (used by Node + chat)

ADMIN ENDPOINTS (require valid admin JWT):
  GET    /chunks                — list chunks (paginated)
  GET    /chunks/{chunk_id}     — fetch single chunk
  POST   /chunks                — add a new chunk
  PATCH  /chunks/{chunk_id}     — update chunk text (re-embeds)
  DELETE /chunks/{chunk_id}     — remove chunk
  POST   /documents             — upload PDF/DOCX/TXT, split + embed

INTERNAL (require x-internal-secret, called by Node's scheduler/services):
  POST   /internal/backup-chroma — zip CHROMA_DB_PATH into python/backups/
  GET    /internal/health         — ping ChromaDB + the active LLM provider
  POST   /internal/scrape-site    — self-service chatbot KB scrape for one
                                    tenant's own university website (async,
                                    reports back to Node when done)

MODERATION:
  Every /ask call runs profanity detection. Flagged messages are NOT
  answered; instead Python posts a webhook to Node's internal endpoint
  so the user is flagged and admin is notified.
"""

import os             # For accessing environment variables and filesystem paths
import io             # For byte stream management during file uploads
import re             # For regular expression operations in validation
import uuid           # For generating unique identifiers for document records
import tempfile       # For creating temporary files during audio transcription
import hmac           # For constant-time secret comparison (verify_internal_secret)
from typing import Optional, List  # For type hinting in API request models

import jwt            # For verifying and decoding JWT tokens from the Node server
import requests       # For sending HTTP requests and triggering Node admin webhooks
from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Form, Query, Depends, BackgroundTasks  # FastAPI web framework components
from fastapi.middleware.cors import CORSMiddleware  # CORS support for frontend API requests
from pydantic import BaseModel  # For defining and validating request/response schemas
import uvicorn        # ASGI server to run the FastAPI app
from dotenv import load_dotenv  # For loading variables from .env into environment

# Local project modules
import config         # Application configurations and global settings
import rag            # Retrieval Augmented Generation pipeline
import database       # ChromaDB operations and search queries
from moderation import check_message  # Urdu and English abuse detection filter
from transcribe import transcribe_audio  # Local Whisper speech-to-text transcription

load_dotenv()


# =============================================================
# APP SETUP
# =============================================================

app = FastAPI(
    title="AtriumDesk RAG + Admin API",
    description="RAG endpoint for students; admin CRUD for the vector store.",
)


@app.on_event("startup")
async def _start_listing_scheduler():
    """Rev 5 §9.3 recurring-source polling — a background asyncio task, not
    a separate process, so it shares this server's lifecycle."""
    import asyncio
    import listing_scheduler

    asyncio.create_task(listing_scheduler.scheduler_loop())

# CORS — allow Vite dev client (5173) and any extra origin via env
default_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
extra = os.getenv("CORS_ALLOW_ORIGINS", "")
if extra:
    default_origins.extend([o.strip() for o in extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=default_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


JWT_SECRET = os.getenv("JWT_SECRET")
NODE_INTERNAL_URL = os.getenv("NODE_INTERNAL_URL", "http://localhost:3000")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET")


# =============================================================
# AUTH DEPENDENCY
# =============================================================

def verify_admin(authorization: Optional[str] = Header(default=None)) -> dict:
    """
    Decode the JWT issued by the Node server and ensure the user is an admin.

    The Node server signs `{ id }` and stores role on the user document.
    Python only knows the secret — it trusts the role claim if one is signed in,
    otherwise it calls back to Node to verify the role.

    For now, we accept JWTs that carry the user id and call Node to confirm
    role. This avoids embedding role into JWTs (which would require Node changes).
    """
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Python JWT_SECRET not configured")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user id")
    # Node embeds the tenant a user belongs to directly in the JWT (see
    # server/middlewares/auth.js's `protect`) — Python reads it here rather
    # than round-tripping to Node a second time just to learn which tenant's
    # ChromaDB collection this request's admin CRUD should touch.
    tenant_slug = payload.get("tenantSlug")

    # Verify admin role via Node (single round-trip; result is cheap to compute)
    try:
        resp = requests.get(
            f"{NODE_INTERNAL_URL}/api/admin/internal/verify-admin",
            headers={
                "Authorization": token,
                "x-internal-secret": INTERNAL_SECRET or "",
            },
            timeout=5,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Node for auth: {exc}")

    if resp.status_code != 200:
        raise HTTPException(status_code=403, detail="Not an admin user")

    return {"id": user_id, "tenant_slug": tenant_slug, **(resp.json().get("user") or {})}


def verify_internal_secret(x_internal_secret: Optional[str] = Header(default=None)) -> None:
    """Rev 5 §9.3: the ONE Python endpoint that must validate an INCOMING
    internal-secret header — every other cross-service call in this codebase
    runs Python -> Node, never the reverse. Node's /scrape caller sends this
    header instead of a user JWT (it's a machine-to-machine call, the admin
    already authenticated with Node itself)."""
    if not INTERNAL_SECRET:
        raise HTTPException(status_code=500, detail="INTERNAL_SECRET not configured")
    # Plain != short-circuits on the first differing byte, which is a
    # timing side-channel on the single secret gating every internal/scrape
    # endpoint. hmac.compare_digest runs in constant time regardless.
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(status_code=403, detail="Internal secret missing or invalid")


# =============================================================
# MODELS
# =============================================================

class HistoryMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class QuestionRequest(BaseModel):
    question: str
    user_id: Optional[str] = None
    chat_id: Optional[str] = None
    # Which university's knowledge base to search. Node's authenticated chat
    # sends req.tenant.slug; guest chat (no login, no JWT) sends whichever
    # tenant its client-side context resolved to. None falls back to the
    # legacy single-tenant (MAJU) collection.
    tenant_slug: Optional[str] = None
    # Prior turns of the same chat, oldest first. The Node API trims this
    # to the last few messages before sending; Python just forwards it to
    # the LLM as conversational context (does NOT use it for retrieval).
    history: Optional[List[HistoryMessage]] = None
    # Rev 5 §8.7's USER_TYPE prompt variable — "guest" (no account, no
    # portal) or "student" (has a portal to file issues in). Node's
    # authenticated chat sends "student"; guest chat sends "guest".
    user_type: str = "guest"
    # Tenant branding (Rev7 T1) — falls back to the MAJU defaults in rag.py
    # if not supplied, so single-tenant callers need no changes.
    university_name: Optional[str] = None
    university_short: Optional[str] = None


class AnswerResponse(BaseModel):
    answer: str
    flagged: bool = False
    matches: Optional[List[str]] = None
    language: Optional[str] = None
    # Rev 5 §4.2's three-tier confidence, from rag.py's merged search score.
    confidence_tier: Optional[str] = None
    # Super Admin Usage tab — token/request accounting for the LLM call this
    # answer actually made, or None for a cache hit / moderation-flagged
    # reply (neither calls the LLM).
    usage: Optional[dict] = None


class ChunkBody(BaseModel):
    text: str
    source: Optional[str] = "admin"


class ChunkUpdate(BaseModel):
    text: str


class ModerationBody(BaseModel):
    text: str


# =============================================================
# /ASK — Public RAG with moderation
# =============================================================

WARNING_RESPONSE = (
    "I noticed inappropriate language in your message. Please rephrase your "
    "question respectfully so I can help you."
)


def _flag_user(user_id: str, message: str, matches: List[str], chat_id: Optional[str], tenant_slug: Optional[str]):
    if not INTERNAL_SECRET:
        return
    try:
        requests.post(
            f"{NODE_INTERNAL_URL}/api/admin/internal/flag-user",
            headers={"x-internal-secret": INTERNAL_SECRET, "Content-Type": "application/json"},
            json={
                "userId": user_id,
                "message": message,
                "matches": matches,
                "chatId": chat_id,
                "tenant_slug": tenant_slug,
            },
            timeout=5,
        )
    except requests.RequestException as exc:
        print(f"flag-user webhook failed: {exc}")


@app.post("/ask", response_model=AnswerResponse, dependencies=[Depends(verify_internal_secret)])
def ask_question(request: QuestionRequest):
    # Plain `def` (not async): rag.ask is fully synchronous (embedding
    # encode + blocking LLM HTTP calls), so an async handler would block
    # the event loop for the whole round-trip and serialize every
    # concurrent request. Starlette runs sync handlers in its threadpool.
    moderation = check_message(request.question)
    if moderation["flagged"]:
        if request.user_id:
            _flag_user(request.user_id, request.question, moderation["matches"], request.chat_id, request.tenant_slug)
        return AnswerResponse(
            answer=WARNING_RESPONSE,
            flagged=True,
            matches=moderation["matches"],
            language=moderation["language"],
        )

    history_payload = (
        [{"role": h.role, "content": h.content} for h in request.history]
        if request.history else None
    )
    if history_payload:
        print(f"  /ask received {len(history_payload)} prior turns (tenant={request.tenant_slug})")
    else:
        print(f"  /ask no history attached (tenant={request.tenant_slug})")
    result = rag.ask(
        request.question,
        tenant_slug=request.tenant_slug,
        history=history_payload,
        user_type=request.user_type,
        university_name=request.university_name,
        university_short=request.university_short,
    )
    return AnswerResponse(
        answer=result["answer"],
        flagged=False,
        confidence_tier=result["confidence_tier"],
        usage=rag.get_last_usage(),
    )


@app.post("/moderation/check")
async def moderation_check(body: ModerationBody):
    return check_message(body.text)


# =============================================================
# /CV/PARSE — Student CV upload (Rev 5 §5.2/§5.3)
# =============================================================
# No admin auth here (unlike /chunks, /documents) — this is a student-facing
# feature, and Node already authenticated the student via `protect` before
# forwarding the file. Same trust posture as /ask and /transcribe: Python
# trusts Node as the gatekeeper for this call rather than re-checking a JWT.

@app.post("/cv/parse")
async def cv_parse(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    import cv_parser

    try:
        profile = cv_parser.parse_cv(file.filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"CV parsing failed: {exc}")

    return profile.model_dump()


# =============================================================
# /SCRAPE — Rev 5 §9.2/§9.3 source scraping (Scholarships/Jobs/Events)
# =============================================================

@app.post("/internal/backup-chroma", dependencies=[Depends(verify_internal_secret)])
async def backup_chroma_endpoint():
    import backup_chroma

    result = backup_chroma.create_backup()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@app.get("/internal/health", dependencies=[Depends(verify_internal_secret)])
def internal_health_endpoint(tenant_slug: Optional[str] = None):
    # Sync handler on purpose — check_llm_health makes a real blocking LLM
    # call; see ask_question above.
    import health_check

    return {
        "chroma": health_check.check_chroma_health(tenant_slug),
        "llm": health_check.check_llm_health(),
    }


class ScrapeSiteRequest(BaseModel):
    tenant_slug: str
    sitemap_url: str
    allowed_domain: str
    base_url: str


@app.post("/internal/scrape-site", dependencies=[Depends(verify_internal_secret)])
def scrape_site_endpoint(request: ScrapeSiteRequest, background_tasks: BackgroundTasks):
    # Rev7 SaaS follow-up — self-service chatbot KB scraping. Returns
    # immediately (this can take many minutes for a real university site);
    # the actual crawl runs as a BackgroundTask, which Starlette runs in a
    # thread pool for a plain sync function like this one, so it doesn't
    # block other concurrent requests (e.g. real /ask calls). Node is told
    # the result later via content_scrape_service's own callback.
    import content_scrape_service

    background_tasks.add_task(
        content_scrape_service.run_tenant_content_scrape,
        request.tenant_slug,
        request.sitemap_url,
        request.allowed_domain,
        request.base_url,
    )
    return {"success": True, "message": "Scrape started"}


class ScrapeRequest(BaseModel):
    url: str
    type: str  # "scholarship" | "job" | "event"


@app.post("/scrape", dependencies=[Depends(verify_internal_secret)])
async def scrape(request: ScrapeRequest):
    import listing_scraper
    from url_safety import UnsafeUrlError

    try:
        result = await listing_scraper.scrape_listing(request.url, request.type)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=f"Unsafe URL: {exc}")
    except listing_scraper.ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


class EmbedListingRequest(BaseModel):
    tenant_slug: str
    listing_id: str
    listing_type: str
    data: dict


@app.post("/listings/embed", dependencies=[Depends(verify_internal_secret)])
async def embed_listing_endpoint(request: EmbedListingRequest):
    import listing_matching

    listing_matching.embed_listing(request.tenant_slug, request.listing_id, request.listing_type, request.data)
    return {"success": True}


@app.delete("/listings/embed/{listing_id}", dependencies=[Depends(verify_internal_secret)])
async def remove_listing_embedding_endpoint(listing_id: str, tenant_slug: str):
    import listing_matching

    listing_matching.remove_listing_embedding(tenant_slug, listing_id)
    return {"success": True}


class CheckDuplicateRequest(BaseModel):
    tenant_slug: str
    listing_type: str
    data: dict
    exclude_id: Optional[str] = None


@app.post("/listings/check-duplicate", dependencies=[Depends(verify_internal_secret)])
async def check_duplicate_endpoint(request: CheckDuplicateRequest):
    import listing_matching

    duplicate = listing_matching.find_duplicate(
        request.tenant_slug, request.listing_type, request.data, exclude_id=request.exclude_id
    )
    return {"duplicate": duplicate}


class ExplainMatchRequest(BaseModel):
    profile: dict
    listing: dict
    match_state: str
    gaps: list = []


@app.post("/listings/explain", dependencies=[Depends(verify_internal_secret)])
async def explain_match_endpoint(request: ExplainMatchRequest):
    import listing_explain

    try:
        explanation = listing_explain.explain_match(
            request.profile, request.listing, request.match_state, request.gaps
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Explanation generation failed: {exc}")
    return {"explanation": explanation}


# =============================================================
# /TRANSCRIBE — Local speech-to-text (replaces AssemblyAI)
# =============================================================

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form("en"),
):
    """Transcribe an uploaded audio file with local Whisper.

    Accepts webm / wav / mp3 / ogg / m4a. The audio is written to a temp
    file because faster-whisper reads from disk (it shells out to ffmpeg
    under the hood for non-WAV formats). `language` defaults to English —
    this is an English-only product, so we don't want Whisper auto-detecting
    the audio as Urdu/Hindi script for what is really an English utterance.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Preserve the original extension so ffmpeg picks the right demuxer.
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    elif file.content_type and "/" in file.content_type:
        suffix = "." + file.content_type.split("/", 1)[-1].split(";")[0].lower()
    if not suffix:
        suffix = ".webm"

    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="atriumdesk_audio_")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(content)
        result = transcribe_audio(tmp_path, language=language)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    if not result["success"]:
        raise HTTPException(status_code=422, detail=result.get("error") or "Transcription failed")
    return result


# =============================================================
# ADMIN — CHUNK CRUD
# =============================================================

def _ensure_collection(tenant_slug=None):
    client = database.get_chroma_client()
    name = config.get_collection_name(tenant_slug)
    try:
        col = client.get_collection(name=name)
    except Exception:
        col = client.create_collection(name=name)
    return col


def _get_embedding_model():
    if not hasattr(_get_embedding_model, "_model"):
        _get_embedding_model._model = database.get_embedding_model()
    return _get_embedding_model._model


@app.get("/chunks")
async def list_chunks(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    admin = verify_admin(authorization)
    return _list_chunks_impl(limit, offset, search, admin.get("tenant_slug"))


def _list_chunks_impl(limit: int, offset: int, search: Optional[str], tenant_slug=None):
    col = _ensure_collection(tenant_slug)
    total = col.count()

    # Chroma's get() returns all docs. For larger collections we'd want a
    # better store; for now we slice in Python.
    all_data = col.get(include=["documents", "metadatas"])
    ids = all_data.get("ids", [])
    docs = all_data.get("documents", [])
    metas = all_data.get("metadatas", []) or [{}] * len(ids)

    items = []
    for cid, text, meta in zip(ids, docs, metas):
        if search and search.lower() not in (text or "").lower():
            continue
        items.append({
            "id": cid,
            "source": (meta or {}).get("source", ""),
            "preview": (text or "")[:200],
            "length": len(text or ""),
        })

    filtered_total = len(items) if search else total
    sliced = items[offset:offset + limit]
    return {"success": True, "items": sliced, "total": filtered_total}


@app.get("/chunks/{chunk_id}")
async def get_chunk(chunk_id: str, authorization: Optional[str] = Header(default=None)):
    admin = verify_admin(authorization)
    col = _ensure_collection(admin.get("tenant_slug"))
    res = col.get(ids=[chunk_id], include=["documents", "metadatas"])
    if not res.get("ids"):
        raise HTTPException(status_code=404, detail="Chunk not found")
    return {
        "success": True,
        "chunk": {
            "id": res["ids"][0],
            "text": res["documents"][0],
            "source": (res["metadatas"][0] or {}).get("source", ""),
        },
    }


@app.post("/chunks")
async def add_chunk(body: ChunkBody, authorization: Optional[str] = Header(default=None)):
    admin = verify_admin(authorization)
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    tenant_slug = admin.get("tenant_slug")
    col = _ensure_collection(tenant_slug)
    model = _get_embedding_model()
    cid = f"admin_{uuid.uuid4().hex[:12]}"
    embedding = model.encode(body.text).tolist()
    col.add(
        ids=[cid],
        documents=[body.text],
        metadatas=[{"source": body.source or "admin", "chunk_id": cid}],
        embeddings=[embedding],
    )
    database.clear_keyword_cache(config.get_collection_name(tenant_slug))
    return {"success": True, "chunk": {"id": cid, "text": body.text, "source": body.source}}


@app.patch("/chunks/{chunk_id}")
async def update_chunk(chunk_id: str, body: ChunkUpdate, authorization: Optional[str] = Header(default=None)):
    admin = verify_admin(authorization)
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    tenant_slug = admin.get("tenant_slug")
    col = _ensure_collection(tenant_slug)
    existing = col.get(ids=[chunk_id], include=["metadatas"])
    if not existing.get("ids"):
        raise HTTPException(status_code=404, detail="Chunk not found")
    source = (existing["metadatas"][0] or {}).get("source", "admin")
    model = _get_embedding_model()
    embedding = model.encode(body.text).tolist()
    # ChromaDB supports update() with embeddings + documents
    col.update(
        ids=[chunk_id],
        documents=[body.text],
        embeddings=[embedding],
        metadatas=[{"source": source, "chunk_id": chunk_id}],
    )
    database.clear_keyword_cache(config.get_collection_name(tenant_slug))
    return {"success": True, "chunk": {"id": chunk_id, "text": body.text, "source": source}}


@app.delete("/chunks/{chunk_id}")
async def delete_chunk(chunk_id: str, authorization: Optional[str] = Header(default=None)):
    admin = verify_admin(authorization)
    tenant_slug = admin.get("tenant_slug")
    col = _ensure_collection(tenant_slug)
    existing = col.get(ids=[chunk_id])
    if not existing.get("ids"):
        raise HTTPException(status_code=404, detail="Chunk not found")
    col.delete(ids=[chunk_id])
    database.clear_keyword_cache(config.get_collection_name(tenant_slug))
    return {"success": True, "id": chunk_id}


# =============================================================
# ADMIN — DOCUMENT UPLOAD
# =============================================================

def _extract_structured_elements(filename: str, content: bytes) -> List[dict]:
    """Pull structural elements (heading vs paragraph) from an uploaded file.

    Returns a list of `{"tag": ..., "text": ...}` dicts the way `scraper.extract_structured`
    does for HTML, so the same `chunk_elements` packer can be reused for admin uploads.

    - PDFs: we walk pages, treating each page break as a fresh paragraph
      group. Lines that are short + all-caps are promoted to H2 (best-effort
      heading detection for typical academic/admin PDFs).
    - DOCX: python-docx exposes paragraph styles. We map `Heading 1..4`
      to h1..h4; everything else is a paragraph.
    - TXT: blank lines split paragraphs; an all-caps short line becomes h2.
    """
    name = (filename or "").lower()
    elements: List[dict] = []

    def is_probably_heading(line: str) -> bool:
        s = line.strip()
        if not s or len(s) > 90:
            return False
        if s.endswith((".", "?", "!", ":", ",")):
            return False
        letters = [c for c in s if c.isalpha()]
        if not letters:
            return False
        upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
        return upper_ratio > 0.7

    def push_paragraphs(text_block: str):
        for chunk in re.split(r"\n{2,}", text_block):
            chunk = chunk.strip()
            if not chunk:
                continue
            # If the very first line of the block looks like a heading,
            # split it off so it's tagged properly.
            lines = chunk.split("\n", 1)
            first = lines[0].strip()
            rest = lines[1].strip() if len(lines) > 1 else ""
            if is_probably_heading(first):
                elements.append({"tag": "h2", "text": first})
                if rest:
                    elements.append({"tag": "p", "text": " ".join(rest.split())})
            else:
                elements.append({"tag": "p", "text": " ".join(chunk.split())})

    if name.endswith(".txt"):
        text = content.decode("utf-8", errors="ignore")
        push_paragraphs(text)
        return elements

    if name.endswith(".pdf"):
        from pypdf import PdfReader  # For parsing and extracting text from uploaded PDF documents
        reader = PdfReader(io.BytesIO(content))
        for page in reader.pages:
            page_text = page.extract_text() or ""
            push_paragraphs(page_text)
        return elements

    if name.endswith(".docx"):
        import docx  # For parsing and extracting text and headers from uploaded DOCX documents
        doc = docx.Document(io.BytesIO(content))
        for p in doc.paragraphs:
            text = (p.text or "").strip()
            if not text:
                continue
            style = (p.style.name if p.style else "") or ""
            if style.startswith("Heading"):
                # "Heading 1" .. "Heading 4" -> h1..h4
                digit = next((c for c in style if c.isdigit()), "2")
                level = min(int(digit), 4)
                elements.append({"tag": f"h{level}", "text": text})
            else:
                elements.append({"tag": "p", "text": text})
        return elements

    raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOCX, or TXT.")


def _chunk_uploaded_document(filename: str, content: bytes) -> List[dict]:
    """Return [{"text": ..., "heading": ...}, ...] using the same structural
    pipeline the scraper uses. One chunk = one self-contained topic block.
    """
    elements = _extract_structured_elements(filename, content)
    if not elements:
        return []
    from scraper import chunk_elements  # For applying structural paragraph grouping/chunking to document elements, imported lazily to keep API startup fast
    return chunk_elements(elements, page_title=os.path.splitext(os.path.basename(filename or ""))[0])


@app.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    source: Optional[str] = Form(None),
    authorization: Optional[str] = Header(default=None),
):
    admin = verify_admin(authorization)
    tenant_slug = admin.get("tenant_slug")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    structured = _chunk_uploaded_document(file.filename, content)
    if not structured:
        raise HTTPException(status_code=400, detail="Document produced no chunks")

    col = _ensure_collection(tenant_slug)
    model = _get_embedding_model()
    src = source or file.filename or "upload"

    ids, docs, metas, embeds = [], [], [], []
    for piece in structured:
        cid = f"doc_{uuid.uuid4().hex[:12]}"
        ids.append(cid)
        docs.append(piece["text"])
        metas.append({
            "source": src,
            "chunk_id": cid,
            "filename": file.filename or "",
            "heading": piece.get("heading", ""),
        })
        embeds.append(model.encode(piece["text"]).tolist())

    col.add(ids=ids, documents=docs, metadatas=metas, embeddings=embeds)
    database.clear_keyword_cache(config.get_collection_name(tenant_slug))

    return {
        "success": True,
        "filename": file.filename,
        "source": src,
        "chunks_added": len(ids),
    }


# =============================================================
# SERVER STARTUP
# =============================================================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
