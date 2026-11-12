// 異常系・エッジケースの追加検証（開発用）
import { zipSync, strToU8 } from "fflate";
import { bundleZip } from "../worker/bundle.js";

// 1. 属性値に $& $' を含む CSS（置換展開バグの確認は本体で済むとして、
//    クオート内スペース入りパスが壊れないか）
const z1 = zipSync({
  "index.html": strToU8(`<img src="img/a b.png"><link rel="stylesheet" href="css/s c.css">`),
  "img/a b.png": new Uint8Array([1,2,3]),
  "css/s c.css": strToU8("a{color:blue}"),
});
const r1 = await bundleZip(new File([z1], "t.zip"));
console.log("space path:", r1.html.includes("data:image/png;base64,"), r1.html.includes("color:blue"));

// 2. 壊れた zip バイト
try {
  await bundleZip(new File([new Uint8Array([1,2,3,4,5])], "bad.zip"));
  console.log("broken zip: NO ERROR (BAD)");
} catch (e) { console.log("broken zip rejected:", e.message, "status:", e.status); }

// 3. 単一ファイル上限超過（8MB超）
const big = new Uint8Array(9 * 1024 * 1024);
const z3 = zipSync({ "index.html": strToU8("<b>x</b>"), "big.bin": big }, { level: 0 });
try {
  await bundleZip(new File([z3], "big.zip"));
  console.log("oversize file: NO ERROR (BAD)");
} catch (e) { console.log("oversize rejected:", e.message, "status:", e.status); }

// 4. 相対パス ../ の正常解決（親ディレクトリ参照）
const z4 = zipSync({
  "sub/index.html": strToU8(`<link rel="stylesheet" href="../css/s.css">`),
  "css/s.css": strToU8("p{margin:0}"),
});
const r4 = await bundleZip(new File([z4], "rel.zip"));
console.log("parent resolve:", r4.html.includes("margin:0"), "entryName:", r4.entryName);

// 5. 深い階層の index.html より浅いものを優先
const z5 = zipSync({
  "a/index.html": strToU8("<b>shallow</b>"),
  "a/b/index.html": strToU8("<b>deep</b>"),
});
console.log("shallow index:", (await bundleZip(new File([z5], "d.zip"))).html.includes("shallow"));

// 6. script タグに属性が付いているケース（defer 等）は素通しになるか
const z6 = zipSync({
  "index.html": strToU8(`<script defer src="js/a.js"></script>`),
  "js/a.js": strToU8("var a=1;"),
});
const r6 = await bundleZip(new File([z6], "attr.zip"));
console.log("defer script passthrough:", r6.html.includes('defer src="js/a.js"'));
