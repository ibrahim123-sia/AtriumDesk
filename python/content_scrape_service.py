"""
========================================================
CONTENT_SCRAPE_SERVICE.PY - Self-service chatbot KB scraping
========================================================

Rev7 SaaS follow-up — the chatbot's knowledge base used to come from a
single hardcoded website (config.WEBSITES, MAJU's jinnah.edu), edited by a
developer by hand. This lets any tenant's Administrator trigger the same
sitemap -> pages -> chunks -> embeddings pipeline against their OWN
university's site instead, via the admin-facing endpoint in api.py.

Runs as a FastAPI BackgroundTask (see api.py's /internal/scrape-site) —
this function is plain synchronous code, which Starlette automatically
runs in a thread pool rather than blocking the event loop, so real
requests (chatbot /ask calls) keep working while a scrape is in progress.

Reuses scraper.py's per-URL functions directly (they already take explicit
sitemap_url/allowed_domain/url params, not config.WEBSITES) — no scraping
logic is duplicated here, only tenant-scoped orchestration + the Node
report-back callback.
"""

import os
import concurrent.futures

import requests

import config
import database
import rag
import scraper
from url_safety import validate_redirect_chain, UnsafeUrlError

SCRAPE_WORKERS = 16

# Self-service scraping is admin-triggered, but a sitemap can list far more
# URLs than a university site actually has (or an admin can point it at the
# wrong sitemap) — with no cap, run_tenant_content_scrape ties up all
# SCRAPE_WORKERS threads (shared with real /ask chatbot traffic — see
# api.py's threadpool note) for however long an unbounded crawl takes. Set
# comfortably above MAJU's real production scrape (1892 pages) so a
# legitimate large university site is never truncated.
MAX_SCRAPE_PAGES = 3000
OVERALL_SCRAPE_TIMEOUT_SECONDS = 20 * 60


def _node_base_url():
    return os.getenv("NODE_INTERNAL_URL", "http://localhost:3000")


def _report_to_node(tenant_slug, success, pages_scraped=0, chunks_created=0, error=None):
    try:
        requests.post(
            f"{_node_base_url()}/api/admin/internal/content-scrape/report",
            json={
                "tenant_slug": tenant_slug,
                "success": success,
                "pages_scraped": pages_scraped,
                "chunks_created": chunks_created,
                "error": error,
            },
            headers={"x-internal-secret": os.getenv("INTERNAL_SECRET", "")},
            timeout=15,
        )
    except Exception as exc:
        print(f"content_scrape_service: failed to report result to Node for {tenant_slug}: {exc}")


def run_tenant_content_scrape(tenant_slug, sitemap_url, allowed_domain, base_url):
    """Full pipeline for one tenant's own website, run in the background.
    Never raises — always reports success/failure back to Node so the
    Administrator's Settings page isn't left showing "running" forever."""
    print(f"[content-scrape:{tenant_slug}] starting — {sitemap_url}")
    try:
        # Authoritative SSRF check (§9.6) — same validator listing scraping
        # uses, since this is now admin-supplied input, not a hardcoded
        # trusted config value.
        safe_sitemap_url = validate_redirect_chain(sitemap_url)

        urls = scraper.get_urls_from_sitemap(safe_sitemap_url, allowed_domain)
        print(f"[content-scrape:{tenant_slug}] {len(urls)} URLs discovered")
        if len(urls) > MAX_SCRAPE_PAGES:
            print(f"[content-scrape:{tenant_slug}] capping to {MAX_SCRAPE_PAGES} pages (dropping {len(urls) - MAX_SCRAPE_PAGES})")
            urls = urls[:MAX_SCRAPE_PAGES]

        pages = []

        def _fetch_one(url):
            try:
                title, elements = scraper.extract_structured(url)
            except Exception as exc:
                return url, None, [], str(exc)
            return url, title, elements, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=SCRAPE_WORKERS) as pool:
            futures = {pool.submit(_fetch_one, u): u for u in urls}
            try:
                for fut in concurrent.futures.as_completed(futures, timeout=OVERALL_SCRAPE_TIMEOUT_SECONDS):
                    url, title, elements, err = fut.result()
                    if err or not elements:
                        continue
                    if not any(len(e["text"]) > 40 for e in elements):
                        continue
                    pages.append({"url": url, "title": title or "", "elements": elements})
            except concurrent.futures.TimeoutError:
                still_running = sum(1 for f in futures if not f.done())
                print(
                    f"[content-scrape:{tenant_slug}] hit the {OVERALL_SCRAPE_TIMEOUT_SECONDS}s wall-clock "
                    f"cap with {still_running} pages still in flight — proceeding with the "
                    f"{len(pages)} pages already fetched instead of hanging the worker pool indefinitely"
                )
                pool.shutdown(wait=False, cancel_futures=True)

        print(f"[content-scrape:{tenant_slug}] {len(pages)} pages kept")

        all_chunks = []
        for page in pages:
            page_chunks = scraper.chunk_elements(page["elements"], page_title=page.get("title"))
            for c in page_chunks:
                all_chunks.append({
                    "text": c["text"],
                    "source": page["url"],
                    "heading": c.get("heading", ""),
                    "page_title": page.get("title", ""),
                })

        print(f"[content-scrape:{tenant_slug}] {len(all_chunks)} chunks built, embedding...")
        collection_name = config.get_collection_name(tenant_slug)
        count = database.build_database(collection_name=collection_name, chunks=all_chunks)

        # Free the keyword-search cache for this tenant — otherwise a
        # student's next question keeps matching the OLD content until the
        # process happens to restart (same class of bug the count-based
        # cache invalidation elsewhere in database.py already guards
        # against for admin CRUD, but a full rebuild replaces every
        # document's identity so the count check alone isn't reliable here).
        try:
            database.clear_keyword_cache(collection_name)
        except Exception:
            pass

        # Same staleness problem as the keyword cache above, but for
        # rag.py's own cached collection handle — see
        # rag.invalidate_collection_cache's docstring.
        try:
            rag.invalidate_collection_cache(tenant_slug)
        except Exception:
            pass

        print(f"[content-scrape:{tenant_slug}] done — {count} chunks embedded")
        _report_to_node(tenant_slug, True, pages_scraped=len(pages), chunks_created=count)
    except UnsafeUrlError as exc:
        print(f"[content-scrape:{tenant_slug}] SSRF validation failed: {exc}")
        _report_to_node(tenant_slug, False, error=f"Unsafe URL: {exc}")
    except Exception as exc:
        print(f"[content-scrape:{tenant_slug}] failed: {exc}")
        _report_to_node(tenant_slug, False, error=str(exc))
