// temporary verification script (delete after use)
const fs = require("fs");
const s = fs.readFileSync("js/i18n.js", "utf8");
const jaBlock = s.slice(s.indexOf("ja: {"), s.indexOf("en: {"));
const enBlock = s.slice(s.indexOf("en: {"));
const keys = b => [...b.matchAll(/"((?:dashboard|account)\.[^"]+)":/g)].map(m => m[1]);
const J = keys(jaBlock), E = keys(enBlock);
console.log("ja count:", J.length, " en count:", E.length);
console.log("missing in ja:", E.filter(k => !J.includes(k)));
console.log("missing in en:", J.filter(k => !E.includes(k)));
const all = [...new Set([...J, ...E])].sort();
for (const k of all) console.log(k, "| ja:" + J.includes(k), "| en:" + E.includes(k));
