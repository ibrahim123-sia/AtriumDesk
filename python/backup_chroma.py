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

With R2 configured (Cloudflare — see kb_snapshot.py) the zip goes to the
bucket under BACKUP_PREFIX instead, since a container's disk is wiped on
every sleep/redeploy, and is taken through kb_snapshot.copy_store() so a
write landing mid-copy can't tear it. These dated backups are separate
from kb_snapshot's single live snapshot: they keep the last
RETENTION_COUNT days, so a bad edit or re-import that has already been
snapshotted can still be rolled back.

Locally it is not a live-transaction-safe snapshot (no SQLite backup API,
just a directory copy) — acceptable here because writes only happen during
admin-triggered scraping/CRUD, not on every chatbot question, so the
window where a backup could catch a half-written state is small.

Run directly: python backup_chroma.py
Or triggered by Node's scheduler via POST /internal/backup-chroma (api.py).
"""

import os
import shutil
import tempfile
import time
import zipfile
from datetime import datetime

import config
import kb_snapshot

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")
BACKUP_PREFIX = "kb/backups/"
RETENTION_COUNT = 14  # keep the last 14 backups (daily cron -> ~2 weeks)
QUIET_WAIT_SECONDS = 120  # how long an R2 backup waits for running writes to finish


def create_backup():
    """Zip the current ChromaDB directory into BACKUP_DIR (or R2), then prune old backups.

    Returns a dict summary: {"success": bool, "path"/"error": str, "sizeBytes": int, "prunedCount": int}
    """
    if not os.path.isdir(config.CHROMA_DB_PATH):
        return {"success": False, "error": f"CHROMA_DB_PATH does not exist: {config.CHROMA_DB_PATH}"}

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if kb_snapshot.enabled():
        return _create_remote_backup(timestamp)

    os.makedirs(BACKUP_DIR, exist_ok=True)
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


def _create_remote_backup(timestamp):
    """R2 variant of create_backup(): consistent copy -> zip -> upload -> prune."""
    key = f"{BACKUP_PREFIX}chroma_{timestamp}.zip"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, "chroma_db")
            deadline = time.monotonic() + QUIET_WAIT_SECONDS
            while kb_snapshot.copy_store(copy) is None:
                if time.monotonic() >= deadline:
                    return {"success": False, "error": "Knowledge base is busy (a write is still running); try again later"}
                shutil.rmtree(copy, ignore_errors=True)
                time.sleep(2)
            archive_path = shutil.make_archive(os.path.join(tmp, "backup"), "zip", root_dir=copy)
            size_bytes = os.path.getsize(archive_path)
            client, bucket = kb_snapshot.s3()
            client.upload_file(archive_path, bucket, key)
        pruned = _prune_remote_backups(client, bucket)
    except Exception as e:
        return {"success": False, "error": str(e)}

    return {
        "success": True,
        "path": f"r2://{bucket}/{key}",
        "sizeBytes": size_bytes,
        "prunedCount": pruned,
    }


def _prune_remote_backups(client, bucket):
    """Delete the oldest R2 backups beyond RETENTION_COUNT. Returns how many were deleted."""
    keys = []
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=BACKUP_PREFIX):
        keys.extend(obj["Key"] for obj in page.get("Contents", []) if obj["Key"].endswith(".zip"))
    keys.sort()  # chroma_YYYYmmdd_HHMMSS.zip sorts oldest first
    excess = keys[:-RETENTION_COUNT] if len(keys) > RETENTION_COUNT else []
    for old_key in excess:
        client.delete_object(Bucket=bucket, Key=old_key)
    return len(excess)


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
