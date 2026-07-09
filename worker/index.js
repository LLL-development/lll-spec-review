// ============================================================
// 朱入れ (Shuire) — worker/index.js
// The entire backend: auth, projects, members, documents.
//
// LESSON NOTES:
//
// - Hono is a tiny router built for Workers. Think Express,
//   but Web-standard Request/Response and ~14kb.
//
// - Every /api route below runs through requireUser, which
//   turns the session cookie into c.get("user"). No cookie /
//   expired session → 401 before any handler runs.
//
// - Permission checks live HERE now (they were Postgres RLS
//   on Supabase). Rule of thumb: every handler that touches a
//   project answers two questions first — who are you
//   (session), and are you allowed to see this project
//   (canAccessProject / requireInternal).
//
// - Static assets: any request that doesn't match a route here
//   falls through to the ASSETS binding (the dist/ folder),
//   so one Worker serves both the API and the frontend.
// ============================================================

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { notifyNewComment } from "./notify.js";
import {
  COOKIE_NAME, uuid,
  hashPassword, verifyPassword, generatePassword,
  createSession, getSessionUser, destroySession,
  isInternal, canAccessProject, canCommentOnProject,
} from "./lib.js";

const app = new Hono();

const cookieOpts = {
  httpOnly: true,      // page JS can't read it
  secure: true,        // HTTPS only
  sameSite: "Lax",     // sent on normal navigation, not cross-site POSTs
  path: "/",
  maxAge: 30 * 24 * 3600,
};

// ---------- middleware ----------

// Attach the user (or null) to every request
app.use("/api/*", async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  c.set("user", await getSessionUser(c.env.DB, token));
  await next();
});

// Gate: must be logged in (everything except /api/auth/*)
const requireUser = async (c, next) => {
  if (!c.get("user")) return c.json({ error: "ログインが必要です / Sign in required" }, 401);
  await next();
};

// Gate: must be internal staff
const requireInternal = async (c, next) => {
  if (!isInternal(c.get("user"))) return c.json({ error: "権限がありません / Forbidden" }, 403);
  await next();
};

app.use("/api/projects/*", requireUser);
app.use("/api/projects", requireUser);
app.use("/api/documents/*", requireUser);
app.use("/api/comments/*", requireUser);
app.use("/api/members/*", requireUser);

// ============================================================
// AUTH
// ============================================================

app.post("/api/auth/signup", async (c) => {
  const { email, password, display_name } = await c.req.json().catch(() => ({}));
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return c.json({ error: "メールアドレスが正しくありません" }, 400);
  if (!password || password.length < 8) return c.json({ error: "パスワードは8文字以上にしてください" }, 400);

  const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(cleanEmail).first();
  if (existing) return c.json({ error: "このメールアドレスは登録済みです" }, 409);

  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, display_name, role, password_hash) VALUES (?, ?, ?, 'client', ?)"
  ).bind(id, cleanEmail, (display_name || "").trim() || cleanEmail.split("@")[0], await hashPassword(password)).run();

  const { token } = await createSession(c.env.DB, id);
  setCookie(c, COOKIE_NAME, token, cookieOpts);
  return c.json({ ok: true });
});

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  const cleanEmail = (email || "").trim().toLowerCase();

  // Rate limit: 5 failed attempts per email per 15 minutes.
  // try/catch so login keeps working even before migration 0002 runs.
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    const row = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND at > ?"
    ).bind(cleanEmail, since).first();
    if (row && row.n >= 5) {
      return c.json({ error: "試行回数が多すぎます。15分ほど待ってからお試しください。" }, 429);
    }
  } catch (_) { /* table not created yet */ }

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE email = ?"
  ).bind(cleanEmail).first();

  // Same error either way — don't reveal which emails exist
  if (!user || !(await verifyPassword(password || "", user.password_hash))) {
    try {
      await c.env.DB.prepare("INSERT INTO login_attempts (email) VALUES (?)").bind(cleanEmail).run();
      // opportunistic cleanup of stale rows
      await c.env.DB.prepare("DELETE FROM login_attempts WHERE at <= ?").bind(since).run();
    } catch (_) {}
    return c.json({ error: "メールアドレスまたはパスワードが違います" }, 401);
  }

  try {
    await c.env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(cleanEmail).run();
  } catch (_) {}

  const { token } = await createSession(c.env.DB, user.id);
  setCookie(c, COOKIE_NAME, token, cookieOpts);
  return c.json({ ok: true });
});

