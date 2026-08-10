// ============================================
// Display branding — the ONLY place the product's
// user-facing name lives. Code, DB, Worker, and infra
// all use the logical name "lll-spec-review" and never
// reference this. Rebrand = edit this file, redeploy.
// ============================================
const BRAND = {
  mark: "朱",                                   // the hanko character
  nameJa: "朱入れ",
  nameEn: "Shuire",
  tagline: "Spec Review",
  taglineLong: "仕様書レビューツール / HTML Spec Review",
};

// Apply to any static placeholders present on the page
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-brand]").forEach(el => {
    const key = el.getAttribute("data-brand");
    if (BRAND[key] != null) el.textContent = BRAND[key];
  });
  if (document.title.includes("__BRAND__")) {
    document.title = document.title.replace("__BRAND__", BRAND.nameJa);
  }
});
