"""
========================================================
SCRAPER.PY - Web Scraping, Cleaning & Chunking Pipeline
========================================================

Pipeline:
  Sitemap XML  ->  URLs  ->  Raw HTML  ->  Structured content  ->  Context-aware chunks  ->  JSON

The key idea: chunks are units of *information*, not units of *characters*.
Each chunk is one self-contained topic block (a heading + its paragraphs,
or a coherent paragraph group when no heading is available). Garbage like
WordPress author archive widgets is filtered both at the page level (URL
patterns + DOM selectors) and at the chunk level (sentence + capital-word
ratio heuristics).
"""

import os             # For handling filesystem paths and directories for saving output
import re             # For regular expression cleanup of scraped text and formatting
import json           # For reading and writing the JSON arrays of pages and chunks
import concurrent.futures  # For concurrent crawling/scraping of multiple URLs using thread pools
from urllib.parse import urlparse  # For hostname-safe URL comparisons in should_include_url
import requests       # For fetching web content and sitemap files from the target website
from bs4 import BeautifulSoup, NavigableString, Tag  # For parsing HTML and traversing the DOM tree
from tqdm import tqdm  # For displaying progress meters during page crawling and processing

import config         # Local application configuration parameters
from url_safety import validate_redirect_chain, UnsafeUrlError  # SSRF validation (§9.6) — every fetch of an admin-supplied URL must go through this, not bare requests.get


# Tune scrape concurrency. jinnah.edu sits on shared hosting; 15-20
# concurrent connections is the safe ceiling — higher risks rate-limits.
SCRAPE_WORKERS = 16


# =============================================================
# URL DISCOVERY
# =============================================================

def should_include_url(url, allowed_domain):
    """Decide whether a URL is worth scraping.

    Rejects: wrong domain, blacklisted extensions, listing pages (author
    archives, tag indexes, paginated feeds — none of which contain
    primary information).
    """
    url_lower = url.lower().strip()

    # A substring check here ("allowed_domain not in url_lower") would let
    # an admin-supplied allowed_domain of e.g. "maju.edu.pk" also match
    # "notmaju.edu.pk.evil.com" or a query string containing the domain as
    # text — compare against the URL's actual hostname instead.
    hostname = (urlparse(url_lower).hostname or "")
    allowed = allowed_domain.lower().strip()
    if hostname != allowed and not hostname.endswith("." + allowed):
        return False

    for ext in config.BLACKLIST_EXTENSIONS:
        if url_lower.endswith(ext):
            return False

    for keyword in config.BLACKLIST_URL_KEYWORDS:
        if keyword in url_lower:
            return False

    # New: skip WordPress-style listing pages entirely.
    for pattern in config.LISTING_URL_PATTERNS:
        if pattern in url_lower:
            return False

    if not url_lower.endswith((".html", ".htm", ".php", ".aspx")):
        last_part = url_lower.split("/")[-1]
        if "." in last_part:
            return False

    if not url_lower.startswith(("http://", "https://")):
        return False

    return True


def _safe_get(url, **kwargs):
    """SSRF-validated GET (§9.6) — validates the full redirect chain first,
    then fetches the already-validated final URL with allow_redirects=False
    so `requests` never follows a hop this code hasn't seen. Every fetch of
    an admin-supplied or admin-reachable URL (the sitemap itself, every
    sub-sitemap link, every page) must go through this, not a bare
    requests.get — a validated top-level sitemap_url can still list or
    redirect to an internal address at fetch time otherwise."""
    safe_url = validate_redirect_chain(url)
    return requests.get(safe_url, allow_redirects=False, **kwargs)


def get_urls_from_sitemap(sitemap_url, allowed_domain):
    print(f"  Fetching sitemap: {sitemap_url}")
    response = _safe_get(sitemap_url, timeout=config.REQUEST_TIMEOUT)
    soup = BeautifulSoup(response.text, "xml")

    sitemap_links = [loc.text for loc in soup.find_all("loc")]
    all_urls = []

    for link in sitemap_links:
        try:
            res = _safe_get(link, timeout=config.REQUEST_TIMEOUT)
            sub_soup = BeautifulSoup(res.text, "xml")
            page_urls = [loc.text for loc in sub_soup.find_all("loc")]

            if page_urls:
                for url in page_urls:
                    if should_include_url(url, allowed_domain):
                        all_urls.append(url)
            else:
                if should_include_url(link, allowed_domain):
                    all_urls.append(link)
        except UnsafeUrlError as exc:
            print(f"  Skipping sub-sitemap link (SSRF check failed): {link} — {exc}")
        except Exception:
            if should_include_url(link, allowed_domain):
                all_urls.append(link)

    return list(set(all_urls))


