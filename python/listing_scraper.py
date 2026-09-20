"""
========================================================
LISTING_SCRAPER.PY - Scholarship/Job/Event source scraping (Rev 5 §9.2/§9.3)
========================================================

Separate from scraper.py (which is MAJU/WordPress-specific and feeds the
chatbot's own knowledge base) — this module fetches arbitrary third-party
listing pages (scholarship portals, company careers pages, event pages),
using Crawl4AI for JS-rendered content (verified locally in Phase 0) rather
than scraper.py's plain requests+BeautifulSoup, since these external sites
can't be assumed to be static HTML.

Cross-service design (§9.3): Node owns all state (Source rows, Listing
docs, frequency/failure counting); this module is a stateless
fetch-and-extract executor. It never talks to Mongo — it only returns
structured data (via Instructor+Pydantic per §5.2's precedent from CV
parsing) and a content hash, and lets api.py's /scrape endpoint or the
background scheduler hand that back to Node.

SSRF safety: `url_safety.validate_redirect_chain` runs BEFORE Crawl4AI ever
touches the URL — Python is the authoritative SSRF check per §9.6, since
only Python sees the redirect chain the URL might resolve through.
"""

import hashlib
from typing import List, Optional

import instructor
from pydantic import BaseModel, Field

import config
from url_safety import validate_redirect_chain, UnsafeUrlError


# =============================================================
# PER-TYPE EXTRACTION SCHEMAS — field names match the Node discriminator
# schemas in server/models/Listing.js exactly, so `data` can be spread
# directly into `Model.create()` on the Node side with no field mapping.
# =============================================================

class ScholarshipExtract(BaseModel):
    title: str = Field(..., min_length=1, description="Scholarship/program name")
    organization: str = Field(..., min_length=1, description="Offering university or organization")
    description: str = Field("", description="Short summary of the scholarship")
    officialLink: str = Field("", description="URL to the official scholarship page")
    deadline: Optional[str] = Field(None, description="Application deadline, ISO date (YYYY-MM-DD) if stated")
    country: str = Field("", description="Country where the program is held")
    degreeLevel: str = Field("other", description="One of: bachelors, masters, phd, other")
    fundingType: str = Field("other", description="One of: fully_funded, partial, self_funded, other")
    eligibilityCriteria: str = Field("", description="Eligibility criteria as stated on the page")
    requiredDocuments: List[str] = Field(default_factory=list)
    languageRequirements: str = Field("", description="e.g. IELTS 6.5 or equivalent")
    cgpaRequirement: Optional[float] = None
    ieltsRequirement: Optional[float] = None
    toeflRequirement: Optional[float] = None


class JobExtract(BaseModel):
    title: str = Field(..., min_length=1, description="Job title")
    organization: str = Field(..., min_length=1, description="Hiring company")
    description: str = Field("", description="Short summary of the role")
    officialLink: str = Field("", description="URL to apply")
    deadline: Optional[str] = Field(None, description="Application deadline, ISO date, if stated")
    workMode: str = Field("onsite", description="One of: remote, onsite, hybrid")
    location: str = Field("", description="City/region")
    locationRestriction: str = Field("", description="e.g. 'US-based only', if stated")
    experienceLevel: str = Field("", description="Extracted from the JD body, not just the title — e.g. '0-2 years', 'senior'")
    isFreshGradFriendly: bool = Field(False, description="True if the JD mentions internship/junior/associate/fresh graduate")
    skillsRequired: List[str] = Field(default_factory=list)


class EventExtract(BaseModel):
    title: str = Field(..., min_length=1, description="Event name")
    organization: str = Field(..., min_length=1, description="Hosting department/organization")
    description: str = Field("", description="Short summary of the event")
    officialLink: str = Field("", description="URL to the event page, if any")
    date: str = Field(..., min_length=1, description="Event date, ISO date (YYYY-MM-DD)")
    location: str = Field("", description="Venue or 'online'")


