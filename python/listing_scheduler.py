"""
========================================================
LISTING_SCHEDULER.PY - Recurring source polling (Rev 5 §9.3)
========================================================

"A Python-side scheduler wakes on a fixed interval (every 30-60 minutes).
It does not decide what is due" — that logic lives in Node, next to the
Source schema (server/controllers/internalController.js's sourcesDue),
so the admin UI can show next-run info without reimplementing it here.

This module: ask Node what's due -> scrape each one -> report back to
Node. No business logic, no state — a simple ask-for-work / do-it /
report-back loop, per §9.3's explicit design rule.
"""

import asyncio
import os

import requests

import listing_scraper
from url_safety import UnsafeUrlError

NODE_INTERNAL_URL = os.getenv("NODE_INTERNAL_URL", "http://localhost:3000")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET")
POLL_INTERVAL_SECONDS = 30 * 60  # 30 minutes, per §9.3's "every 30-60 minutes"


def _internal_headers():
    return {"x-internal-secret": INTERNAL_SECRET or "", "Content-Type": "application/json"}


async def _fetch_due_sources():
    response = requests.get(
        f"{NODE_INTERNAL_URL}/api/admin/internal/sources-due",
        headers=_internal_headers(),
        timeout=15,
    )
    response.raise_for_status()
    return response.json().get("due", [])


async def _report(source_id, tenant_slug, payload):
    try:
        requests.post(
            f"{NODE_INTERNAL_URL}/api/admin/internal/sources/{source_id}/report",
            headers=_internal_headers(),
            json={"tenant_slug": tenant_slug, **payload},
            timeout=15,
        )
    except requests.RequestException as exc:
        print(f"  listing_scheduler: failed to report source {source_id}: {exc}")


async def poll_and_process():
    if not INTERNAL_SECRET:
        print("  listing_scheduler: INTERNAL_SECRET not set, skipping this cycle")
        return

    try:
        due = await _fetch_due_sources()
    except requests.RequestException as exc:
        print(f"  listing_scheduler: could not reach Node for due sources: {exc}")
        return

    if not due:
        return
    print(f"  listing_scheduler: {len(due)} source(s) due")

    for item in due:
        source_id, tenant_slug, url, listing_type = item["sourceId"], item["tenantSlug"], item["url"], item["type"]
        try:
            result = await listing_scraper.scrape_listing(url, listing_type)
            await _report(source_id, tenant_slug, {
                "success": True, "hash": result["hash"], "data": result["data"], "type": listing_type,
            })
        except listing_scraper.ListingGoneError as exc:
            # §7.4 delisting signal — reported distinctly so Node can track
            # it separately from a generic failure and require two
            # consecutive confirmations before marking the listing delisted.
            print(f"  listing_scheduler: source {source_id} ({url}) appears gone: {exc}")
            await _report(source_id, tenant_slug, {"success": False, "reason": "not_found", "error": str(exc)})
        except (listing_scraper.ScrapeError, UnsafeUrlError) as exc:
            print(f"  listing_scheduler: source {source_id} ({url}) failed: {exc}")
            await _report(source_id, tenant_slug, {"success": False, "error": str(exc)})
        except Exception as exc:
            # Catch-all so one bad source can't kill the whole poll cycle.
            print(f"  listing_scheduler: unexpected error on source {source_id}: {exc}")
            await _report(source_id, tenant_slug, {"success": False, "error": f"Unexpected error: {exc}"})


async def scheduler_loop(interval_seconds=POLL_INTERVAL_SECONDS):
    while True:
        try:
            await poll_and_process()
        except Exception as exc:
            print(f"  listing_scheduler: poll cycle failed: {exc}")
        await asyncio.sleep(interval_seconds)
