// upload.err.* 辞書検証（開発用）: 11 code すべて ja/en で訳文が返るか
// （フォールバックで key 名そのものが返ったら欠落＝失敗）
const fs = require("fs");
const path = require("path");

let src = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
src += "\nmodule.exports = { I18N };\n";
const store = { lang: "ja" };
const sandbox = {
  window: {},
  localStorage: { getItem: (k) => (k === "lang" ? store.lang : null), setItem: (k, v) => { if (k === "lang") store.lang = v; } },
  navigator: { language: "ja" },
  document: { addEventListener: () => {}, documentElement: {} },
};
const mod = { exports: {} };
new Function("window", "localStorage", "navigator", "document", "module", src)(
  sandbox.window, sandbox.localStorage, sandbox.navigator, sandbox.document, mod
);
const I18N = mod.exports.I18N;

const codes = [
  "tooManyFiles", "singleFileTooLarge", "totalTooLarge", "zipUnreadable",
  "noHtml", "ambiguousHtml", "outputTooLarge", "noFile", "unsupportedType",
  "tooLarge", "zipNoSaveName",
];
const params = { max: 5000, maxMB: 8 };

let fail = 0;
for (const lang of ["ja", "en"]) {
  store.lang = lang;
  for (const code of codes) {
    const key = "upload.err." + code;
    const out = I18N.t(key, params);
    const ok = out !== key && typeof out === "string" && out.length > 0;
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"} [${lang}] ${key} -> ${out}`);
  }
}
console.log(fail === 0 ? "\nALL PASS (22/22)" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
