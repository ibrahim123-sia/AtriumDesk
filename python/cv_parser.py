"""
========================================================
CV_PARSER.PY - Student CV upload & structured extraction
========================================================

Rev 5 §5.2/§5.3: a student uploads a CV (PDF/DOCX); we extract plain text,
strip personally-identifying details BEFORE any of it reaches an external
LLM API, then use Instructor (Pydantic-validated LLM extraction) to pull out
the fields the matching engine actually uses. The raw file is never written
to disk here — Node forwards it as in-memory bytes and this module never
persists anything either.

PII policy (Rev 5 §5.3's table, applied literally):
  REMOVE: phone numbers, email addresses, physical addresses, CNIC/ID
          numbers, date of birth, photos (moot — we only ever look at
          extracted TEXT, so an embedded photo never becomes text at all).
  KEEP:   degree, university, graduation year, CGPA, skills, projects,
          work experience, certifications, languages, name.
"""

import io
import re
from typing import List, Optional

import instructor
from pydantic import BaseModel, Field

import config  # Local application configuration parameters


# =============================================================
# TEXT EXTRACTION
# =============================================================

def extract_plain_text(filename: str, content: bytes) -> str:
    """Pull plain text out of a PDF or DOCX CV. Unlike
    api.py's `_extract_structured_elements` (built for the admin
    knowledge-base uploader), this doesn't need heading detection or
    chunking — the LLM reads the whole document at once.
    """
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)

    if name.endswith(".docx"):
        import docx

        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())

    raise ValueError("Unsupported file type. Use PDF or DOCX.")


# =============================================================
# PII STRIPPING — runs BEFORE any text reaches an external LLM API
# =============================================================

_PHONE_RE = re.compile(r"(\+?\d{1,3}[\s\-]?)?(\(?\d{2,4}\)?[\s\-]?){2,4}\d{3,4}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Pakistani CNIC: NNNNN-NNNNNNN-N
_CNIC_RE = re.compile(r"\b\d{5}-\d{7}-\d\b")
_DOB_LABEL_RE = re.compile(
    r"(date\s*of\s*birth|d\.?o\.?b\.?)\s*[:\-]?\s*[^\n]{0,30}", re.IGNORECASE
)
_ADDRESS_LABEL_RE = re.compile(
    r"(address|residential\s*address|home\s*address)\s*[:\-]\s*[^\n]{0,120}", re.IGNORECASE
)


def strip_pii(text: str) -> str:
    """Remove phone numbers, emails, CNIC numbers, DOB, and labeled address
    lines. Best-effort — free-text physical addresses without a leading
    label are the hardest case to catch reliably with regex alone, so this
    is a defensible-but-not-airtight pass, same class of trade-off as any
    regex-based PII scrubber. Everything Rev 5 §5.3 says to KEEP (degree,
    university, grad year, CGPA, skills, projects, work exp, certs,
    languages, name) is untouched — none of those match these patterns.
    """
    cleaned = _EMAIL_RE.sub("[redacted]", text)
    cleaned = _CNIC_RE.sub("[redacted]", cleaned)
    cleaned = _DOB_LABEL_RE.sub("", cleaned)
    cleaned = _ADDRESS_LABEL_RE.sub("", cleaned)
    cleaned = _PHONE_RE.sub("[redacted]", cleaned)
    return cleaned


# =============================================================
# STRUCTURED EXTRACTION (Instructor + Pydantic schema)
# =============================================================

class CVProfile(BaseModel):
    name: Optional[str] = Field(None, description="Candidate's full name, if present in the text")
    degree_program: Optional[str] = Field(None, description="e.g. 'BS Computer Science'")
    university: Optional[str] = None
    graduation_year: Optional[int] = None
    cgpa: Optional[float] = Field(None, description="On whatever scale the CV states, e.g. 3.4 out of 4.0")
    skills: List[str] = Field(default_factory=list)
    projects: List[str] = Field(default_factory=list, description="Short project titles/descriptions")
    work_experience: List[str] = Field(
        default_factory=list, description="Short role summaries, e.g. 'Backend Intern at X, 3 months'"
    )
    certifications: List[str] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)


_EXTRACTION_SYSTEM_PROMPT = (
    "You extract structured data from a student's CV/resume text. "
    "Only use information explicitly present in the text — never invent or "
    "guess a value. Leave a field empty/null if it isn't clearly stated. "
    "Some personal details (phone, email, address, ID numbers, date of "
    "birth) have already been redacted before this text reached you; do "
    "not attempt to reconstruct or comment on them."
)


def _extraction_client():
    """One Instructor-wrapped Groq client per configured key, tried in turn —
    same multi-key-failover principle as rag.py's `_get_groq_client`/
    `_llm_chat_groq` (Rev 5 §7.3: "rag.py's existing multi-key failover
    client code is directly reusable for extraction calls"). Kept as a
    separate small implementation here rather than importing rag.py's
    private functions directly, since those are shaped for plain chat
    completions, not Instructor's `response_model=` structured-output call.
    """
    keys = config.GROQ_API_KEYS
    if not keys:
        raise RuntimeError("No GROQ_API_KEY configured for CV extraction.")
    return keys


def parse_cv(filename: str, content: bytes) -> CVProfile:
    """Full pipeline: extract text -> strip PII -> LLM structured extraction.
    Raises on failure (caller returns an error to the client — never a
    silently-empty/wrong profile)."""
    raw_text = extract_plain_text(filename, content)
    if not raw_text or not raw_text.strip():
        raise ValueError("Could not extract any text from this file.")

    safe_text = strip_pii(raw_text)

    keys = _extraction_client()
    errors = []
    for idx, api_key in enumerate(keys):
        try:
            client = instructor.from_provider(f"groq/{config.GROQ_MODEL}", api_key=api_key)
            result = client.chat.completions.create(
                response_model=CVProfile,
                messages=[
                    {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": safe_text[:12000]},  # generous cap; CVs are short
                ],
            )
            return result
        except Exception as exc:
            errors.append(f"key#{idx + 1}: {exc}")
            continue

    raise RuntimeError(f"CV extraction failed on all configured keys: {'; '.join(errors)}")
