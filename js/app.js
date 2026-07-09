// ============================================
// 朱入れ (Shuire) — shared helpers
// ============================================

let currentProfile = null;

// Redirect to login if not signed in; returns the profile
async function requireAuth() {
  try {
    currentProfile = await apiGet("/api/auth/me");
    return currentProfile;
  } catch (e) {
    location.href = "index.html";
    return null;
  }
}

function isInternal() {
  return currentProfile && currentProfile.role === "internal";
}

async function signOut() {
  try { await apiPost("/api/auth/logout"); } catch (_) {}
  location.href = "index.html";
}

// Render the shared header into #app-header
function renderHeader() {
  const el = document.getElementById("app-header");
  if (!el) return;
  const name = currentProfile ? escapeHtml(currentProfile.display_name || currentProfile.email) : "";
  const roleLabel = isInternal() ? "社内 / Internal" : "クライアント / Client";
  el.innerHTML = `
    <a class="brand" href="dashboard.html">
      <span class="hanko">${escapeHtml(BRAND.mark)}</span>
      <span class="brand-text"><strong>${escapeHtml(BRAND.nameJa)}</strong><small>${escapeHtml(BRAND.nameEn)} — ${escapeHtml(BRAND.tagline)}</small></span>
    </a>
    <div class="header-user">
      <span class="user-chip"><span class="user-name">${name}</span><span class="user-role">${roleLabel}</span></span>
      <a class="btn btn-ghost btn-sm" href="account.html">アカウント</a>
      <button class="btn btn-ghost btn-sm" onclick="signOut()">ログアウト / Sign out</button>
    </div>`;
}

// ---------- utilities ----------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

let toastTimer = null;
function toast(msg, isError = false) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ""; }, 3200);
}
