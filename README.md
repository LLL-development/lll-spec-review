# 朱入れ (Shuire) — HTML Spec Review Tool

Phase 1: Viewer + Auth. Pure HTML/CSS/JS frontend + Supabase backend.

「朱入れ」= the traditional practice of marking up manuscripts in red ink — which is exactly what this tool is for.

## Files

```
shuire/
├── schema.sql        ← run this in Supabase SQL Editor
├── index.html        ← login / signup
├── dashboard.html    ← project list + create (internal only)
├── project.html      ← documents, upload w/ versioning, member management
├── viewer.html       ← sandboxed iframe viewer + version switcher
├── js/
│   ├── config.js     ← ⚠ fill in your Supabase URL + anon key
│   └── app.js        ← shared helpers (auth guard, header, utils)
└── css/
    └── style.css
```

## Setup (≈10 minutes)

### 1. Create a Supabase project
supabase.com → New project (Singapore region is closest to JB).

### 2. Run the schema
Supabase Dashboard → SQL Editor → paste the contents of `schema.sql` → Run.
This creates all tables, RLS policies, the signup trigger, and the private `documents` storage bucket.

### 3. Configure auth
Dashboard → Authentication → Sign In / Up:
- Email provider: enabled (default)
- Optional: turn **off** "Confirm email" while testing, so signups work instantly.

### 4. Fill in `js/config.js`
Dashboard → Project Settings → API → copy Project URL and anon public key.

### 5. Deploy to Cloudflare Pages

Connect the repo to Cloudflare Pages and configure:

| Setting | Value |
|---|---|
| Build command | `bash ./build.sh` |
| Build output directory | `dist` |
| Environment variables | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |

`build.sh` copies everything into `./dist` and injects the two env vars into
`js/config.js` at build time — so you never commit real keys to the repo.
(If the env vars aren't set, it falls back to whatever is written in `js/config.js`
and prints a warning. To make missing config a hard CI failure, uncomment the
`exit 1` line in the script.)

A `_headers` file with basic security headers is included and copied into `dist`
automatically — Cloudflare Pages picks it up on deploy.

Local testing:

```bash
bash ./build.sh
cd dist && python3 -m http.server 8000
```

### 6. Bootstrap your internal team
Everyone (including you) signs up once via the app, then promote internal members in the SQL Editor:

```sql
update public.profiles set role = 'internal'
where email in ('philip@lll.example', 'tata@lll.example');
```

New signups default to `client` — they see nothing until an internal user adds them to a project.

## How it works

- **Roles**: `internal` = full access to all projects. `client` = only projects they're a member of (`project_members`), enforced by Postgres RLS — not just the UI.
- **Versioning**: re-uploading a file with the same name creates v2, v3… The viewer has a version switcher.
- **Storage**: files live in a private bucket at `{project_id}/{document_id}.html`; downloads go through RLS-checked storage policies.
- **Sandboxing**: uploaded HTML renders in `<iframe sandbox="allow-scripts allow-popups">` — scripts inside the doc run (so interactive mocks like まいぷれ work), but the doc gets an opaque origin and **cannot** touch the app's session/localStorage.

## Client onboarding flow

1. Client signs up at the login page (name + email + password).
2. You add them on the project page by email, choosing a role (view only / can comment).
3. They log in → see only their project(s).

## Next: Phase 2 (comments)

The `comments` table and its RLS policies are already in the schema, including the `client_viewer` vs `client_commenter` distinction — so Phase 2 is purely frontend work:
pin placement via postMessage into the iframe, selector generation, threads, resolve, Supabase Realtime.
