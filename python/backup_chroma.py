"""
========================================================
BACKUP_CHROMA.PY - ChromaDB backup/export
========================================================

Rev5 §13.1 flagged that no backup/export/cron logic existed for
ChromaDB at all — the entire chatbot knowledge base for every tenant
lived in one on-disk directory with no recovery path if it were ever
corrupted or deleted.

This copies config.CHROMA_DB_PATH (one shared PersistentClient
directory, holding every tenant's named collection — Rev7 §5.4) into a
timestamped zip under BACKUP_DIR, then prunes anything older than
RETENTION_COUNT backups so disk usage doesn't grow unbounded.

Not a live-transaction-safe snapshot (no SQLite backup API, just a
directory copy) — acceptable here because writes only happen during
admin-triggered scraping/CRUD, not on every chatbot question, so the
window where a backup could catch a half-written state is small. Good
enough for this project's scale; a production deployment with heavy
concurrent writes would want chromadb's own client-level export or the
sqlite3 online backup API instead.

Run directly: python backup_chroma.py
Or triggered by Node's scheduler via POST /internal/backup-chroma (api.py).
"""

import os
import shutil
import zipfile
from datetime import datetime

import config

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")
RETENTION_COUNT = 14  # keep the last 14 backups (daily cron -> ~2 weeks)


def create_backup():
    """Zip the current ChromaDB directory into BACKUP_DIR, then prune old backups.

    Returns a dict summary: {"success": bool, "path"/"error": str, "sizeBytes": int, "prunedCount": int}
    """
    if not os.path.isdir(config.CHROMA_DB_PATH):
        return {"success": False, "error": f"CHROMA_DB_PATH does not exist: {config.CHROMA_DB_PATH}"}

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_base = os.path.join(BACKUP_DIR, f"chroma_{timestamp}")

    try:
        archive_path = shutil.make_archive(archive_base, "zip", root_dir=config.CHROMA_DB_PATH)
    except Exception as e:
        return {"success": False, "error": str(e)}

    pruned = _prune_old_backups()
    size_bytes = os.path.getsize(archive_path)

    return {
        "success": True,
        "path": archive_path,
        "sizeBytes": size_bytes,
        "prunedCount": pruned,
    }


def _prune_old_backups():
    """Delete the oldest backups beyond RETENTION_COUNT. Returns how many were deleted."""
    backups = sorted(
        (f for f in os.listdir(BACKUP_DIR) if f.startswith("chroma_") and f.endswith(".zip")),
    )
    excess = len(backups) - RETENTION_COUNT
    if excess <= 0:
        return 0

    for name in backups[:excess]:
        os.remove(os.path.join(BACKUP_DIR, name))
    return excess


if __name__ == "__main__":
    result = create_backup()
    if result["success"]:
        print(f"Backup created: {result['path']} ({result['sizeBytes']} bytes)")
        if result["prunedCount"]:
            print(f"Pruned {result['prunedCount']} old backup(s)")
    else:
        print(f"Backup failed: {result['error']}")
