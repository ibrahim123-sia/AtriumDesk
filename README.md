# AtriumDesk 🎓
### Multi-tenant, AI-powered student-portal SaaS — onboard any university

![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=flat&logo=react)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?style=flat&logo=nodedotjs)
![Python](https://img.shields.io/badge/AI-Python-3776AB?style=flat&logo=python)

AtriumDesk is a full-stack AI-powered platform that consolidates university student services into one intelligent system, built database-per-tenant so any university can be onboarded. At its core is a smart chatbot (RAG over each tenant's own scraped website content) with voice input support — making university help accessible to every student. There is no mobile app; the client is a responsive web app with an offline-capable PWA shell.

> **Note:** AtriumDesk is a university-agnostic product and is not affiliated with, or officially launched for, any specific institution. Muhammad Ali Jinnah University (MAJU) is a *pilot / prospective tenant* — sample data was shared for evaluation, and they may onboard as a tenant in future.

<p align="center">
  <img src="preview.png" alt="AtriumDesk preview" width="100%"/>
</p>

---

## ✨ Features

### 🎓 Student Portal
| Module | Status | Description |
|--------|--------|-------------|
| **Guest Page** | ✅ | Public admissions assistant for applicants: chat, the university's own scholarships and campus events. Each university has its own link (`/?u=<id>`) and a one-tag **website widget** (`/widget.js`) |
| **Auth** | ✅ | Register / login with a university email, OTP verification, password recovery |
| **AI Chatbot** | ✅ | Answers university queries via RAG over the tenant's own website; source links under confident answers; 👍/👎 on every answer (a 👎 lands in the failed-question log); one-click "file a query" handoff with the transcript; voice input; profanity filter with admin flagging |
| **Issue Tracker** | ✅ | Submit and track support requests with attachments; the form offers an existing answer before you file; replying to a resolved issue reopens it; rejection reasons shown; resolved issues auto-close after 7 days; in-app bell + email notifications |
| **Job Portal** | ✅ | Scraped + manually-entered listings, hard-rule + embedding-based matching, skill-gap analysis against an uploaded CV |
| **Scholarship Portal** | ✅ | Scraped + manually-entered listings, CGPA-aware matching, cached LLM match explanations |
| **Events** | ✅ | Manual-entry campus events (no scrapable source exists) with save/reminder support, calendar (.ics / Google) and WhatsApp sharing |
| **Saved & Applications** | ✅ | Saved scholarships/jobs/events with an application tracker (preparing → applied → interviewing → offer), notes, documents checklist, deadline reminders |
| **Profile Page** | ✅ | Unified academic/career/study-abroad/events profile, auto-filled from CV parsing or a tenant's student-email pattern; digest settings; download my data / delete my account |

### 🏢 Staff Portal (Department-scoped)
| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard** | ✅ | Open / In Progress / Resolved-this-week cards, 7-day trend chart, avg first-response time, recent issues, your own reply count |
| **Department Inbox** | ✅ | Only your department's issues; per-status counts, escalated-only and assigned-to-me filters; 20s polling |
| **Issue Detail** | ✅ | Full thread with student info and attachments; assign/reassign; **internal notes** only staff see; **transfer** to the right department; department **saved replies** |
| **Status Management** | ✅ | Update status (Pending → In Progress → Resolved → Closed); student notified by bell + email |
| **Reply System** | ✅ | Threaded replies to students; notification fires on every reply |

### ⚙️ Admin Panel
| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard** | ✅ | Stat cards (students/staff/admins/departments/issues/chats/flagged) + 7-day issue trend + recent signups + **assistant card** (questions answered, confident share, helpful rate, chat-to-ticket handoffs, answers given on the issue form, most-asked gaps) |
| **Users** | ✅ | List students with search and filters (blocked / flagged); detail drawer with issues, chats, flags; block/unblock with confirm |
| **Staff** | ✅ | Create staff with an auto-generated address on the university's staff email pattern + 12-char password (shown once + emailed); filter by department; deactivate |
| **Departments** | ✅ | Create / edit / soft-deactivate; first-reply target (SLA hours) and who escalations go to |
| **Failed Questions** | ✅ | Questions the bot couldn't answer well (low confidence or rated 👎), grouped with counts and the answer given — answer them straight into the knowledge base |
| **Query** | ✅ | Cross-department issue analytics — top categories, by-department, avg resolution time, filterable table, read-only detail |
| **Data (Vector DB)** | ✅ | Direct-to-Python CRUD on the chatbot knowledge base; edit/add chunks; upload PDF / DOCX / TXT with auto chunking + embedding |
| **Logs & Activity** | ✅ | Three tabs: admin action audit (with redacted payload), login events (success + failures), chat browser with flagged-student filter |
| **Content Management** | ✅ | Manage scholarship/job/event sources, review scraped listings, self-service chatbot knowledge-base website scraping |
| **System Health** | ✅ | One-screen manual health check pinging MongoDB, ChromaDB, and the active LLM provider — meant to be run right before a demo/exam |
| **Settings** | ✅ | Branding (name, logo, colour), email domains and patterns, OTP email account, retrieval tuning, plus the guest link and website-widget snippet to share |

### 🧑‍✈️ Super Admin (Platform)
| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard / Tenants / Usage** | ✅ | Cross-tenant KPIs, tenant create/suspend/edit/billing, per-tenant analytics, real LLM token/request usage tracking |
| **Impersonation** | ✅ | Time-limited login-as-Administrator for support, fully attributed in that tenant's own audit log |

---

## 🛠️ Tech Stack

```
client/    →  React 19 + Redux Toolkit + Tailwind + Vite (Student, Staff, Admin & Super Admin UI, PWA)
server/    →  Node.js / Express + MongoDB / Mongoose — one PlatformDB (tenant registry, Super Admin)
               + one MongoDB database per tenant (models/registry.js)
python/    →  FastAPI + ChromaDB + sentence-transformers — one Chroma collection per tenant
```

**Key libraries:** `recharts` (admin/staff dashboards), `react-markdown`, `react-hot-toast`, `lucide-react`, `multer`, `nodemailer` (any SMTP relay — Gmail, Brevo, Resend…), `express-rate-limit`, `pyjwt`, `pypdf`, `python-docx` (chunking is a hand-rolled heading-anchored packer in `scraper.py`, not a third-party splitter).

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Python 3.10+
- MongoDB running locally or a cloud URI
- npm

### Installation

```bash
git clone https://github.com/ibrahim123-sia/AtriumDesk.git
cd AtriumDesk

# Install dependencies
cd client && npm install
cd ../server && npm install
cd ../python && pip install -r requirements.txt
```

### Required env vars

See `server/.env.example`, `python/.env.example`, and `client/.env.example` for the full, current list of
every environment variable actually read by the code (copy each to `.env` and fill in real values) —
those files are the source of truth; the summary below is a quick-glance overview only.

`server/.env` (highlights)
```
MONGODB_URI=...                          # one shared cluster; each tenant gets its own database on it
PLATFORM_DB_NAME=AtriumDeskPlatform      # tenant registry + Super Admin users
JWT_SECRET=<long-random-string>          # tenant-user JWTs
PLATFORM_JWT_SECRET=<long-random-string> # Super Admin JWTs — must differ from JWT_SECRET
INTERNAL_SECRET=<long-random-string, must match python/.env>
FIELD_ENCRYPTION_KEY=<32-byte-hex>       # encrypts a tenant's own SMTP app password at rest
SUPERADMIN_EMAIL / SUPERADMIN_NAME / SUPERADMIN_PASSWORD   # seeded on first run
DEFAULT_TENANT_SLUG=maju                 # which tenant guest/legacy traffic resolves to
EMAIL_USER / EMAIL_PASS                  # platform-default Gmail SMTP fallback
SMTP_HOST / SMTP_PORT / SMTP_SECURE      # …or any other SMTP relay (e.g. smtp-relay.brevo.com:587)
SMTP_USER / SMTP_PASS / EMAIL_FROM       # relay login + sender address (a tenant's own SMTP in Settings wins)
PYTHON_BACKEND_URL=http://localhost:8000
```

`python/.env` (highlights)
```
JWT_SECRET=<same value as server/.env>
INTERNAL_SECRET=<same value as server/.env>
NODE_INTERNAL_URL=http://localhost:3000
USE_LOCAL_LLM=false                      # true = Ollama; false = the cloud order below
CLOUD_LLM_ORDER=groq,gemini              # failover order when USE_LOCAL_LLM is false
GROQ_API_KEY=...                         # GROQ_API_KEY_2 / _3 for dual-key failover
GEMINI_API_KEY=...
# Ollama (local, only used when USE_LOCAL_LLM=true) — start `ollama serve` first
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_MODEL_SIZE=3b
OLLAMA_TIMEOUT=300
# Whisper (local STT, faster-whisper)
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

`client/.env`
```
VITE_SERVER_URL=http://localhost:3000
VITE_PYTHON_URL=http://localhost:8000
```

### Seed the platform + first tenant

```bash
cd server
node scripts/seedTenant.js   # idempotent — creates/updates the Tenant registry row, that tenant's
                              # Administrator, and the Super Admin user from the env vars above
```

### Running locally

```bash
# Start backend  (from /server)
npm run server          # → http://localhost:3000

# Start AI service  (from /python)
python run.py server    # → http://localhost:8000

# Start frontend  (from /client)
npm run dev             # → http://localhost:5173
```

Log in as the admin you seeded, create departments + staff from the admin panel, then register a student through the UI to exercise the full flow. A guest can open a specific university's assistant with `http://localhost:5173/?u=<tenant slug>`.

### Tests

```bash
cd server && npm test                  # node --test — matching, CGPA conversion, URL/SSRF guard, scheduler,
                                       # skill gaps, department suggestion, file store, tenant isolation
cd client && npm run lint && npm run build
cd python/eval && python eval.py       # golden-set RAG evaluation against a running AI service (needs INTERNAL_SECRET)
```

The golden set (`python/eval/golden_set.json`) is the regression check for any change to the RAG prompt, retrieval or chunking — run it before and after. It can set `user_type` per case (guest or student).

---

## ☁️ Deploying to Cloudflare

Everything runs on Cloudflare; MongoDB stays on Atlas (one cluster, every tenant's database on it).

| Part | Runs on | Config |
| --- | --- | --- |
| Web client | Workers static assets (`atriumdesk-web`), SPA fallback | `client/wrangler.jsonc` |
| API server (`server/`) | Cloudflare Container `ApiServer` — `basic`, 1 GiB | `server/Dockerfile` |
| AI service (`python/`) | Cloudflare Container `AiService` — `standard-1`, 4 GiB; models + Chromium baked into the image | `python/Dockerfile` |
| Front door | Worker `atriumdesk-api`: `/uploads/*` → R2, `/ai/*` → AI service, everything else → API server | `cloudflare/` |
| Files | R2 bucket `atriumdesk-uploads`: uploads, the knowledge-base snapshot and its daily backups | — |
| Background jobs | Cron Trigger every hour → `POST /api/admin/internal/run-jobs` | `cloudflare/wrangler.jsonc` |

Containers sleep when idle and their disks are wiped on every sleep or redeploy, so:

- **Uploads** (attachments, avatars, tenant logos, activity images) are copied to R2 as they are saved (`server/services/fileStore.js`), and the Worker serves `/uploads/*` from the bucket.
- **The knowledge base** (ChromaDB — every tenant's collection) is restored from R2 on startup and saved back after changes (`python/kb_snapshot.py`); the daily backup goes to `kb/backups/` in the bucket, keeping 14.
- **Background jobs** don't use in-process timers (`DISABLE_SCHEDULERS=true`): the hourly cron runs SLA escalation, wakes the AI service only when a recurring source is due, and runs the daily jobs at their hour in `TZ` (backup 1am, reminders 2am, listing expiry 3am, digests 6am).
- All of this is a no-op without the `R2_*` / `DISABLE_SCHEDULERS` settings, so local development is unchanged.

**You need:** the Workers Paid plan ($5/month, required for Containers) with R2 enabled, a MongoDB Atlas cluster that accepts connections from anywhere (`0.0.0.0/0` — containers have no fixed IP), and Docker — or the **Deploy to Cloudflare** GitHub Actions workflow, whose runners have Docker.

```bash
# 1. Login + bucket (once)
cd cloudflare && npm install
npx wrangler login
npx wrangler r2 bucket create atriumdesk-uploads

# 2. Edit cloudflare/wrangler.jsonc → vars: PUBLIC_URL, CLIENT_URL, R2_ACCOUNT_ID

# 3. Secrets (once; values from server/.env and python/.env).
#    R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY: dashboard → R2 → Manage API tokens
#    → "Object Read & Write" on atriumdesk-uploads.
for s in MONGODB_URI JWT_SECRET PLATFORM_JWT_SECRET INTERNAL_SECRET FIELD_ENCRYPTION_KEY \
         R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY GROQ_API_KEY GEMINI_API_KEY EMAIL_USER EMAIL_PASS; do
  npx wrangler secret put $s
done                                  # optional: GROQ_API_KEY_2, GROQ_API_KEY_3

# 4. Backend: Worker + both containers (Docker must be running)
npm run deploy

# 5. Seed R2 with what only exists locally (R2_* set in the environment)
cd ../python && python run.py push-kb        # local chroma_db/ → the AI service's knowledge base
cd ../server && node scripts/pushUploads.js  # local uploads/ → the bucket

# 6. Web client
cd ../client
VITE_SERVER_URL=https://atriumdesk-api.<you>.workers.dev \
VITE_PYTHON_URL=https://atriumdesk-api.<you>.workers.dev/ai \
npm run build && npx wrangler deploy
```

Without Docker, use **Actions → Deploy to Cloudflare → Run workflow** (`.github/workflows/deploy-cloudflare.yml`) for steps 4 and 6 — it needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and the repository variables `VITE_SERVER_URL` / `VITE_PYTHON_URL`. A new database is seeded from your machine against Atlas with `node scripts/seedTenant.js` (in `server/`). `npm run logs` (in `cloudflare/`) tails the Worker; the containers' logs are in the dashboard under Workers → `atriumdesk-api` → Containers.

---

## 💬 Website widget

Add the admissions assistant to a university's own website with one tag
(the exact snippet, with your address and university id, is in
**Admin → Settings → Share your assistant**):

```html
<script src="https://<your AtriumDesk address>/widget.js" data-university="<university id>" async></script>
```

Optional `data-label="Ask us"` and `data-color="#0D9488"`. It adds a chat button
that opens the guest assistant (`/embed`) in a panel. `/embed` is the only page
other sites may frame (see `client/public/_headers`).

---

## 📁 Project Structure

```
AtriumDesk/
├── client/                       # React frontend
│   └── src/
│       ├── platform/             # /platform/* Super Admin pages, components, layout
│       ├── administrator/        # /admin/* pages, components, layout
│       ├── staff/                # /staff/* dashboard + issue inbox (role-delegable);
│       │                         # components/IssueStaffTools (notes, transfer, saved replies)
│       ├── student/              # chat, issues, scholarships, jobs, events, saved & applications
│       ├── guest/                # public landing + guest chatbot (+ /embed for the widget)
│       ├── profile/              # unified profile + "Your data" (export / delete)
│       ├── auth/                 # login, register, ProtectedRoute, HomeRoute
│       ├── components/           # Sidebar, NotificationBell, MainLayout, TopNavbar
│       ├── redux/slices/         # auth, chat, issue, notification, platform, guest,
│       │                         # saved, department, admin{Stats,User,Staff,
│       │                         # Query,Data,Log,Listing,FailedQuestions} slices
│       └── utils/                # axios, branding, guestTenant
│   └── public/widget.js          # website chat-button script for universities' sites
├── server/                       # Node.js / Express
│   ├── controllers/              # user, chat, issue, department, accountData,
│   │                             # notification, admin*, platform, internal, message
│   ├── middlewares/              # auth, requireRole, requireStaffPermission, upload,
│   │                             # audit, platformAuth, auditPlatformWrites
│   ├── models/                   # User, Issue, Department, Chat, Listing, SavedListing,
│   │                             # Notification, AuditLog, LoginEvent, AiUsageLog,
│   │                             # FailedQuestion, AnswerFeedback, CannedResponse
│   │                             # (tenant-scoped, see models/registry.js)
│   │                             # + models/platform/ (Tenant, SuperAdminUser,
│   │                             # PlatformAuditLog — PlatformDB, not per-tenant)
│   ├── routes/                   # *Routes.js + platformRoutes.js (/api/platform)
│   ├── services/                 # notify, mailer, tenantRegistry, urlSafety, etc.
│   └── scripts/seedTenant.js
├── python/                       # FastAPI RAG + admin vector CRUD
│   ├── api.py                    # /ask + admin /chunks + /documents
│   ├── rag.py                    # RAG pipeline (Groq/Gemini/Ollama, confidence tiering)
│   ├── database.py               # ChromaDB ops (one collection per tenant)
│   ├── moderation.py             # English + Roman-Urdu profanity check (safety filter — kept even though the chatbot replies in English only)
│   ├── scraper.py                # self-service per-tenant website scraper
│   ├── kb_snapshot.py            # knowledge-base snapshot to R2 (Cloudflare)
│   ├── eval/                     # golden-set evaluation (eval.py + golden_set.json)
│   └── chroma_db/                # persistent vector store (gitignored)
├── cloudflare/                   # Worker + container config for Cloudflare
└── .github/workflows/            # deploy-cloudflare.yml ("Deploy to Cloudflare")
```

---

## 📚 Documentation

- **`AGENTS.md`** — the complete, unabridged spec (all planning revisions, current governing answers per decision area). This is the source of truth for AI coding agents and for resolving any ambiguity in this README.
- **`doc/Guide.pdf`** — the same content as `AGENTS.md`, regenerated as a human-readable PDF.
- **`doc/AtriumDesk_Review_2026-10.pdf`** (+ `.md` source) — the October 2026 review: research against comparable platforms, every change and bug fix, API and data-model changes, how to use the new features, verification and open items. Summarised as Part E of `AGENTS.md`.
- **`client/README.md`** — the web client: routes per role, scripts, the PWA and the embed/widget.

`doc/` holds internal/academic working files and isn't tracked in git (see `.gitignore`), so its PDFs live locally only, not on GitHub.

### Known issues

- Guests asking about the university's scholarships in some wordings get "no information" while students get an answer (golden case `guest-scholarships-coverage`); a guest-scope prompt fix is pending measurement.
- The AI service's failover needs valid keys for every provider in `CLOUD_LLM_ORDER`; a free Groq key allows 200,000 tokens a day.

---

## 👥 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

No license file is currently included in this repository — all rights reserved by default until one is added.

---

<p align="center">Built by <b>Syed Ibrahim Ali</b> — Full-Stack &amp; AI Engineer</p>
