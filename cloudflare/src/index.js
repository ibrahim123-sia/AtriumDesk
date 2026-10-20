import { Container, getContainer } from "@cloudflare/containers";

// AtriumDesk backend on Cloudflare: one Worker in front of two containers.
//
//   /uploads/*  → R2 bucket (files the API server stored there)
//   /ai/*       → AiService container (python/, FastAPI) with /ai stripped
//   everything  → ApiServer container (server/, Express)
//
// The containers sleep when idle; the hourly Cron Trigger below runs the
// API server's background jobs (SLA escalation, recurring sources, and the
// daily backup / reminders / listing expiry / digests).

// Worker vars/secrets → container env. Unset or empty values are left out so
// the apps fall back to their own defaults.
const pick = (env, names) =>
  Object.fromEntries(
    names.filter((n) => env[n] !== undefined && env[n] !== "").map((n) => [n, String(env[n])])
  );

const SHARED = [
  "JWT_SECRET",
  "INTERNAL_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

const trimSlash = (url) => String(url || "").replace(/\/+$/, "");

export class ApiServer extends Container {
  defaultPort = 3000;
  // Short, because the hourly cron wakes it: ~10 min awake per hour instead
  // of never sleeping. Memory is billed for every minute it is awake.
  sleepAfter = "10m";

  constructor(ctx, env) {
    super(ctx, env);
    // Read when the container starts: changed secrets apply on its next start.
    this.envVars = {
      ...pick(env, [
        ...SHARED,
        "MONGODB_URI",
        "PLATFORM_DB_NAME",
        "PLATFORM_JWT_SECRET",
        "FIELD_ENCRYPTION_KEY",
        "CLIENT_URL",
        "EMAIL_USER",
        "EMAIL_PASS",
        "DEFAULT_TENANT_SLUG",
        "TZ",
      ]),
      NODE_ENV: "production",
      PORT: "3000",
      // The Worker sets X-Forwarded-For to the visitor's IP (see below).
      TRUST_PROXY: "1",
      // The timers stop while the container sleeps; the Cron Trigger runs them.
      DISABLE_SCHEDULERS: "true",
      PYTHON_BACKEND_URL: `${trimSlash(env.PUBLIC_URL)}/ai`,
    };
  }
}

export class AiService extends Container {
  defaultPort = 8000;
  sleepAfter = "30m";
  // Host "localhost", path "/health" (a bare "health" would be the host).
  pingEndpoint = "localhost/health";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      ...pick(env, [
        ...SHARED,
        "GROQ_API_KEY",
        "GROQ_API_KEY_2",
        "GROQ_API_KEY_3",
        "GROQ_MODEL",
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "CLOUD_LLM_ORDER",
        "WHISPER_MODEL",
      ]),
      USE_LOCAL_LLM: "false",
      // Recurring-source polls are started by the API server's jobs.
      DISABLE_SCHEDULERS: "true",
      NODE_INTERNAL_URL: trimSlash(env.PUBLIC_URL),
      CORS_ALLOW_ORIGINS: trimSlash(env.CLIENT_URL),
    };
  }

  // Before it listens, the service imports torch, sentence-transformers and
  // ChromaDB and restores the knowledge base from R2. On half a vCPU that can
  // outlast the library's 20 s start-up wait, which would fail the first
  // request after a wake-up, so allow up to 2 minutes.
  async fetch(request) {
    // The same check containerFetch() makes before its own (20 s) start.
    if (!this.ctx.container.running || (await this.getState()).status !== "healthy") {
      await this.startAndWaitForPorts({
        cancellationOptions: { portReadyTimeoutMS: 120_000, abort: request.signal },
      });
    }
    return super.fetch(request);
  }

  // A tenant's site re-import or a source poll runs in the background with
  // no requests coming in, so sleepAfter alone could stop the container
  // half-way through. While /health reports busy, skip the stop; the
  // library checks again after another sleepAfter.
  async onActivityExpired() {
    if (this.ctx.container.running) {
      try {
        // Bounded: a hung service must not keep the container up forever.
        const res = await this.containerFetch(
          new Request("http://localhost/health", { signal: AbortSignal.timeout(10_000) })
        );
        if (res.ok && (await res.json()).busy) return;
      } catch {
        // Unreachable or not JSON: treat as idle.
      }
    }
    await super.onActivityExpired();
  }
}

// The visitor's IP (the server's rate limits) and the original scheme (the
// container is reached over plain http, so absolute URLs the server builds —
// e.g. PWA manifest icons — would otherwise come out as http://).
// Overwritten, not appended, so a client can't spoof them.
function forwardedHeaders(request) {
  const headers = new Headers(request.headers);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Forwarded-For", ip);
  else headers.delete("X-Forwarded-For");
  headers.set("X-Forwarded-Proto", new URL(request.url).protocol.replace(":", ""));
  return headers;
}

async function serveUpload(request, env, url) {
  const key = decodeURIComponent(url.pathname.slice(1)); // "uploads/issues/<file>"
  if (key.split("/").includes("..")) return null;
  const object = request.method === "HEAD" ? await env.UPLOADS.head(key) : await env.UPLOADS.get(key);
  if (!object) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/uploads/")) {
      const file = await serveUpload(request, env, url);
      if (file) return file;
      // Not in R2: let the API server answer (404, or a file on its disk).
    }

    if (url.pathname === "/ai" || url.pathname.startsWith("/ai/")) {
      url.pathname = url.pathname.slice(3) || "/";
      const forwarded = new Request(url, new Request(request, { headers: forwardedHeaders(request) }));
      return getContainer(env.AI_SERVICE).fetch(forwarded);
    }

    return getContainer(env.API_SERVER).fetch(new Request(request, { headers: forwardedHeaders(request) }));
  },

  // Cron Trigger (hourly): the jobs that ran on in-process timers locally.
  // The API server decides which daily jobs are due this hour.
  async scheduled(event, env, ctx) {
    const run = getContainer(env.API_SERVER)
      .fetch(
        new Request("http://api-server/api/admin/internal/run-jobs", {
          method: "POST",
          headers: { "x-internal-secret": env.INTERNAL_SECRET },
        })
      )
      .then(async (res) => console.log(`run-jobs: ${res.status} ${await res.text()}`));
    ctx.waitUntil(run);
  },
};
