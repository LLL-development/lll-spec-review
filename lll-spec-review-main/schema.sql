-- ============================================================
-- 朱入れ (Shuire) — D1 (SQLite) schema
-- Apply with:
--   npx wrangler d1 execute shuire --remote --file=./schema.sql
-- (drop --remote to apply to your local dev database)
-- ============================================================

CREATE TABLE users (
  id            TEXT PRIMARY KEY,                 -- crypto.randomUUID()
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'client'
                CHECK (role IN ('internal','client')),
  password_hash TEXT NOT NULL,                    -- pbkdf2$iter$salt$hash
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                    -- sha256 of the cookie token
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'client_commenter'
              CHECK (member_role IN ('owner','client_commenter','client_viewer')),
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  r2_key      TEXT NOT NULL,                      -- {project_id}/{document_id}.html
  version     INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (project_id, filename, version)
);

-- Phase 2 ready
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  anchor      TEXT,                               -- JSON: {selector, text_snippet, x, y}
  body        TEXT NOT NULL,
  author_id   TEXT NOT NULL REFERENCES users(id),
  parent_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_comments_document ON comments(document_id);
CREATE INDEX idx_members_user      ON project_members(user_id);
CREATE INDEX idx_sessions_expiry   ON sessions(expires_at);