// Self-service password change. Verifies the current password,
// then revokes every session and issues a fresh one — a stolen
// old session dies the moment the password changes.
app.post("/api/auth/change-password", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "ログインが必要です" }, 401);
  const { current_password, new_password } = await c.req.json().catch(() => ({}));
  if (!new_password || new_password.length < 8) {
    return c.json({ error: "新しいパスワードは8文字以上にしてください" }, 400);
  }
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id).first();
  if (!(await verifyPassword(current_password || "", row.password_hash))) {
    return c.json({ error: "現在のパスワードが違います" }, 401);
  }
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(await hashPassword(new_password), user.id).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  const { token } = await createSession(c.env.DB, user.id);
  setCookie(c, COOKIE_NAME, token, cookieOpts);
  return c.json({ ok: true });
});

app.post("/api/auth/logout", async (c) => {
  await destroySession(c.env.DB, getCookie(c, COOKIE_NAME));
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "not signed in" }, 401);
  return c.json(user);
});

// ============================================================
// PROJECTS
// ============================================================

app.get("/api/projects", async (c) => {
  const user = c.get("user");
  const sql = isInternal(user)
    ? "SELECT id, name, client_name, created_at FROM projects ORDER BY created_at DESC"
    : `SELECT p.id, p.name, p.client_name, p.created_at
         FROM projects p JOIN project_members m ON m.project_id = p.id
        WHERE m.user_id = ? ORDER BY p.created_at DESC`;
  const stmt = isInternal(user) ? c.env.DB.prepare(sql) : c.env.DB.prepare(sql).bind(user.id);
  const { results } = await stmt.all();
  return c.json(results);
});

app.post("/api/projects", requireInternal, async (c) => {
  const { name, client_name } = await c.req.json().catch(() => ({}));
  if (!name?.trim()) return c.json({ error: "プロジェクト名を入力してください" }, 400);
  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO projects (id, name, client_name, created_by) VALUES (?, ?, ?, ?)"
  ).bind(id, name.trim(), (client_name || "").trim(), c.get("user").id).run();
  return c.json({ id });
});

app.get("/api/projects/:id", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("id");
  if (!(await canAccessProject(c.env.DB, user, projectId))) {
    return c.json({ error: "not found" }, 404); // 404 not 403: don't confirm it exists
  }
  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) return c.json({ error: "not found" }, 404);
  return c.json(project);
});

// ============================================================
// MEMBERS (internal only)
// ============================================================

app.get("/api/projects/:id/members", requireInternal, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.user_id, m.member_role, u.display_name, u.email, u.role AS account_role
       FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ?`
  ).bind(c.req.param("id")).all();
  return c.json(results);
});

app.post("/api/projects/:id/members", requireInternal, async (c) => {
  const { email, member_role } = await c.req.json().catch(() => ({}));
  const roles = ["owner", "client_commenter", "client_viewer"];
  if (!roles.includes(member_role)) return c.json({ error: "invalid role" }, 400);

  const target = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind((email || "").trim().toLowerCase()).first();
  if (!target) return c.json({ error: "そのメールアドレスのユーザーが見つかりません。先にアカウント登録が必要です。" }, 404);

  try {
    await c.env.DB.prepare(
      "INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, ?)"
    ).bind(c.req.param("id"), target.id, member_role).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "すでにメンバーです" }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

app.delete("/api/projects/:id/members/:userId", requireInternal, async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM project_members WHERE project_id = ? AND user_id = ?"
  ).bind(c.req.param("id"), c.req.param("userId")).run();
  return c.json({ ok: true });
});

// ============================================================
// DOCUMENTS
// ============================================================

app.get("/api/projects/:id/documents", async (c) => {
  const projectId = c.req.param("id");
  if (!(await canAccessProject(c.env.DB, c.get("user"), projectId))) {
    return c.json({ error: "not found" }, 404);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, filename, version, uploaded_at FROM documents
      WHERE project_id = ? ORDER BY filename, version DESC`
  ).bind(projectId).all();
  return c.json(results);
});

