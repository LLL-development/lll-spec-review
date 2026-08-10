# lll-spec-review — GitHub Actions Deployment Setup Guide

One-time setup for deploying via GitHub Actions (no local wrangler / Termux required).
After this, every push to `main` deploys automatically.

> Prerequisite: the repo is already pushed to GitHub with the included
> `.github/workflows/deploy.yml`. The very first Actions run will have failed —
> that's expected, because the resources below don't exist yet.

---

## On Cloudflare (one-time)

### 1. Create the D1 database
Dashboard → **Storage & Databases → D1 → Create database**

- Name it exactly: `lll-spec-review`
- After creating, **copy the Database ID** (a UUID shown on the database page).
  You'll need it in step 5.

### 2. Create the R2 bucket
Dashboard → **R2 → Create bucket**

- Name it exactly: `lll-spec-review-documents`

> ⚠️ If this account has never used R2 before, Cloudflare requires enabling R2
> first, which asks for a payment method — even though the free tier itself
> stays $0. One-time annoyance.

### 3. Create the API token
Dashboard → profile icon (top right) → **My Profile → API Tokens → Create Token**

- Use the **"Edit Cloudflare Workers"** template
- Before creating, add one extra permission row: **Account → D1 → Edit**
  (the template doesn't include D1, and the schema step needs it)
- Copy the token — it is shown **only once**.

---

## On GitHub

### 4. Add the secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `CLOUDFLARE_API_TOKEN`
- Value: the token from step 3

### 5. Paste the Database ID
Edit `wrangler.jsonc` and replace `PASTE-YOUR-DATABASE-ID-HERE` with the UUID
from step 1, then commit and push. (The GitHub web editor is fine for this.)

### 6. First deploy — with schema
**Actions** tab → **Deploy** → **Run workflow** → tick **"apply schema"** → Run.

This applies `schema.sql` to the remote D1 database and deploys the Worker.
Subsequent pushes to `main` deploy automatically; the schema checkbox is only
needed for this first run (or future schema changes).

---

## After it's green

### 7. Sign up
Open `https://lll-spec-review.<your-subdomain>.workers.dev` and create an
account with your own email. New accounts start as `client`.

### 8. Promote yourself to internal
No wrangler needed — Dashboard → **D1 → lll-spec-review → Console** tab, run:

```sql
UPDATE users SET role='internal' WHERE email IN ('your@email.com');
```

Log out and back in — the project-creation form appears. Repeat for teammates
(or add multiple emails to the `IN (...)` list) after they've signed up once.

---

## Troubleshooting

### "More than one account" error on deploy
If your Cloudflare login belongs to multiple accounts (e.g. personal + company
org), wrangler can't guess which one to use.

Fix:
1. Add a second repo secret `CLOUDFLARE_ACCOUNT_ID`
   (the Account ID is shown on any Cloudflare dashboard page — right sidebar,
   or in the dashboard URL).
2. Add one line to **both** `env:` blocks in `.github/workflows/deploy.yml`:

```yaml
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Other failures
Open the failed step in the Actions log — wrangler's error messages are
usually specific (wrong token permissions, name mismatch, missing binding).
Double-check the exact resource names:

| Resource | Exact name |
|---|---|
| Worker | `lll-spec-review` |
| D1 database | `lll-spec-review` |
| R2 bucket | `lll-spec-review-documents` |
| GitHub secret | `CLOUDFLARE_API_TOKEN` |
