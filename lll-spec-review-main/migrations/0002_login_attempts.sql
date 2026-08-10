-- ============================================================
-- Migration 0002 — Phase 3/4: login rate limiting
-- Apply via D1 Console (paste) or the Deploy workflow's
-- "sql_file" input: migrations/0002-login-attempts.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL,
  at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email, at);