// Upload: multipart form with a "file" field. Internal only.
app.post("/api/projects/:id/documents", requireInternal, async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "ファイルがありません" }, 400);
  if (!/\.html?$/i.test(file.name)) return c.json({ error: "HTMLファイル(.html / .htm)のみ対応です" }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: "10MB以下にしてください" }, 400);

  // version bump per (project, filename)
  const prev = await c.env.DB.prepare(
    "SELECT MAX(version) AS v FROM documents WHERE project_id = ? AND filename = ?"
  ).bind(projectId, file.name).first();
  const version = (prev?.v || 0) + 1;

  const id = uuid();
  const r2Key = `${projectId}/${id}.html`;

  // R2 first, then D1 — if the DB write fails we clean up the object,
  // never the other way round (a DB row pointing at nothing = broken doc).
  await c.env.DOCS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  try {
    await c.env.DB.prepare(
      `INSERT INTO documents (id, project_id, filename, r2_key, version, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, projectId, file.name, r2Key, version, c.get("user").id).run();
  } catch (e) {
    await c.env.DOCS.delete(r2Key);
    throw e;
  }

  return c.json({ id, version });
});

// Metadata + sibling versions
app.get("/api/documents/:id", async (c) => {
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?")
    .bind(c.req.param("id")).first();
  if (!doc || !(await canAccessProject(c.env.DB, c.get("user"), doc.project_id))) {
    return c.json({ error: "not found" }, 404);
  }
  const { results: versions } = await c.env.DB.prepare(
    `SELECT id, version, uploaded_at FROM documents
      WHERE project_id = ? AND filename = ? ORDER BY version DESC`
  ).bind(doc.project_id, doc.filename).all();
  const { r2_key, ...meta } = doc; // r2 keys are internal detail
  const can_comment = await canCommentOnProject(c.env.DB, c.get("user"), doc.project_id);
  return c.json({ ...meta, versions, can_comment });
});

// The HTML itself, streamed from R2 (after the same access check)
app.get("/api/documents/:id/content", async (c) => {
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?")
    .bind(c.req.param("id")).first();
  if (!doc || !(await canAccessProject(c.env.DB, c.get("user"), doc.project_id))) {
    return c.json({ error: "not found" }, 404);
  }
  const obj = await c.env.DOCS.get(doc.r2_key);
  if (!obj) return c.json({ error: "file missing" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8", // plain, NOT text/html:
      // the browser must never render this URL directly as a page —
      // the frontend fetches it and renders inside the sandboxed iframe.
      "Cache-Control": "private, no-store",
    },
  });
});

// ============================================================
// COMMENTS (Phase 2)
// ============================================================

// Shared: load a document IF the current user may access its project
async function getAccessibleDoc(c, docId) {
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first();
  if (!doc) return null;
  if (!(await canAccessProject(c.env.DB, c.get("user"), doc.project_id))) return null;
  return doc;
}

app.get("/api/documents/:id/comments", async (c) => {
  const doc = await getAccessibleDoc(c, c.req.param("id"));
  if (!doc) return c.json({ error: "not found" }, 404);
  const { results } = await c.env.DB.prepare(
    `SELECT cm.id, cm.anchor, cm.body, cm.author_id, cm.parent_id, cm.resolved, cm.created_at,
            u.display_name AS author_name, u.role AS author_role
       FROM comments cm JOIN users u ON u.id = cm.author_id
      WHERE cm.document_id = ? ORDER BY cm.created_at ASC`
  ).bind(doc.id).all();
  return c.json(results.map(r => ({ ...r, anchor: r.anchor ? JSON.parse(r.anchor) : null })));
});

app.post("/api/documents/:id/comments", async (c) => {
  const doc = await getAccessibleDoc(c, c.req.param("id"));
  if (!doc) return c.json({ error: "not found" }, 404);
  if (!(await canCommentOnProject(c.env.DB, c.get("user"), doc.project_id))) {
    return c.json({ error: "コメント権限がありません / No comment permission" }, 403);
  }
  const { body, anchor, parent_id } = await c.req.json().catch(() => ({}));
  const text = (body || "").trim();
  if (!text) return c.json({ error: "コメントを入力してください" }, 400);
  if (text.length > 4000) return c.json({ error: "コメントが長すぎます(4000文字まで)" }, 400);

  if (parent_id) {
    const parent = await c.env.DB.prepare(
      "SELECT 1 FROM comments WHERE id = ? AND document_id = ?"
    ).bind(parent_id, doc.id).first();
    if (!parent) return c.json({ error: "返信先が見つかりません" }, 400);
  }

  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO comments (id, document_id, anchor, body, author_id, parent_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id, doc.id,
    anchor ? JSON.stringify(anchor) : null,
    text, c.get("user").id, parent_id || null
  ).run();

  // Notify AFTER responding — waitUntil keeps the Worker alive for
  // background work without making the user wait for email APIs.
  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?")
    .bind(doc.project_id).first();
  c.executionCtx.waitUntil(notifyNewComment(c.env, {
    project, doc,
    author: c.get("user"),
    body: text,
    isReply: !!parent_id,
  }));

  return c.json({ id });
});

// resolve/unresolve (any commenter on the project) / edit body (author only)
app.patch("/api/comments/:id", async (c) => {
  const cm = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?")
    .bind(c.req.param("id")).first();
  if (!cm) return c.json({ error: "not found" }, 404);
  const doc = await getAccessibleDoc(c, cm.document_id);
  if (!doc) return c.json({ error: "not found" }, 404);

  const user = c.get("user");
  const patch = await c.req.json().catch(() => ({}));

  if ("resolved" in patch) {
    if (!(await canCommentOnProject(c.env.DB, user, doc.project_id))) {
      return c.json({ error: "権限がありません" }, 403);
    }
    await c.env.DB.prepare("UPDATE comments SET resolved = ? WHERE id = ?")
      .bind(patch.resolved ? 1 : 0, cm.id).run();
  }
  if ("body" in patch) {
    if (cm.author_id !== user.id) return c.json({ error: "自分のコメントのみ編集できます" }, 403);
    const text = (patch.body || "").trim();
    if (!text) return c.json({ error: "コメントを入力してください" }, 400);
    await c.env.DB.prepare("UPDATE comments SET body = ? WHERE id = ?").bind(text, cm.id).run();
  }
  return c.json({ ok: true });
});

app.delete("/api/comments/:id", async (c) => {
  const cm = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?")
    .bind(c.req.param("id")).first();
  if (!cm) return c.json({ error: "not found" }, 404);
  const doc = await getAccessibleDoc(c, cm.document_id);
  if (!doc) return c.json({ error: "not found" }, 404);

  const user = c.get("user");
  if (cm.author_id !== user.id && !isInternal(user)) {
    return c.json({ error: "権限がありません" }, 403);
  }
  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(cm.id).run();
  return c.json({ ok: true });
});

// ============================================================
// INVITES & PASSWORD RESET (internal only)
// ============================================================

// Invite by email. If no account exists, one is created with an
// auto-generated password — returned ONCE in this response.
app.post("/api/projects/:id/members/invite", requireInternal, async (c) => {
  const { email, display_name, member_role } = await c.req.json().catch(() => ({}));
  const cleanEmail = (email || "").trim().toLowerCase();
  const roles = ["owner", "client_commenter", "client_viewer"];
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return c.json({ error: "メールアドレスが正しくありません" }, 400);
  if (!roles.includes(member_role)) return c.json({ error: "invalid role" }, 400);

  let target = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
  let password = null;

  if (!target) {
    password = generatePassword();
    const newId = uuid();
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, display_name, role, password_hash) VALUES (?, ?, ?, 'client', ?)"
    ).bind(newId, cleanEmail, (display_name || "").trim() || cleanEmail.split("@")[0], await hashPassword(password)).run();
    target = { id: newId };
  }

  try {
    await c.env.DB.prepare(
      "INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, ?)"
    ).bind(c.req.param("id"), target.id, member_role).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "すでにメンバーです" }, 409);
    throw e;
  }
  return c.json({ ok: true, created: !!password, email: cleanEmail, password });
});

// Regenerate a client's password (e.g. forgotten). Client accounts
// only — internal staff manage their own. All their sessions are
// revoked so a lost/shared old password can't linger.
app.post("/api/members/:userId/reset-password", requireInternal, async (c) => {
  const target = await c.env.DB.prepare(
    "SELECT id, role, email FROM users WHERE id = ?"
  ).bind(c.req.param("userId")).first();
  if (!target) return c.json({ error: "not found" }, 404);
  if (target.role !== "client") return c.json({ error: "クライアントアカウントのみリセットできます" }, 403);

  const password = generatePassword();
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(await hashPassword(password), target.id).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
  return c.json({ ok: true, email: target.email, password });
});

// ---------- 404 for unknown API routes; everything else → static assets ----------

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
