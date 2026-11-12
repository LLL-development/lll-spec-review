// bundleZip の手動検証スクリプト（開発用・本番コードではない）
import { zipSync, strToU8 } from "fflate";
import { bundleZip } from "../worker/bundle.js";

const indexHtml = `<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="https://cdn.example.com/ext.css">
<script src='js/app.js'></script>
<script src="js/withimg.js"></script>
<script src="https://cdn.example.com/lib.js"></script>
</head>
<body>
<img src="img/logo.png">
<img src="data:image/png;base64,AAA">
<a href="page2.html">p2</a>
<a href="#top">top</a>
<img src="../outside/nope.png">
<img src="img/missing.png">
</body>
</html>`;

const css = `body { color: red } /* $& literal test */ .x{background:url(../img/logo.png)}`;
const js = `console.log("$& and $' must survive");\nvar s = "</script> inside";`;
// 回帰: インライン化した JS 本文内の <img src="..."> 文字列は書き換えない
const jsWithImg = `var el=document.getElementById("x"); el.innerHTML='<img src="logo.png">';`;
const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

const zipped = zipSync({
  "mock/index.html": strToU8(indexHtml),
  "mock/css/style.css": strToU8(css),
  "mock/js/app.js": strToU8(js),
  "mock/js/withimg.js": strToU8(jsWithImg),
  "mock/img/logo.png": png,
  "__MACOSX/mock/._index.html": strToU8("junk"),
  "mock/.DS_Store": strToU8("junk"),
});

const file = new File([zipped], "mock.zip", { type: "application/zip" });
const { html, entryName } = await bundleZip(file);

console.log("entryName:", entryName);
console.log("---");
console.log(html);
console.log("---checks---");
console.log("css inlined:", html.includes("<style>/* inlined from css/style.css */"));
console.log("js inlined:", html.includes("<script>") && html.includes("$& and $' must survive"));
console.log("js escaped close:", html.includes('<\\/script> inside'));
console.log("img datauri:", /src="data:image\/png;base64,[A-Za-z0-9+/=]+"/.test(html));
console.log("cdn untouched:", html.includes('href="https://cdn.example.com/ext.css"') && html.includes('src="https://cdn.example.com/lib.js"'));
console.log("data: untouched:", html.includes('src="data:image/png;base64,AAA"'));
console.log("anchor untouched:", html.includes('href="#top"'));
console.log("outside untouched:", html.includes('../outside/nope.png"'));
console.log("missing untouched:", html.includes('img/missing.png"'));
console.log("no src attr on inlined script:", !/<script[^>]+src=[^>]*>\s*<\/script/.test(html.replace(/<script>\n[\s\S]*?\n<\/script>/g, "")));
// MEDIUM4 回帰: JS 本文内の '<img src="logo.png">' は元のまま（&quot; 混入なし）
console.log("js body img untouched:", html.includes(`el.innerHTML='<img src="logo.png">'`));

// 主HTML選択: index.html なし・単一 html
const z2 = zipSync({ "a/only.html": strToU8("<b>hi</b>") });
console.log("single html pick:", (await bundleZip(new File([z2], "x.zip"))).entryName);

// 複数 HTML かつ index なし → エラー
try {
  await bundleZip(new File([zipSync({ "a.html": strToU8("1"), "b.html": strToU8("2") })], "y.zip"));
  console.log("multi: NO ERROR (BAD)");
} catch (e) { console.log("multi rejected:", e.message); }

// HTML なし → エラー
try {
  await bundleZip(new File([zipSync({ "a.txt": strToU8("1") })], "z.zip"));
  console.log("nohtml: NO ERROR (BAD)");
} catch (e) { console.log("nohtml rejected:", e.message); }
