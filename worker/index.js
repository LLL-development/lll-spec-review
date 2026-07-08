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
import {
  COOKIE_NAME, uuid,
  hashPassword, verifyPassword,
  createSession, getSessionUser, destroySession,
  isInternal, canAccessProject,
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

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE email = ?"
  ).bind(cleanEmail).first();

  // Same error either way — don't reveal which emails exist
  if (!user || !(await verifyPassword(password || "", user.password_hash))) {
    return c.json({ error: "メールアドレスまたはパスワードが違います" }, 401);
  }

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
    `SELECT m.user_id, m.member_role, u.display_name, u.email
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
  return c.json({ ...meta, versions });
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

// ---------- 404 for unknown API routes; everything else → static assets ----------

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
