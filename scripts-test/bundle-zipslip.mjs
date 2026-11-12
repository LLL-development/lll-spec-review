// zip slip / 偽装ヘッダ / 出力上限の検証（開発用）
import { zipSync, strToU8 } from "fflate";
import { bundleZip, BundleError } from "../worker/bundle.js";

// 1. エントリ名に ../ を含む zip slip 試み → 格納されず参照も解決しない
const z1 = zipSync({
  "index.html": strToU8(`<img src="../evil.png"><img src="ok.png">`),
  "../evil.png": new Uint8Array([9,9,9]),
  "ok.png": new Uint8Array([1,2,3]),
});
const r1 = await bundleZip(new File([z1], "slip.zip"));
console.log("slip entry not inlined:", r1.html.includes('../evil.png"'), "| ok inlined:", r1.html.includes("data:image/png;base64,"));

// 2. 件数上限（filter で展開前に拒否）: 5001ファイル → 拒否、300ファイル → 通過
const many = {};
for (let i = 0; i < 5001; i++) many[`f${i}.txt`] = strToU8("x");
many["index.html"] = strToU8("<b>x</b>");
try {
  await bundleZip(new File([zipSync(many)], "many.zip"));
  console.log("count(5001): NO ERROR (BAD)");
} catch (e) { console.log("count(5001) rejected:", e instanceof BundleError, e.message); }

const few = {};
for (let i = 0; i < 300; i++) few[`f${i}.txt`] = strToU8("x");
few["index.html"] = strToU8("<b>x</b>");
try {
  await bundleZip(new File([zipSync(few)], "few.zip"));
  console.log("count(300): passed (OK)");
} catch (e) { console.log("count(300): rejected (BAD)", e.message); }

// 3. 変換後HTML上限（10MB超）→ BundleError（単一8MB以下×複数で合計が超えるケース）
const mkPng = () => { const a = new Uint8Array(7 * 1024 * 1024); for (let i=0;i<a.length;i+=997) a[i]=i&255; return a; };
const z3 = zipSync({
  "index.html": strToU8(`<img src="a.png"><img src="b.png">`),
  "a.png": mkPng(), "b.png": mkPng(),
});
try {
  await bundleZip(new File([z3], "out.zip"));
  console.log("output cap: NO ERROR (BAD)");
} catch (e) { console.log("output cap rejected:", e instanceof BundleError, e.message); }