def get_all_urls():
    all_urls = []
    for website in config.WEBSITES:
        print(f"\nDiscovering URLs for: {website['name']}")
        urls = get_urls_from_sitemap(
            sitemap_url=website["sitemap_url"],
            allowed_domain=website["allowed_domain"],
        )
        print(f"  Found {len(urls)} URLs from {website['name']}")
        all_urls.extend(urls)

    unique_urls = list(set(all_urls))
    print(f"\nTotal unique URLs: {len(unique_urls)}")
    return unique_urls


# =============================================================
# CONTENT EXTRACTION - only the article body, not the whole page
# =============================================================

# CSS selectors that typically contain the main article content,
# ordered by preference. We pick the first one that exists AND has
# meaningful text.
MAIN_CONTENT_SELECTORS = [
    "article",
    "main",
    ".entry-content",
    ".post-content",
    ".page-content",
    ".content-area",
    "#content",
    "#main-content",
    "#primary",
]


def _strip_unwanted(root):
    """Mutate `root` to remove tags / classes / ids we never want."""
    if root is None:
        return

    for tag_name in config.UNWANTED_HTML_TAGS:
        for el in root.find_all(tag_name):
            el.decompose()

    for class_name in config.UNWANTED_CSS_CLASSES:
        for el in root.find_all(class_=re.compile(rf"\b{re.escape(class_name)}\b", re.I)):
            el.decompose()

    for el_id in config.UNWANTED_HTML_IDS:
        el = root.find(id=el_id)
        if el:
            el.decompose()


def _pick_main_content(soup):
    """Return the BeautifulSoup node that holds the real article body.

    Tries known content selectors in order, falling back to `<body>` if
    nothing matches. Anything with < 200 chars of text is treated as a
    near-empty wrapper and skipped.
    """
    for sel in MAIN_CONTENT_SELECTORS:
        try:
            if sel.startswith("."):
                node = soup.find(class_=sel[1:])
            elif sel.startswith("#"):
                node = soup.find(id=sel[1:])
            else:
                node = soup.find(sel)
        except Exception:
            node = None
        if node and len(node.get_text(" ", strip=True)) > 200:
            return node

    return soup.body or soup


def extract_structured(url):
    """Fetch a page and return a flat list of structural elements.

    Each element is a dict {"tag": ..., "text": ...}. Tags we keep:
      - h1..h4    (section headings)
      - p         (paragraphs)
      - li        (list items)
      - td        (table cells — bios, fee tables, etc.)
      - dt, dd    (definition lists)

    Returns:
        (title, elements)   or   (None, [])  on failure.
    """
    try:
        response = _safe_get(url, timeout=config.REQUEST_TIMEOUT)
        soup = BeautifulSoup(response.text, "lxml")
    except Exception as exc:
        print(f"  Error fetching {url}: {exc}")
        return None, []

    # Quick reject: pages whose <title> screams "archive" / "search results"
    title_tag = soup.find("title")
    page_title = title_tag.get_text(strip=True) if title_tag else ""
    if page_title:
        low = page_title.lower()
        if any(w in low for w in ["archives -", "category:", "tag:", "author:", "search results"]):
            return None, []

    main = _pick_main_content(soup)
    _strip_unwanted(main)

    keep_tags = ("h1", "h2", "h3", "h4", "p", "li", "td", "dt", "dd")
    elements = []
    for el in main.find_all(keep_tags):
        text = el.get_text(" ", strip=True)
        text = " ".join(text.split())
        if not text:
            continue
        if len(text) < 3:
            continue
        elements.append({"tag": el.name, "text": text})

    return page_title, elements


# =============================================================
# JUNK DETECTION - reject "list of names/dates" style chunks
# =============================================================

EMAIL_REGEX = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
PHONE_REGEX = r"(\+?\d{1,3}[\s\-]?)?\d{7,15}"
_MONTH = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
# Catch both "January 10, 2023" and "10 January 2023" / "11 December, 2025"
DATE_REGEX = rf"\b(?:{_MONTH}\s+\d{{1,2}},?\s+\d{{4}}|\d{{1,2}}\s+{_MONTH},?\s+\d{{4}})\b"
# Words that are entirely uppercase letters, length >= 2 (e.g. "MAHAM", "ATIQUE")
ALLCAPS_WORD_REGEX = r"\b[A-Z]{2,}\b"