EXTRACT_SCHEMAS = {
    "scholarship": ScholarshipExtract,
    "job": JobExtract,
    "event": EventExtract,
}

_EXTRACTION_SYSTEM_PROMPT = (
    "You extract structured listing data from a scraped web page's content. "
    "Only use information explicitly present in the text — never invent or "
    "guess a value. Leave a field at its default/empty value if the page "
    "does not state it clearly."
)


class ScrapeError(Exception):
    """Raised on any failure in the fetch->extract pipeline. The caller
    (api.py's /scrape endpoint, or the background scheduler) reports this
    back to Node as a failed run rather than letting it propagate raw."""


class ListingGoneError(ScrapeError):
    """Rev 5 §7.4 delisting detection, adapted for this codebase's
    one-listing-per-source model (see the note in server/services/
    scheduler.js's delisting section — §7.4 as written assumes many
    listings extracted per source scrape and diffs an identity set; this
    codebase's sources are individually-linked single postings instead).
    Raised specifically when the fetch itself confirms the page is gone
    (HTTP 404/410) — a much stronger "this listing was taken down" signal
    than a generic timeout/extraction failure, which could just as easily
    mean "the site had a bad minute." Node tracks this distinctly and only
    marks a listing delisted after two consecutive confirmed-gone runs."""


def _hash_content(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def _fetch_markdown(url):
    """Fetches a URL with JS rendering via Crawl4AI, returns cleaned markdown
    text. Imported lazily so environments without crawl4ai installed can
    still import this module for its Pydantic schemas."""
    from crawl4ai import AsyncWebCrawler

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url)
        if result.status_code in (404, 410):
            raise ListingGoneError(f"{url} returned HTTP {result.status_code} — page no longer exists")
        if not result.success:
            raise ScrapeError(f"Crawl4AI failed to fetch {url}: {result.error_message}")
        text = (result.markdown or "").strip()
        if not text:
            raise ScrapeError(f"No content extracted from {url}")
        return text


def _extract_structured(text, listing_type):
    schema = EXTRACT_SCHEMAS.get(listing_type)
    if schema is None:
        raise ScrapeError(f"Unknown listing type: {listing_type!r}")

    keys = config.GROQ_API_KEYS
    if not keys:
        raise ScrapeError("No GROQ_API_KEY configured for listing extraction.")

    errors = []
    for idx, api_key in enumerate(keys):
        try:
            client = instructor.from_provider(f"groq/{config.GROQ_MODEL}", api_key=api_key)
            result = client.chat.completions.create(
                response_model=schema,
                messages=[
                    {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": text[:12000]},
                ],
                # Instructor feeds the Pydantic validation error back to the
                # LLM and retries — self-corrects the occasional empty
                # required field (e.g. title) rather than failing the whole
                # key attempt over one bad generation.
                max_retries=2,
            )
            return result
        except Exception as exc:
            errors.append(f"key#{idx + 1}: {exc}")
            continue

    raise ScrapeError(f"Listing extraction failed on all configured keys: {'; '.join(errors)}")


async def scrape_listing(url, listing_type):
    """Full pipeline: SSRF-validate -> fetch (Crawl4AI) -> extract (Instructor)
    -> hash. Returns {"data": dict, "hash": str}. Raises ScrapeError or
    UnsafeUrlError on failure — never returns a partial/silent result."""
    try:
        safe_url = validate_redirect_chain(url)
    except UnsafeUrlError as exc:
        raise ScrapeError(f"URL failed SSRF validation: {exc}") from exc

    text = await _fetch_markdown(safe_url)
    content_hash = _hash_content(text)
    extracted = _extract_structured(text, listing_type)
    data = extracted.model_dump()
    # The URL we actually navigated to is always the correct "official
    # link" for THIS listing — always wins over whatever the LLM extracted
    # from page content (e.g. a generic "back to careers page" link it
    # spotted in the text), which is guessing, not ground truth.
    data["officialLink"] = safe_url
    return {"data": data, "hash": content_hash}
