# AtriumDesk — web client

React 19 + Redux Toolkit + Tailwind CSS 4, built with Vite. One app serves every role: guests (prospective students), students, department staff, administrators and the platform Super Admin. It is a responsive web app with an installable PWA shell — there is no native mobile app.

## Scripts

```bash
npm install
npm run dev       # http://localhost:5173
npm run lint      # eslint .
npm run build     # production build in dist/
npm run preview   # serve the build locally
```

## Environment (`.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_SERVER_URL` | Node API (default `http://localhost:3000`) |
| `VITE_PYTHON_URL` | AI service (default `http://localhost:8000`; on Cloudflare it's the Worker's `/ai` path) |
| `VITE_SITE_URL` | Optional: this web client's own public address. The build then adds canonical links, absolute link-preview URLs and `sitemap.xml` |

## Routes

| Who | Paths |
|---|---|
| Guest (public) | `/` (admissions assistant — signed-in users are sent to their own home), `/?u=<university>` (a specific university's assistant, remembered), `/embed` (compact chat for the website widget), `/guest/scholarships`, `/guest/activities/:slug`, `/login`, `/register`, `/unsubscribe`, `/privacy`, `/terms` |
| Student | `/chat`, `/scholarships(/:id)`, `/jobs(/:id)`, `/events(/:id)` (with RSVP), `/saved` (saved items + application tracker), `/queue` (office walk-in queue — in the sidebar once an office uses it), `/issues`, `/issues/new`, `/issues/:id`, `/profile` (incl. search alerts and browser notifications) |
| Staff | `/staff/dashboard`, `/staff/issues`, `/staff/issues/:id`, `/staff/queue` (walk-in queue), `/staff/profile`; with delegated permissions also `/staff/data`, `/staff/content`, `/staff/activities`, `/staff/query(/:id)`, `/staff/failed-questions` |
| Administrator | `/admin/dashboard`, `/admin/users(/:id)`, `/admin/staff`, `/admin/departments`, `/admin/query(/:id)`, `/admin/data`, `/admin/failed-questions`, `/admin/content`, `/admin/activities`, `/admin/logs`, `/admin/health`, `/admin/settings`, `/admin/profile` |
| Super Admin | `/platform/login`, `/platform/dashboard`, `/platform/tenants(/new, /:slug)`, `/platform/usage`, `/platform/health`, `/platform/audit-log` |

Students use the left `Sidebar` (`components/Sidebar.jsx`); staff, administrators and the Super Admin use the shared `TopNavbar` (`components/layouts/TopNavbar.jsx`). The student sidebar and the staff/admin navbars show the university's logo (or initials) and a notification bell; the Super Admin's bar shows the platform mark.

## Layout of `src/`

```
auth/            Login, Register, ProtectedRoute, HomeRoute, roleHome.js
guest/           GuestChat (also the /embed widget view), GuestSidebar, guest scholarships/activities
student/         pages (chat, opportunities, issues, saved), components (Message, ApplicationTracker,
                 DetailStates, ShareActions, MatchedListingCard…)
staff/           StaffShell, dashboard, inbox, issue detail; components/IssueStaffTools
                 (internal notes, transfer, saved replies)
administrator/   AdminShell, pages, shared admin components (AdminTable, AdminModal, ShareAssistant…)
platform/        Super Admin shell and pages
profile/         Profile, YourDataCard (download my data / delete my account)
components/      Sidebar, NotificationBell, layouts, ImpersonationBanner, RouteMeta (page title + search tags)
redux/slices/    one slice per area (auth, chat, guest, issue, saved, scholarship, job, event,
                 notification, tenant, platform, admin*)
utils/           axios instance, branding.js (logo/initials), guestTenant.js (?u= handling),
                 seo.js (public pages' titles/descriptions, crawler-blocked paths)
```

## Guest university selection

Guests have no login, so there is no JWT tenant claim. `utils/guestTenant.js` reads `?u=<slug>` on start-up, stores it in `localStorage.guestTenant` (switching university also drops the previous guest session) and every guest request sends it as `tenant`. Without it the server uses its default tenant.

## Website widget

`public/widget.js` is loaded by a university's own website:

```html
<script src="https://<your AtriumDesk address>/widget.js" data-university="<university id>" async></script>
```

It adds a chat button (`data-label`, `data-color` optional) that opens `/embed?u=<id>` in an iframe panel; nothing loads until it's opened. `public/_headers` forbids framing everywhere except `/embed` and lets any site load `widget.js`.

## Search engines

`components/RouteMeta.jsx` sets each page's title, description, `robots` tag and canonical link from `utils/seo.js`. Public pages (`/`, `/guest/scholarships`, `/guest/activities/:slug`, `/login`, `/register`, `/privacy`, `/terms`) are indexable, and `?u=<university>` stays in the canonical link of the pages whose content depends on it; everything else, including `/embed` and `/unsubscribe`, is `noindex` (`public/_headers` also sends `X-Robots-Tag: noindex` for those two, since crawlers may not run JavaScript).

`vite-plugin-seo.js` runs at build time: it adds `WebApplication` structured data to `index.html`, writes `dist/robots.txt` (blocks the signed-in areas listed in `utils/seo.js`) and, when `VITE_SITE_URL` is set, `dist/sitemap.xml` and absolute canonical/`og:url`/`og:image` URLs. Both files must exist on disk: Cloudflare answers any missing path with `index.html`. The link-preview card is `public/og-image.png` (1200×630); `public/favicon.ico` is the tab icon for browsers and crawlers that don't take SVG.

## PWA

`public/manifest.json` and `public/sw.js` provide the installable shell and an offline fallback. Once a tenant is known, `App.jsx` swaps the manifest for the tenant's own (`/api/manifest/<slug>`) so the installed app carries the university's name and colour. The installed app opens at `/`, which sends signed-in users to their home.

The service worker also shows **browser notifications** (web push): `src/utils/push.js` subscribes the device with the server's VAPID public key (`/api/push/config`) and Profile → Browser notifications turns it on/off; logging out switches the device off. `main.jsx` registers the service worker only in the production build (in development it would fight Vite's hot reload), so test push with `npm run build && npx vite preview --port 5173` — on port 5173 so the API's CORS allows it.

## Conventions

- Colours come from the tenant palette (`administrator/utils/palette.js`, `getPalette(isDark, branding)`), not hardcoded per page.
- Thunks return `{ success, message }` objects instead of rejecting, so components can `unwrap()` and show the server's message.
- A detail page that can't load its item shows `DetailUnavailable` rather than "Loading…" forever.