def contains_important_info(text):
    if re.search(EMAIL_REGEX, text):
        return True
    if re.search(PHONE_REGEX, text):
        return True
    low = text.lower()
    for kw in config.IMPORTANT_KEYWORDS:
        if len(kw) <= 3:
            if re.search(r"\b" + re.escape(kw) + r"\b", low):
                return True
        else:
            if kw in low:
                return True
    return False


def is_junk_chunk(text):
    """Heuristic: does this look like real prose or a widget dump?

    Real chunks have:
      - actual sentences ending in periods
      - few all-caps name tokens
      - dates only where they belong (not 3+ per chunk)
      - proper-noun ratio under control

    Widget junk looks like:
      "MAHAM ATIQUE Rashid_Mahmood AYESHA SHAHZAD January 10, 2023 ..."
    — lots of ALL CAPS names, date stamps, no periods, just questions.
    """
    if not text:
        return True

    stripped = text.strip()
    if len(stripped) < 30:
        return not contains_important_info(stripped)

    words = stripped.split()
    word_count = len(words)

    # Rule 1: 3+ date stamps and they make up a big chunk of the words ->
    # "recent posts" widget.
    date_hits = len(re.findall(DATE_REGEX, stripped))
    if date_hits >= 3:
        return not contains_important_info(stripped)

    # Rule 2: many ALL-CAPS words clustered together = name list.
    allcaps_hits = len(re.findall(ALLCAPS_WORD_REGEX, stripped))
    if allcaps_hits >= 4 and allcaps_hits * 8 > word_count:
        return not contains_important_info(stripped)

    # Rule 3: counts of sentence-ending punctuation. We split periods
    # vs questions/exclamations because post-title lists ("Why is X
    # important?") fake the sentence count with question marks.
    periods = stripped.count(".")
    qbang = stripped.count("?") + stripped.count("!")
    sentence_marks = periods + qbang

    if sentence_marks == 0:
        return not contains_important_info(stripped)

    # Rule 4: 50+ words but no real periods = title list.
    if word_count >= 50 and periods == 0:
        return not contains_important_info(stripped)

    # Rule 5: sentence density too low for real prose.
    if word_count > 60 and sentence_marks * 60 < word_count:
        return not contains_important_info(stripped)

    # Rule 6: dominated by Title Case / proper nouns and short on periods.
    if word_count >= 12:
        capitalized = sum(
            1 for w in words
            if w and w[0].isalpha() and w[0].isupper()
        )
        if capitalized / word_count > 0.55 and periods <= 1:
            return not contains_important_info(stripped)

    return False


# =============================================================
# STRUCTURAL CHUNKING - heading-aware, paragraph-safe
# =============================================================

HEADING_TAGS = {"h1", "h2", "h3", "h4"}


def _split_paragraph(text, max_size):
    """Break an over-long paragraph on sentence boundaries.

    Used only when a single paragraph blows past MAX_CHUNK_SIZE — rare
    in practice. We never cut mid-sentence; if no sentence boundary
    exists in the window, we accept an oversized chunk rather than
    butcher it.
    """
    if len(text) <= max_size:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    out = []
    buf = ""
    for s in sentences:
        if len(buf) + len(s) + 1 > max_size and buf:
            out.append(buf.strip())
            buf = s
        else:
            buf = (buf + " " + s).strip() if buf else s
    if buf:
        out.append(buf.strip())
    return out


