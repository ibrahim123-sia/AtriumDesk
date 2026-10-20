# AtriumDesk AI service (FastAPI RAG + Whisper + Crawl4AI) — image for
# Cloudflare Containers. Built and pushed by `wrangler deploy` from
# cloudflare/ (linux/amd64).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/.hf-cache \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# OpenMP runtime for torch / CTranslate2 (faster-whisper).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt pulls CPU-only torch from the PyTorch index.
COPY requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

# Chromium (and the system libraries it needs) for Crawl4AI's JS-rendering
# fetch, used when scraping job/scholarship/event sources.
RUN python -m playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The app runs as a non-root user that owns /app (chroma_db/, data/ and the
# model cache are written there). Models are downloaded as that user, so no
# chown layer duplicates them.
RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app && chown app:app /app
WORKDIR /app
USER app

# Bake the models into the image so a cold start never downloads them.
# WHISPER_MODEL must match the runtime WHISPER_MODEL (cloudflare/wrangler.jsonc).
ARG WHISPER_MODEL=base
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" \
    && python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"
# Everything is cached now: don't call Hugging Face on every model load.
ENV HF_HUB_OFFLINE=1

COPY --chown=app:app . .

# chroma_db/ starts empty; with R2 configured it is restored from the last
# snapshot on startup and saved back after changes (kb_snapshot.py).
EXPOSE 8000
CMD ["python", "run.py", "server"]
