// i18n project.* キーの日英対応チェック（開発用）
const fs = require("fs");
const s = fs.readFileSync("js/i18n.js", "utf8");
const ja = s.slice(s.indexOf("ja: {"), s.indexOf("en: {"));
const en = s.slice(s.indexOf("en: {"));
const keys = (b) => [...b.matchAll(/"(project\.[^"]+)":/g)].map((m) => m[1]);
const J = keys(ja), E = keys(en);
console.log("ja:", J.length, "en:", E.length);
console.log("missing in en:", J.filter((k) => !E.includes(k)));
console.log("missing in ja:", E.filter((k) => !J.includes(k)));
