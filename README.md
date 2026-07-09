# lll-spec-review  (brand: 朱入れ / Shuire)

Logical name everywhere in code & infra: **`lll-spec-review`** (Worker, D1, R2, cookie).
The user-facing brand 朱入れ lives ONLY in `js/brand.js` — rebrand = edit one file.

Phase 1 on a **100% Cloudflare stack**: one Worker serves the API *and* the static frontend.
Backend: Workers + D1 (SQLite) + R2 (file storage). Expected cost: **$0/month**.

「朱入れ」= marking up manuscripts in red ink — which is exactly what this tool is for.

## Architecture

```
Browser ──fetch──▶ Cloudflare Worker (lll-spec-review)
                    ├── /api/*  → worker/index.js (Hono)
                    │     ├── D1  "lll-spec-review"            ← users, sessions, projects, docs
                    │     └── R2  "lll-spec-review-documents"  ← the uploaded HTML files
                    └── /*      → dist/ (static assets: the frontend)
```

- **Auth**: email + password. PBKDF2-hashed passwords, random session tokens in an
  httpOnly cookie, only the token's SHA-256 hash stored in D1.
- **Permissions**: enforced in the Worker (`worker/lib.js`) — internal staff see all
  projects; clients see only projects they're members of. The browser never talks
  to the database directly.
- **Files**: R2 keys are `{project_id}/{document_id}.html`; downloads always go
  through an access-checked API route, never a public URL.
- **Sandboxing**: specs render in `<iframe sandbox="allow-scripts allow-popups">` —
  interactive mocks work, but scripts get an opaque origin and can't touch the
  session cookie (which is httpOnly anyway — belt and suspenders).

## Files

```
lll-spec-review/
├── .github/workflows/deploy.yml  ← cloud deploys (for Termux / CI)
├── wrangler.jsonc      ← Worker config (⚠ paste your D1 database_id)
├── package.json        ← hono + wrangler, npm scripts
├── schema.sql          ← D1 schema
├── build.sh            ← copies frontend → dist/
├── worker/
│   ├── index.js        ← all API routes (Hono)
│   └── lib.js          ← passwords, sessions, permission helpers
├── index.html          ← login / signup
├── dashboard.html      ← project list + create
├── project.html        ← docs, upload w/ versioning, members
├── viewer.html         ← sandboxed viewer + version switcher
├── js/  (api.js, app.js, brand.js ← the brand lives here)
└── css/ (style.css)
```

## Setup (~15 minutes)

```bash
npm install
npx wrangler login                       # opens browser, auth with your CF account

# 1. Create the database and paste its id into wrangler.jsonc
npx wrangler d1 create lll-spec-review            # → copy "database_id" into wrangler.jsonc

# 2. Create the file bucket
npx wrangler r2 bucket create lll-spec-review-documents

# 3. Apply the schema (remote = the real DB)
npm run db:remote

# 4. Ship it
npm run deploy                           # builds dist/ then wrangler deploy
```

Your app is now live at `https://lll-spec-review.<your-subdomain>.workers.dev`
(custom domain attachable in the Cloudflare dashboard → Workers → lll-spec-review → Domains).

### Local development

```bash
npm run db:local     # apply schema to the local dev DB (first time only)
npm run dev          # http://localhost:8787 — local D1 + local R2, full stack
```

### Bootstrap your internal team

Everyone signs up once via the app (new accounts default to `client`), then promote:

```bash
npx wrangler d1 execute lll-spec-review --remote --command \
  "UPDATE users SET role='internal' WHERE email IN ('philip@lll.example','tata@lll.example');"
```

## Client onboarding flow

1. Client signs up on the login page (name + email + password — no email confirmation dance).
2. You add them on the project page by email, picking a role (view only / can comment).
3. They log in → see only their project(s).

## Working from Termux (Android)

What works and what doesn't, honestly:

| Command | Termux? | Why |
|---|---|---|
| `npm install` | ✅ | wrangler installs; `workerd` is an optional dep with no Android build — npm skips it with a warning, that's fine |
| `npx wrangler login` | ⚠️ | The browser round-trip can be flaky; the reliable way is an API token: `export CLOUDFLARE_API_TOKEN=...` in `~/.bashrc` |
| `npx wrangler d1/r2 ...` (remote) | ✅ | Pure API calls |
| `npm run deploy` | ✅* | Bundling uses esbuild, which ships Android ARM64 binaries |
| `npm run dev` (local) | ❌ | Local dev runs `workerd`, Cloudflare's runtime — no Android build exists |
| `npx wrangler dev --remote` | ✅ | Dev session runs on Cloudflare's edge instead; Termux is just the terminal |

\* If deploy ever breaks on your device (esbuild binary issues after an Android update), don't fight it — use the cloud path below.

Termux prep:

```bash
pkg install nodejs-lts git
git clone <your repo> && cd lll-spec-review
npm install
export CLOUDFLARE_API_TOKEN=your-token   # → dash.cloudflare.com → My Profile → API Tokens
npm run deploy
```

### Plan B: deploy from GitHub Actions (zero local requirements)

`.github/workflows/deploy.yml` is included. Push to `main` → GitHub builds and deploys.
Termux then only needs `git` — or you can even edit on github.com from the phone.

Setup once:
1. Push this repo to GitHub.
2. Repo → Settings → Secrets and variables → Actions → add `CLOUDFLARE_API_TOKEN`
   (token template "Edit Cloudflare Workers", plus Account → D1 → Edit permission).
3. First-time DB setup: Actions tab → Deploy → Run workflow → tick "apply schema".

After that, every `git push` deploys. Termux becomes a thin git client, which it is genuinely good at.

## Costs

Workers Free: 100k requests/day. D1 Free: 5GB + 5M row reads/day. R2 Free: 10GB
storage, zero egress fees. A client review tool won't scratch any of these.
If you ever outgrow Free, the Workers paid plan is $5/mo — and lets you raise
`PBKDF2_ITERATIONS` in `worker/lib.js` for stronger password hashing.

## Phase 2: Comments (implemented)

- **Pin comments**: toggle コメントモード in the viewer, click anywhere in the
  document (tables, SVG shapes, anything) → a numbered pin + threaded comment.
- **Anchoring**: each comment stores a CSS selector + a text snippet + relative
  x/y. Selector resolves first; if the doc changed, text-snippet matching takes
  over; if both fail the comment still shows in the sidebar (just unpinned).
- **Threads**: replies, resolve/reopen, delete (author or internal). Resolved
  threads are hidden by default. LLL staff get an internal badge.
- **Overlay isolation**: `js/overlay.js` is injected into the doc inside the
  sandboxed iframe and talks to the viewer only via postMessage — it never sees
  the session cookie.
- **Updates**: light polling (15s + on tab focus). No websockets to babysit.
- **Mobile**: the comment panel becomes a bottom sheet (💬 button in toolbar).

## Client invites with auto-generated passwords

On the project page, invite by email:
- Email already registered → added to the project.
- Not registered → account auto-created with a generated password
  (e.g. `momiji-kaze-x7k3n2`), shown **once** with a copy button. Share it with
  the client through a safe channel.
- Forgot it? **PWリセット** next to any client member generates a fresh one and
  revokes their old sessions.

## Next: Phase 3 (notifications)

New-comment notifications → email + Lorely. Also worth adding: a self-service
password change screen for clients, and login rate limiting.
