# Migrations

The production database (f382b602-…) was originally created from the raw
`schema.sql`, so tables 0001 already exist there. Wrangler tracks applied
migrations in a `d1_migrations` table.

**First time switching this DB to wrangler migrations:** tell wrangler that
0001 and 0002 are already applied so it doesn't try to recreate tables:

    npx wrangler d1 migrations apply lll-spec-review --remote

If wrangler tries to re-run 0001 and errors with "table already exists",
mark them applied manually via the D1 console:

    INSERT INTO d1_migrations (name) VALUES
      ('0001_initial_schema.sql'), ('0002_login_attempts.sql');

New migrations (0003+) then apply cleanly on every deploy.
