// ============================================
// 朱入れ (Shuire) — js/api.js
// Tiny fetch wrapper. Replaces supabase-js entirely.
// Same-origin API, so the session cookie rides along
// automatically — no tokens in JS, nothing to leak.
// ============================================

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...opts });
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON (e.g. content) */ }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const apiGet = (path) => api(path);

const apiPost = (path, body) => api(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

const apiDelete = (path) => api(path, { method: "DELETE" });

// multipart upload (browser sets the boundary header itself)
const apiUpload = (path, formData) => api(path, { method: "POST", body: formData });

// raw text (document content)
async function apiText(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

// binary content → data: URI (for embedding images in the sandbox)
async function apiDataUri(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
