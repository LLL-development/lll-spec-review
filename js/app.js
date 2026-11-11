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
let _headerLangBound = false; // register I18N.onChange only once across re-renders
function renderHeader() {
  const el = document.getElementById("app-header");
  if (!el) return;
  const name = currentProfile ? escapeHtml(currentProfile.display_name || currentProfile.email) : "";
  // Only staff accounts get a role tag — regular users just see their name
  const roleTag = isInternal() ? `<span class="user-role">LLL Staff</span>` : "";
  // Language toggle (JA/EN). Brand/title stay Japanese; only UI text switches.
  const langToggle = `
      <span class="lang-toggle">
        <button type="button" data-lang="ja" onclick="I18N.setLang('ja')">JA</button><button type="button" data-lang="en" onclick="I18N.setLang('en')">EN</button>
      </span>`;
  el.innerHTML = `
    <a class="brand" href="dashboard.html">
      <span class="hanko">${escapeHtml(BRAND.mark)}</span>
      <span class="brand-text"><strong>${escapeHtml(BRAND.nameJa)}</strong><small>${escapeHtml(BRAND.nameEn)} — ${escapeHtml(BRAND.tagline)}</small></span>
    </a>
    <div class="header-user">${langToggle}
      <span class="user-chip"><span class="user-name">${name}</span>${roleTag}</span>
      <a class="btn btn-ghost btn-sm" href="account.html" data-i18n="header.account">アカウント</a>
      <button class="btn btn-ghost btn-sm" onclick="signOut()" data-i18n="header.signout">ログアウト</button>
    </div>`;
  // Guard: header must not break if i18n.js failed to load (404 etc.).
  if (window.I18N && typeof window.I18N.getLang === "function") {
    // Translate the header's [data-i18n] buttons now (renderHeader runs after
    // i18n's initial apply(), so re-apply scoped to this header only).
    if (typeof window.I18N.apply === "function") window.I18N.apply(el);
    const updateLangButtons = () => {
      const cur = window.I18N.getLang();
      document.querySelectorAll("#app-header .lang-toggle button").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-lang") === cur);
      });
    };
    updateLangButtons();
    if (!_headerLangBound && typeof window.I18N.onChange === "function") {
      window.I18N.onChange(updateLangButtons); // callback re-looks-up DOM each time: safe across re-renders
      _headerLangBound = true;
    }
  }
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

// Styled confirmation dialog replacing native confirm().
// Usage: if (!(await appConfirm({ title, message, okLabel, danger }))) return;
function appConfirm({ title = "確認 / Confirm", message = "", okLabel = "OK", cancelLabel = "キャンセル", danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
      <div class="modal ${danger ? "modal-danger" : ""}" role="dialog" aria-modal="true">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-message">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? "btn-shu" : ""}" data-act="ok">${escapeHtml(okLabel)}</button>
        </div>
      </div>`;
    const done = (v) => {
      document.removeEventListener("keydown", onKey);
      wrap.classList.add("closing");
      setTimeout(() => wrap.remove(), 120);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) return done(false);
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act) done(act === "ok");
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-act="ok"]').focus();
  });
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
