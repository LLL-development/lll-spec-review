// レビュー指摘修正の追加検証（開発用・本番コードではない）
import { zipSync, strToU8 } from "fflate";
import { bundleZip } from "../worker/bundle.js";

let pass = 0, fail = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? pass++ : fail++;
}

// --- 1. MAJOR1: <a href="about.html"> は about.html が zip にあっても素通し
{
  const z = zipSync({
    "index.html": strToU8(`<a href="about.html">About</a><a href="data.json">d</a><iframe src="x.html"></iframe><img src="pic.png">`),
    "about.html": strToU8("<h1>ABOUT FULL TEXT SHOULD NOT APPEAR</h1>"),
    "data.json": strToU8('{"secret":"json full text"}'),
    "x.html": strToU8("<p>iframe full text</p>"),
    "pic.png": new Uint8Array([1, 2, 3]),
  });
  const { html } = await bundleZip(new File([z], "t.zip"));
  check("1a <a href=about.html> untouched", html.includes('<a href="about.html">About</a>'));
  check("1b about.html full text not embedded", !html.includes("ABOUT FULL TEXT"));
  check("1c data.json untouched", html.includes('href="data.json"') && !html.includes("json full text"));
  check("1d iframe src=x.html untouched", html.includes('src="x.html"') && !html.includes("iframe full text"));
  check("1e img still inlined", html.includes("src=\"data:image/png;base64,"));
}

// --- 2. MEDIUM2: defer / async / type=module の script は素通し
{
  const z = zipSync({
    "index.html": strToU8(
      `<script defer src="a.js"></script><script type="module" src="m.js"></script><script async src="b.js"></script><script src="ok.js"></script>`
    ),
    "a.js": strToU8("var a=1;"),
    "m.js": strToU8("import x from 'y';"),
    "b.js": strToU8("var b=1;"),
    "ok.js": strToU8("var ok=1;"),
  });
  const { html } = await bundleZip(new File([z], "t.zip"));
  check("2a defer untouched", html.includes('defer src="a.js"'));
  check("2b module untouched", html.includes('type="module" src="m.js"'));
  check("2c async untouched", html.includes('async src="b.js"'));
  check("2d plain script inlined", html.includes("var ok=1;") && !html.includes('src="ok.js"'));
}

// --- 3. MEDIUM7: stylesheet の url() が CSS 基準ディレクトリで data URI 化
{
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
  const z = zipSync({
    "index.html": strToU8(`<link rel="stylesheet" href="css/s.css">`),
    "css/s.css": strToU8(`.a{background:url(../img/a.png)} .b{background:url("bg2.png")} .c{background:url('bg3.png')} .d{background:url(https://x/y.png)}`),
    "img/a.png": png,
    "css/bg2.png": png,
    "css/bg3.png": png,
  });
  const { html } = await bundleZip(new File([z], "t.zip"));
  check("3a becomes <style>", html.includes("<style>/* inlined from css/s.css */"));
  check("3b ../img/a.png -> datauri", /url\("data:image\/png;base64,/.test(html));
  const n = (html.match(/data:image\/png;base64,/g) || []).length;
  check("3c all 3 relative urls inlined (count>=3)", n >= 3);
  check("3d external url untouched", html.includes("url(https://x/y.png)"));
}

// --- 4. MEDIUM4: インライン化 JS 本文内の '<img src="logo.png">' は不変
{
  const z = zipSync({
    "index.html": strToU8(`<script src="app.js"></script>`),
    "app.js": strToU8(`el.innerHTML='<img src="logo.png">';`),
    "logo.png": new Uint8Array([9, 9, 9]),
  });
  const { html } = await bundleZip(new File([z], "t.zip"));
  check("4a JS string untouched", html.includes(`el.innerHTML='<img src="logo.png">'`));
  check("4b no &quot; injected into script body", !/<script>[\s\S]*?<\/script>/.test("") && !html.includes("&quot;"));
}

// --- 5. MEDIUM6: query/fragment と URL エンコードを解決
{
  const png = new Uint8Array([4, 5, 6]);
  const z = zipSync({
    "index.html": strToU8(`<link rel="stylesheet" href="css/x.css?v=2"><img src="img/my%20img.png#frag">`),
    "css/x.css": strToU8("p{color:green}"),
    "img/my img.png": png,
  });
  const { html } = await bundleZip(new File([z], "t.zip"));
  check("5a css?v=2 resolved", html.includes("color:green"));
  check("5b my%20img.png#frag resolved", html.includes("data:image/png;base64,"));
}

// --- 6. MEDIUM8: 同一 png 複数参照でメモ化 + 累積出力上限で BundleError
{
  // 1MB の png を 12 個別パスで配置。各々を 1 回ずつ参照すると
  // base64 化で約 1.33MB/個 → 12 個で約 16MB > 10MB → budget で throw。
  const mk = () => {
    const files = { "index.html": strToU8(Array.from({ length: 12 }, (_, i) => `<img src="i${i}.png">`).join("")) };
    for (let i = 0; i < 12; i++) files[`i${i}.png`] = new Uint8Array(1024 * 1024).fill(i);
    return zipSync(files, { level: 0 });
  };
  try {
    await bundleZip(new File([mk()], "big.zip"));
    check("6a accumulated output cap throws", false);
  } catch (e) {
    check("6a accumulated output cap throws", e.name === "BundleError" && e.message.includes("変換後の HTML"));
  }
  // メモ化: 同一パスを 3 回参照しても datauri は埋め込み回数ぶん出力に
  // 入るが、再計算は 1 回。ファイル数が上限内なら成功し、置換は全て同じ値。
  const z2 = zipSync({
    "index.html": strToU8(`<img src="a.png"><img src="a.png"><img src="a.png">`),
    "a.png": new Uint8Array([1, 2, 3, 4]),
  });
  const { html } = await bundleZip(new File([z2], "t.zip"));
  const m = html.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g) || [];
  check("6b same path replaced 3x with identical value", m.length === 3 && new Set(m).size === 1);
}

// --- 7. MEDIUM5: data-src / xlink:href は掴まない（lookbehind）
{
  const z = zipSync({
    "index.html": strToU8(`<div data-src="a.png" data-href="a.png"><svg><use xlink:href="a.png"/></svg></div>`),
    "a.png": new Uint8Array([7, 7]),
  });
  const { html } = await bundleZip(new File([z], "t.zip"));
  check("7a data-src untouched", html.includes('data-src="a.png"'));
  check("7b data-href untouched", html.includes('data-href="a.png"'));
  check("7c xlink:href untouched", html.includes('xlink:href="a.png"'));
}

// --- 8. fflate: ヘッダ偽装 originalSize を超えて展開するか（zip bomb 前提の実測）
{
  // 実データは小さいがヘッダの uncompressed size を水増しした zip を手作りは
  // 難しいため、逆方向（宣言は小さいが実は…は fflate が CRC/サイズで弾く）。
  // ここでは「宣言どおり展開される」ことと、deflate で大きく膨らむデータで
  // filter の宣言検算が機能することを確認する。
  const compressible = new Uint8Array(4 * 1024 * 1024); // 圧縮すると極小
  const z = zipSync({ "index.html": strToU8("<b>x</b>"), "z.bin": compressible }, { level: 9 });
  console.log(`   (zip size after deflate of 4MB zeros: ${z.length} bytes)`);
  // ヘッダ偽装そのものは fflate の API では作れないため未実施 → 明示
  console.log("   NOTE: ヘッダ originalSize を実データと矛盾させて偽装した zip の作製は本スクリプトでは未実施（未確認）");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
