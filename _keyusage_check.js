// temporary verification script (delete after use)
const fs = require("fs");
for (const f of ["dashboard.html", "account.html"]) {
  const html = fs.readFileSync(f, "utf8");
  const used = [...html.matchAll(/(?:data-i18n(?:-placeholder)?="|tOr\("|I18N\.t\(")((?:dashboard|account)\.[A-Za-z.]+?)"?(?=["`\s),;])/g)].map(m => m[1]);
  const dict = fs.readFileSync("js/i18n.js", "utf8");
  const uniq = [...new Set(used)];
  const missing = uniq.filter(k => !dict.includes('"' + k + '"'));
  console.log(f, "| keys used:", uniq.length, "| missing from dict:", JSON.stringify(missing));
}
// inline script syntax check
for (const f of ["dashboard.html", "account.html"]) {
  const html = fs.readFileSync(f, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  blocks.forEach((b, i) => {
    try { new Function(b); console.log(f, "inline script #" + i, "syntax OK"); }
    catch (e) { console.log(f, "inline script #" + i, "SYNTAX ERROR:", e.message); process.exitCode = 1; }
  });
}
