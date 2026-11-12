// アップロード系エラー code 検証（開発用）: BundleError に code/params が付くか
import { zipSync, strToU8 } from "fflate";
import { bundleZip, BundleError } from "../worker/bundle.js";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS ${name}`, extra ?? ""); }
  else { fail++; console.log(`FAIL ${name}`, extra ?? ""); }
}

// 1. 件数超過（5001ファイル）→ code tooManyFiles, params.max === 5000
const many = {};
for (let i = 0; i < 5001; i++) many[`f${i}.txt`] = strToU8("x");
many["index.html"] = strToU8("<b>x</b>");
try {
  await bundleZip(new File([zipSync(many)], "many.zip"));
  check("tooManyFiles", false, "NO ERROR (BAD)");
} catch (e) {
  check("tooManyFiles", e instanceof BundleError && e.code === "tooManyFiles" && e.params?.max === 5000,
    JSON.stringify({ code: e.code, params: e.params, message: e.message }));
}

// 2. 単一ファイル超過（9MB）→ singleFileTooLarge, maxMB 8
const big = new Uint8Array(9 * 1024 * 1024);
try {
  await bundleZip(new File([zipSync({ "index.html": strToU8("<b>x</b>"), "big.bin": big })], "big.zip"));
  check("singleFileTooLarge", false, "NO ERROR (BAD)");
} catch (e) {
  check("singleFileTooLarge", e.code === "singleFileTooLarge" && e.params?.maxMB === 8,
    JSON.stringify({ code: e.code, params: e.params }));
}

// 3. 破損 zip → zipUnreadable
try {
  await bundleZip(new File([new Uint8Array([1, 2, 3, 4, 5])], "broken.zip"));
  check("zipUnreadable", false, "NO ERROR (BAD)");
} catch (e) {
  check("zipUnreadable", e.code === "zipUnreadable", JSON.stringify({ code: e.code }));
}

// 4. HTML 無し → noHtml
try {
  await bundleZip(new File([zipSync({ "a.txt": strToU8("x") })], "nohtml.zip"));
  check("noHtml", false, "NO ERROR (BAD)");
} catch (e) {
  check("noHtml", e.code === "noHtml", JSON.stringify({ code: e.code }));
}

// 5. 複数 HTML・index なし → ambiguousHtml
try {
  await bundleZip(new File([zipSync({ "a.html": strToU8("<b>1</b>"), "b.html": strToU8("<b>2</b>") })], "amb.zip"));
  check("ambiguousHtml", false, "NO ERROR (BAD)");
} catch (e) {
  check("ambiguousHtml", e.code === "ambiguousHtml", JSON.stringify({ code: e.code }));
}

// 6. 変換後 HTML 上限超過 → outputTooLarge, maxMB 10
const mkPng = () => { const a = new Uint8Array(7 * 1024 * 1024); for (let i = 0; i < a.length; i += 997) a[i] = i & 255; return a; };
try {
  await bundleZip(new File([zipSync({
    "index.html": strToU8(`<img src="a.png"><img src="b.png">`),
    "a.png": mkPng(), "b.png": mkPng(),
  })], "out.zip"));
  check("outputTooLarge", false, "NO ERROR (BAD)");
} catch (e) {
  check("outputTooLarge", e.code === "outputTooLarge" && e.params?.maxMB === 10,
    JSON.stringify({ code: e.code, params: e.params }));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
