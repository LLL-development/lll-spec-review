// zipstore.js の手動検証（開発用・本番コードではない）
// 1) createZip → fflate unzipSync で解凍できるか（CRC 検証を兼ねる）
// 2) その zip を worker/bundle.js の bundleZip にかけられるか
import { createRequire } from "node:module";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { bundleZip } from "../worker/bundle.js";

// zipstore.js is a classic browser script (no ESM exports) → load as CJS.
const ZipStore = createRequire(import.meta.url)("../js/zipstore.js");

const indexHtml = `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="css/style.css"></head>
<body><img src="img/a.png"><p>hello</p></body></html>`;
const css = `body { color: red }`;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 99, 200, 255, 0]);

const input = [
  { name: "mock/index.html", data: strToU8(indexHtml) },
  { name: "mock/css/style.css", data: strToU8(css) },
  { name: "mock/img/a.png", data: png },
];

const blob = await ZipStore.createZip(input);
console.log("blob size:", blob.size, "type:", blob.type);

// --- 1) fflate unzipSync ---
const zbuf = new Uint8Array(await blob.arrayBuffer());
const out = unzipSync(zbuf); // throws on bad CRC / structure
const names = Object.keys(out).sort();
console.log("entries:", JSON.stringify(names));
console.log("index match:", strFromU8(out["mock/index.html"]) === indexHtml);
console.log("css match:", strFromU8(out["mock/css/style.css"]) === css);
console.log("png match:", out["mock/img/a.png"].length === png.length &&
  out["mock/img/a.png"].every((v, i) => v === png[i]));

// --- 2) bundleZip on our own zip ---
const file = new File([zbuf], "mock.zip", { type: "application/zip" });
const { html, entryName } = await bundleZip(file);
console.log("bundleZip entryName:", entryName);
console.log("css inlined:", html.includes("<style>/* inlined from css/style.css */"));
console.log("img datauri:", /src="data:image\/png;base64,[A-Za-z0-9+/=]+"/.test(html));

// --- 3) error paths ---
try { await ZipStore.createZip([]); console.log("empty: NO ERROR (BAD)"); }
catch (e) { console.log("empty rejected:", e.message); }
try { await ZipStore.createZip([{ name: "../evil.txt", data: strToU8("x") }]); console.log("slip: NO ERROR (BAD)"); }
catch (e) { console.log("path traversal rejected:", e.message); }

// many entries sanity (chunked readEntries analogue / central dir count)
const many = Array.from({ length: 300 }, (_, i) => ({ name: `f/d${i % 7}/file${i}.txt`, data: strToU8(`n${i}`) }));
const manyOut = unzipSync(new Uint8Array(await (await ZipStore.createZip(many)).arrayBuffer()));
console.log("300 entries ok:", Object.keys(manyOut).length === 300 && strFromU8(manyOut["f/d3/file10.txt"]) === "n10");