def chunk_elements(elements, page_title=None):
    """Pack structural elements into context-coherent chunks.

    Rules:
      - A new chunk opens whenever an H1/H2/H3 is seen.
      - Within a section, paragraphs are packed until TARGET_CHUNK_SIZE.
      - The current heading is prepended to every chunk so the embedding
        captures the topic ("Admission Requirements\n\n<paragraph>").
      - A chunk smaller than MIN_CHUNK_LENGTH is merged into the next one.
      - A single paragraph longer than MAX_CHUNK_SIZE is sentence-split.
    """
    chunks = []
    section_heading = None
    buf = []
    buf_size = 0

    def flush():
        nonlocal buf, buf_size
        if not buf:
            return
        text = "\n\n".join(buf).strip()
        if len(text) >= config.MIN_CHUNK_LENGTH or contains_important_info(text):
            chunks.append({"heading": section_heading or page_title or "", "text": text})
        buf = []
        buf_size = 0

    for el in elements:
        tag = el["tag"]
        text = el["text"]

        if tag in HEADING_TAGS:
            flush()
            section_heading = text
            # Heading itself isn't a chunk yet — it'll be the topic line
            # of the next chunk we open.
            buf = [text]
            buf_size = len(text)
            continue

        # Oversized single paragraph -> sentence split, each piece its
        # own chunk (still tagged with the section heading)
        if len(text) > config.MAX_CHUNK_SIZE:
            flush()
            for piece in _split_paragraph(text, config.MAX_CHUNK_SIZE):
                topic = section_heading or page_title or ""
                body = f"{topic}\n\n{piece}" if topic else piece
                chunks.append({"heading": topic, "text": body.strip()})
            continue

        # Would adding this element bust the target? Flush first.
        if buf_size + len(text) > config.TARGET_CHUNK_SIZE and buf_size >= config.MIN_CHUNK_LENGTH:
            flush()
            if section_heading:
                buf = [section_heading, text]
                buf_size = len(section_heading) + len(text)
            else:
                buf = [text]
                buf_size = len(text)
            continue

        buf.append(text)
        buf_size += len(text)

    flush()

    # Final pass: drop chunks that look like junk widgets
    cleaned = []
    for c in chunks:
        if is_junk_chunk(c["text"]):
            continue
        cleaned.append(c)
    return cleaned


# =============================================================
# LEGACY API - kept so existing callers don't break
# =============================================================

def scrape_page(url):
    """Return a single flat string of the cleaned page (legacy).

    New code should call `extract_structured()` instead, which preserves
    heading/paragraph boundaries. This shim joins them with double
    newlines so the result is at least readable.
    """
    _title, elements = extract_structured(url)
    if not elements:
        return ""
    return "\n\n".join(e["text"] for e in elements)


def is_garbage_text(text):
    if not text:
        return True
    sample = text[:1000]
    weird = sum(1 for c in sample if ord(c) > 127)
    if len(sample) > 0 and (weird / len(sample)) > 0.2:
        return True
    if "\x00" in text[:500] or "�" in text[:500]:
        return True
    if len(text) < config.MIN_TEXT_LENGTH and not contains_important_info(text):
        return True
    return False


def clean_text(text):
    """Legacy text-level filter. Prefer per-chunk `is_junk_chunk`."""
    if is_garbage_text(text):
        return None
    if len(text) >= config.MIN_TEXT_LENGTH:
        return text
    if contains_important_info(text):
        return text
    return None


def chunk_text(text):
    """Legacy entry point: char-based chunking with sentence-safe ends.

    Only used by old callers. The pipeline now goes
    extract_structured -> chunk_elements which is much smarter.
    """
    if not text or not text.strip():
        return []

    size = config.TARGET_CHUNK_SIZE
    overlap = config.CHUNK_OVERLAP
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            original = end
            while end > start and text[end] not in [".", "!", "?", "\n"]:
                end -= 1
            if end <= start + size // 2:
                end = original
        chunk = text[start:end].strip()
        if chunk and len(chunk) >= config.MIN_CHUNK_LENGTH and not is_junk_chunk(chunk):
            chunks.append(chunk)
        start = end - overlap
        if start <= 0 or start >= end:
            start = end
    return chunks


# =============================================================
# PERSISTENCE
# =============================================================

def save_urls(urls):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.URLS_FILE, "w", encoding="utf-8") as f:
        for url in urls:
            f.write(url + "\n")
    print(f"  Saved {len(urls)} URLs to {config.URLS_FILE}")


def save_pages(pages):
    with open(config.CLEAN_PAGES_FILE, "w", encoding="utf-8") as f:
        json.dump(pages, f, indent=2, ensure_ascii=False)
    print(f"  Saved {len(pages)} pages to {config.CLEAN_PAGES_FILE}")


def save_chunks(chunks):
    with open(config.CHUNKS_FILE, "w", encoding="utf-8") as f:
        json.dump(chunks, f, indent=2, ensure_ascii=False)
    print(f"  Saved {len(chunks)} chunks to {config.CHUNKS_FILE}")


