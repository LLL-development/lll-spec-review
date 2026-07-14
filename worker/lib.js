// ============================================================
// 朱入れ (Shuire) — worker/lib.js
// Auth, sessions, and permission helpers.
//
// LESSON NOTES:
//
// 1. Passwords are never stored — only a PBKDF2 hash with a
//    random per-user salt. Web Crypto (crypto.subtle) is the
//    only crypto available in Workers, and PBKDF2 is the
//    strongest password KDF it supports.
//
// 2. Sessions: on login we generate a random 256-bit token,
//    give the *token* to the browser (httpOnly cookie), and
//    store only its SHA-256 *hash* in D1. If the DB ever
//    leaks, the hashes are useless for hijacking sessions.
//
// 3. httpOnly cookie means page JavaScript cannot read the
//    token — so even if someone uploads a malicious HTML spec,
//    a script inside it can't steal sessions. (Belt: the
//    sandboxed iframe. Suspenders: httpOnly.)
// ============================================================

// PBKDF2 iterations. Workers Free gives ~10ms CPU per request;
// 25k iterations fits comfortably. On the paid plan you can
// raise this (the count is stored per-hash, so old passwords
// keep verifying and get stronger on next password change).
const PBKDF2_ITERATIONS = 25000;

const SESSION_DAYS = 30;
export const COOKIE_NAME = "lll_spec_review_session";

// ---------- small utils ----------

export const uuid = () => crypto.randomUUID();

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

export async function sha256Hex(str) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(str)));
}

// Constant-time-ish comparison (avoids early-exit timing leaks)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- passwords ----------

async function pbkdf2Hex(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256
  );
  return toHex(bits);
}

// Format: pbkdf2$<iterations>$<saltHex>$<hashHex>
export async function hashPassword(password) {
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterStr, salt, expected] = (stored || "").split("$");
  if (scheme !== "pbkdf2") return false;
  const actual = await pbkdf2Hex(password, salt, parseInt(iterStr, 10));
  return safeEqual(actual, expected);
}

// ---------- sessions ----------

export async function createSession(db, userId) {
  const token = randomHex(32); // this goes in the cookie
  const tokenHash = await sha256Hex(token); // this goes in the DB
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(tokenHash, userId, expires).run();
  return { token, expires };
}

export async function getSessionUser(db, token) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(tokenHash).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { id: row.id, email: row.email, display_name: row.display_name, role: row.role };
}

export async function destroySession(db, token) {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

// ---------- generated passwords (client invites) ----------
// Readable but strong: 2 romaji words + 6 chars from an
// unambiguous alphabet (no 0/O, 1/l/I). ~2^47 of entropy.

const PW_WORDS = [
  "sakura","momiji","kaze","yuki","hana","tsuki","hoshi","umi","yama","kawa",
  "sora","niji","kumo","mori","take","ume","kiku","fuji","nami","hikari",
  "asahi","yube","haru","natsu","aki","fuyu","tori","koi","tanuki","kitsune",
  "matsu","ishi","suna","shio","kome","ocha","mochi","yuzu","kaki","nashi",
];
const PW_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword() {
  const pick = (arr) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return arr[a[0] % arr.length];
  };
  let tail = "";
  for (let i = 0; i < 6; i++) tail += pick(PW_CHARS);
  return `${pick(PW_WORDS)}-${pick(PW_WORDS)}-${tail}`;
}

// ---------- permissions (this is where Supabase RLS moved to) ----------

export const isInternal = (user) => user?.role === "internal";

export async function isProjectMember(db, userId, projectId) {
  const row = await db.prepare(
    "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?"
  ).bind(projectId, userId).first();
  return !!row;
}

// May the user see this project at all?
export async function canAccessProject(db, user, projectId) {
  return isInternal(user) || await isProjectMember(db, user.id, projectId);
}

// May the user manage this project (upload, members, settings)?
// Project owners + internal staff.
export async function isProjectOwner(db, user, projectId) {
  if (isInternal(user)) return true;
  const row = await db.prepare(
    `SELECT 1 FROM project_members
      WHERE project_id = ? AND user_id = ? AND member_role = 'owner'`
  ).bind(projectId, user.id).first();
  return !!row;
}

// May the user comment? (Phase 2 uses this)
export async function canCommentOnProject(db, user, projectId) {
  if (isInternal(user)) return true;
  const row = await db.prepare(
    `SELECT 1 FROM project_members
      WHERE project_id = ? AND user_id = ?
        AND member_role IN ('owner','client_commenter')`
  ).bind(projectId, user.id).first();
  return !!row;
}
