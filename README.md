# UniAssist 🎓
### Multi-tenant AI Student Portal SaaS — launched for Muhammad Ali Jinnah University (MAJU)

![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=flat&logo=react)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?style=flat&logo=nodedotjs)
![Python](https://img.shields.io/badge/AI-Python-3776AB?style=flat&logo=python)

UniAssist is a full-stack AI-powered platform that consolidates university student services into one intelligent system, built database-per-tenant so any university can be onboarded — not just MAJU. At its core is a smart chatbot (RAG over each tenant's own scraped website content) that supports voice input and Roman Urdu — making university help accessible to every student. There is no mobile app; the client is a responsive web app with an offline-capable PWA shell.

---

## ✨ Features

### 🎓 Student Portal
| Module | Status | Description |
|--------|--------|-------------|
| **Guest Page** | ✅ | Public landing page showcasing portal features before login |
| **Auth** | ✅ | Register / login with MAJU email, OTP verification, password recovery |
| **AI Chatbot** | ✅ | Answers university queries via RAG over MAJU website; voice input + Roman Urdu support; profanity filter with admin flagging |
| **Issue Tracker** | ✅ | Submit and track support requests with attachments; 20s polling sync with department staff; in-app bell + email notifications |
| **Job Portal** | ✅ | Scraped + manually-entered listings, hard-rule + embedding-based matching, skill-gap analysis against an uploaded CV |
| **Scholarship Portal** | ✅ | Scraped + manually-entered listings, CGPA-aware matching, cached LLM match explanations |
| **Events** | ✅ | Manual-entry campus events (no scrapable source exists) with save/reminder support |
| **Profile Page** | ✅ | Unified academic/career/study-abroad/events profile, auto-filled from CV parsing or a tenant's student-email pattern |

### 🏢 Staff Portal (Department-scoped)
| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard** | ✅ | Open / In Progress / Resolved-this-week cards, 7-day trend chart, avg first-response time, recent issues, your own reply count |
| **Department Inbox** | ✅ | Only your department's issues; filter by status with live counts; 20s polling |
| **Issue Detail** | ✅ | Full thread with student info, attachments, all replies |
| **Status Management** | ✅ | Update status (Pending → In Progress → Resolved → Closed); student notified by bell + email |
| **Reply System** | ✅ | Threaded replies to students; notification fires on every reply |

### ⚙️ Admin Panel
| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard** | ✅ | Stat cards (students/staff/admins/departments/issues/chats/flagged) + 7-day issue trend + recent signups |
| **Users** | ✅ | List students with search and filters (blocked / flagged); detail drawer with issues, chats, flags; block/unblock with confirm |
| **Staff** | ✅ | Create staff with auto-generated `firstnamelastname@maju.<deptcode>.edu` + 12-char password (shown once + emailed); filter by department; deactivate |
| **Departments** | ✅ | Create / edit inline / soft-deactivate; reactivate |
| **Query** | ✅ | Cross-department issue analytics — top categories, by-department, avg resolution time, filterable table, read-only detail |
| **Data (Vector DB)** | ✅ | Direct-to-Python CRUD on the chatbot knowledge base; edit/add chunks; upload PDF / DOCX / TXT with auto chunking + embedding |
| **Logs & Activity** | ✅ | Three tabs: admin action audit (with redacted payload), login events (success + failures), chat browser with flagged-student filter |
| **Content Management** | ✅ | Manage scholarship/job/event sources, review scraped listings, self-service chatbot knowledge-base website scraping |

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

**Key libraries:** `recharts` (admin/staff dashboards), `react-hot-toast`, `lucide-react`, `multer`, `nodemailer` (Gmail SMTP), `pyjwt`, `pypdf`, `python-docx`, `langchain-text-splitters`.

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Python 3.10+
- MongoDB running locally or a cloud URI
- npm

### Installation

```bash
git clone https://github.com/ibrahim123-sia/UniAssist.git
cd UniAssist

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
PLATFORM_DB_NAME=UniAssistPlatform       # tenant registry + Super Admin users
JWT_SECRET=<long-random-string>          # tenant-user JWTs
PLATFORM_JWT_SECRET=<long-random-string> # Super Admin JWTs — must differ from JWT_SECRET
INTERNAL_SECRET=<long-random-string, must match python/.env>
FIELD_ENCRYPTION_KEY=<32-byte-hex>       # encrypts a tenant's own SMTP app password at rest
SUPERADMIN_EMAIL / SUPERADMIN_NAME / SUPERADMIN_PASSWORD   # seeded on first run
DEFAULT_TENANT_SLUG=maju                 # which tenant guest/legacy traffic resolves to
EMAIL_USER / EMAIL_PASS                  # platform-default Gmail SMTP fallback
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

Log in as the admin you seeded, create departments + staff from the admin panel, then register a student through the UI to exercise the full flow.

---

## 📁 Project Structure

```
UniAssist/
├── client/                       # React frontend
│   └── src/
│       ├── platform/             # /platform/* Super Admin pages, components, layout
│       ├── administrator/        # /admin/* pages, components, layout
│       ├── staff/                # /staff/* dashboard + issue inbox (role-delegable)
│       ├── student/              # chat, issues, profile, scholarships, jobs, events
│       ├── guest/                # public landing + guest chatbot
│       ├── auth/                 # login, register, ProtectedRoute
│       ├── components/           # Sidebar, NotificationBell, MainLayout
│       ├── redux/slices/         # auth, chat, issue, notification, platform,
│       │                         # department, admin{Stats,User,Staff,
│       │                         # Query,Data,Log} slices
│       └── utils/                # axios, pythonAxios
├── server/                       # Node.js / Express
│   ├── controllers/              # user, chat, issue, department,
│   │                             # notification, admin*, platform, internal, message
│   ├── middlewares/              # auth, requireRole, requireStaffPermission, upload,
│   │                             # audit, platformAuth, auditPlatformWrites
│   ├── models/                   # User, Issue, Department, Chat, Listing,
│   │                             # Notification, AuditLog, LoginEvent, AiUsageLog
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
│   ├── moderation.py             # English + Roman-Urdu profanity check
│   ├── scraper.py                # self-service per-tenant website scraper
│   └── chroma_db/                # persistent vector store (gitignored)
```

---

## 👥 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

No license file is currently included in this repository — all rights reserved by default until one is added.