def load_urls():
    if os.path.exists(config.URLS_FILE):
        with open(config.URLS_FILE, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    return []


def load_pages():
    if os.path.exists(config.CLEAN_PAGES_FILE):
        with open(config.CLEAN_PAGES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def load_chunks():
    if os.path.exists(config.CHUNKS_FILE):
        with open(config.CHUNKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


# =============================================================
# PIPELINE
# =============================================================

def run_full_pipeline():
    """Fresh scrape: URLs -> structured pages -> context-aware chunks."""
    print("=" * 60)
    print("SCRAPING PIPELINE - FULL RUN (structural)")
    print("=" * 60)

    os.makedirs(config.DATA_DIR, exist_ok=True)

    print("\nStep 1: Discovering URLs from sitemaps...")
    urls = get_all_urls()
    save_urls(urls)

    print(f"\nStep 2: Extracting structured content from {len(urls)} pages (workers={SCRAPE_WORKERS})...")
    pages = []
    skipped = 0

    def _fetch_one(url):
        try:
            title, elements = extract_structured(url)
        except Exception as exc:
            return url, None, [], str(exc)
        return url, title, elements, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=SCRAPE_WORKERS) as pool:
        futures = {pool.submit(_fetch_one, u): u for u in urls}
        for fut in tqdm(concurrent.futures.as_completed(futures), total=len(futures), desc="Scraping"):
            url, title, elements, err = fut.result()
            if err or not elements:
                skipped += 1
                continue
            if not any(len(e["text"]) > 40 for e in elements):
                skipped += 1
                continue
            pages.append({"url": url, "title": title or "", "elements": elements})

    save_pages(pages)
    print(f"  Kept {len(pages)} pages, skipped {skipped}")

    print(f"\nStep 3: Building context-aware chunks from {len(pages)} pages...")
    all_chunks = []
    for page in tqdm(pages, desc="Chunking"):
        page_chunks = chunk_elements(page["elements"], page_title=page.get("title"))
        for c in page_chunks:
            all_chunks.append({
                "text": c["text"],
                "source": page["url"],
                "heading": c.get("heading", ""),
                "page_title": page.get("title", ""),
            })

    save_chunks(all_chunks)

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print(f"  URLs:    {len(urls)}")
    print(f"  Pages:   {len(pages)}")
    print(f"  Chunks:  {len(all_chunks)}")
    if all_chunks:
        avg = sum(len(c["text"]) for c in all_chunks) / len(all_chunks)
        print(f"  Avg size: {avg:.0f} chars")
    print("=" * 60)
    return all_chunks


def run_rechunk():
    """Re-chunk without re-fetching. Reads pages.json, rebuilds chunks.json.

    Supports both the new structured page format (pages have `elements`)
    and the legacy flat-text format (pages have `content`) — useful when
    you upgrade the chunker but haven't re-scraped yet.
    """
    print("=" * 60)
    print("RE-CHUNKING EXISTING DATA")
    print("=" * 60)

    pages = load_pages()
    if not pages:
        print("No existing pages found. Run 'scrape' first.")
        return

    print(f"  Loaded {len(pages)} pages")

    all_chunks = []
    for page in tqdm(pages, desc="Chunking"):
        if "elements" in page and page["elements"]:
            page_chunks = chunk_elements(page["elements"], page_title=page.get("title"))
            for c in page_chunks:
                all_chunks.append({
                    "text": c["text"],
                    "source": page["url"],
                    "heading": c.get("heading", ""),
                    "page_title": page.get("title", ""),
                })
        else:
            # Legacy: flat string in `content`. Best-effort: split on
            # double newlines and re-treat each block as a paragraph.
            content = page.get("content", "")
            if not content:
                continue
            paragraphs = [p.strip() for p in re.split(r"\n{2,}", content) if p.strip()]
            elements = [{"tag": "p", "text": p} for p in paragraphs]
            page_chunks = chunk_elements(elements, page_title=page.get("title", ""))
            for c in page_chunks:
                all_chunks.append({
                    "text": c["text"],
                    "source": page["url"],
                    "heading": c.get("heading", ""),
                    "page_title": page.get("title", ""),
                })

    save_chunks(all_chunks)
    print(f"\n  Total chunks: {len(all_chunks)}")
    if all_chunks:
        avg = sum(len(c["text"]) for c in all_chunks) / len(all_chunks)
        print(f"  Avg chunk size: {avg:.0f} characters")
