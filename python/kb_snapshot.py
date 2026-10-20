"""
========================================================
KB_SNAPSHOT.PY - ChromaDB kept in Cloudflare R2
========================================================

On Cloudflare Containers the disk is wiped whenever the container sleeps,
restarts or is redeployed, and chroma_db/ (one PersistentClient holding
every tenant's knowledge-base and listing collections — Rev7 §5.4) is the
only copy of what the Administrators built. With R2 configured:

  - restore()  on startup downloads the last snapshot into chroma_db/ (only
               when chroma_db/ is missing or empty, so local data wins);
  - writing()  wraps every ChromaDB write; the snapshot only ever copies
               the store while no write is in flight, and throws the copy
               away if one started meanwhile, so it is never torn;
  - a background thread uploads a new snapshot once writes have been quiet
    for QUIET_SECONDS;
  - flush()    on shutdown uploads any change not saved yet (the container
               gets SIGTERM before it sleeps).

backup_chroma.py uses copy_store() and s3() for its daily, dated backups.

Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
(R2_ENDPOINT instead of R2_ACCOUNT_ID for another S3-compatible store;
optional KB_SNAPSHOT_KEY, default "kb/chroma_db.tar.gz"). Without them
every function here is a no-op, so local development is unchanged.
"""

import os
import shutil
import sqlite3
import tarfile
import tempfile
import threading
import time
from contextlib import contextmanager

import config

SNAPSHOT_KEY = os.getenv("KB_SNAPSHOT_KEY", "kb/chroma_db.tar.gz")
QUIET_SECONDS = 30   # wait this long after the last write before uploading
RETRY_AFTER = 60     # after a failed upload, wait this long before trying again
CHECK_EVERY = 10     # background thread poll interval (seconds)

_R2 = {name: os.getenv(name) for name in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")}
_ENDPOINT = (os.getenv("R2_ENDPOINT") or (
    f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com" if os.getenv("R2_ACCOUNT_ID") else ""
)).rstrip("/")

_state_lock = threading.Lock()     # guards the write counters below
_snapshot_lock = threading.Lock()  # one snapshot at a time
_inflight = 0                      # writes running right now
_started = 0                       # writes ever started — tells whether one overlapped a copy
_dirty_since = None                # monotonic time of the oldest unsaved write
_last_write = 0.0
_next_try = 0.0                    # no upload before this (backoff after a failure)
_thread = None


def enabled():
    return bool(_ENDPOINT) and all(_R2.values())


def s3():
    """(boto3 S3 client for R2, bucket name). Only call when enabled()."""
    import boto3  # only needed when R2 is configured
    from botocore.config import Config
    client = boto3.client(
        "s3",
        endpoint_url=_ENDPOINT,
        aws_access_key_id=_R2["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=_R2["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        # R2 doesn't take the checksum trailers newer boto3 sends by default.
        config=Config(request_checksum_calculation="when_required", response_checksum_validation="when_required"),
    )
    return client, _R2["R2_BUCKET"]


@contextmanager
def writing():
    """Wrap every ChromaDB write (chunk CRUD, document upload, listing
    embeddings, a tenant's site re-import)."""
    global _inflight, _started
    with _state_lock:
        _inflight += 1
        _started += 1
    try:
        yield
    finally:
        with _state_lock:
            _inflight -= 1
        _mark_dirty()


def _mark_dirty():
    global _dirty_since, _last_write
    if not enabled():
        return
    now = time.monotonic()
    with _state_lock:
        _last_write = now
        if _dirty_since is None:
            _dirty_since = now


def restore():
    """Download the last snapshot into an empty chroma_db/. Never raises."""
    if not enabled():
        return
    target = config.CHROMA_DB_PATH
    if os.path.isdir(target) and os.listdir(target):
        print("KB snapshot: local chroma_db/ already has data, not restoring")
        return
    try:
        client, bucket = s3()
        with tempfile.TemporaryDirectory() as tmp:
            archive = os.path.join(tmp, "snapshot.tar.gz")
            try:
                client.download_file(bucket, SNAPSHOT_KEY, archive)
            except Exception as exc:
                if "404" in str(exc) or "NoSuchKey" in str(exc) or "Not Found" in str(exc):
                    print("KB snapshot: none in R2 yet (fresh knowledge base)")
                    return
                raise
            staging = os.path.join(tmp, "chroma_db")
            with tarfile.open(archive, "r:gz") as tar:
                tar.extractall(staging, filter="data")
            if os.path.isdir(target):
                shutil.rmtree(target)
            shutil.move(staging, target)
        print(f"KB snapshot: restored chroma_db/ from r2://{bucket}/{SNAPSHOT_KEY}")
    except Exception as exc:
        print(f"KB snapshot: restore failed ({exc}); starting with an empty knowledge base")


def _copy_consistent(src, dst):
    """Copy chroma_db/ with SQLite files taken through the backup API (so
    WAL contents are folded in)."""
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if name.endswith(("-wal", "-shm", "-journal")):
            continue  # folded into the backup copy below
        if name.endswith(".sqlite3"):
            source, dest = sqlite3.connect(s), sqlite3.connect(d)
            try:
                source.backup(dest)
            finally:
                source.close()
                dest.close()
        elif os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)


def copy_store(dst):
    """Copy chroma_db/ into `dst` while no write is in flight. Returns the
    write count the copy reflects, or None when a write was running or
    started during the copy (the copy may be torn, so it isn't used)."""
    with _state_lock:
        if _inflight:
            return None
        started = _started
    _copy_consistent(config.CHROMA_DB_PATH, dst)
    with _state_lock:
        return started if _started == started else None


def snapshot():
    """Upload chroma_db/ to R2 now. Returns True on success. Never raises."""
    global _dirty_since, _next_try
    if not enabled() or not os.path.isdir(config.CHROMA_DB_PATH):
        return False
    with _snapshot_lock:
        try:
            with tempfile.TemporaryDirectory() as tmp:
                copy = os.path.join(tmp, "chroma_db")
                covered = copy_store(copy)
                if covered is None:
                    return False  # a write got in the way; the loop retries once it's quiet
                archive = os.path.join(tmp, "snapshot.tar.gz")
                with tarfile.open(archive, "w:gz") as tar:
                    tar.add(copy, arcname=".")
                client, bucket = s3()
                client.upload_file(archive, bucket, SNAPSHOT_KEY)
            with _state_lock:
                # Writes started after the copy aren't in it: still unsaved.
                if _started == covered:
                    _dirty_since = None
            print("KB snapshot: saved to R2")
            return True
        except Exception as exc:
            _next_try = time.monotonic() + RETRY_AFTER
            print(f"KB snapshot: upload failed ({exc}); will retry")
            return False


def _loop():
    while True:
        time.sleep(CHECK_EVERY)
        now = time.monotonic()
        with _state_lock:
            due = _dirty_since is not None and not _inflight and now - _last_write >= QUIET_SECONDS
        if due and now >= _next_try:
            snapshot()


def start():
    """Start the background uploader (once)."""
    global _thread
    if not enabled() or _thread is not None:
        return
    _thread = threading.Thread(target=_loop, name="kb-snapshot", daemon=True)
    _thread.start()


def flush():
    """Save unsaved changes before the process exits. A write still running
    at shutdown is waited for (up to a minute) rather than skipped."""
    if _dirty_since is None:
        return
    deadline = time.monotonic() + 60
    while not snapshot() and time.monotonic() < deadline:
        time.sleep(2)
