// ============================================================
// 朱入れ (Shuire) — worker/bundle.js
//
// zip アップロード用の変換コア。モック一式（index.html + css/ +
// js/ + img/ …）を zip で受け取り、HTML 内の相対参照を実データに
// 置換した「単一の自己完結 HTML」を組み立てる。
//
// - 生成物は従来通り text/plain; charset=utf-8 で R2 に保存する。
//   viewer 側（Blob URL + sandbox + overlay.js 注入）は無変更で
//   そのまま描画できる。
// - 外部参照（http/https/protocol-relative/data/mailto/tel/#anchor）
//   は変換せず素通しする — ブラウザが読む。zip 内相対パスだけを
//   インライン化対象にする。
// - unzipSync は同期なので巨大 zip は CPU を食う。解凍後合計
//   バイト数 / ファイル数 / 単一ファイルサイズで上限を守る（DoS 対策）。
// ============================================================

import { unzipSync, strFromU8 } from "fflate";

// --- 上限値（仮定値・後で調整可能） --------------------------------
// 合計25MB: 元 zip は 10MB 上限だが解凍後は膨らむ（zip bomb 対策も兼ねる）。
//   ヘッダ宣言サイズ（filter）と実展開サイズの両方で検算する —
//   originalSize はヘッダ由来で攻撃者が偽装できるため、宣言だけ当ては不可。
// ファイル数5000: e-book 等の章別 HTML/画像/フォントで数千ファイルになり得るため引き上げ。
//   同期 unzipSync の CPU 時間は「エントリ数 × 1エントリの展開量」で決まり、
//   合計25MB（MAX_TOTAL_BYTES）が頭打ちなので、ファイル数だけ上げても最悪ケースは抑えられる。
//   ファイル数だけを緩めても、合計/単一/出力のサイズ上限が実質的な DoS 防御として残る。
// 単一8MB: 画像/動画が混ざっても通す緩めの上限。
// 変換後HTML10MB: 単発 .html アップロードと同じ上限に揃える
//   （base64 化で約1.33倍になる分を見込み、実質の元データ上限はこれより低くなる）。
const MAX_TOTAL_BYTES   = 25 * 1024 * 1024;
const MAX_FILE_COUNT    = 5000;
const MAX_SINGLE_BYTES  = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES  = 10 * 1024 * 1024;

// ユーザー向けにメッセージを返してよいエラー（それ以外は 500 扱い）
export class BundleError extends Error {
  constructor(message, code, params) {
    super(message);
    this.name = "BundleError";
    this.status = 400;
    if (code) this.code = code;
    if (params) this.params = params;
  }
}

function overOutputError() {
  return new BundleError(
    `変換後の HTML が大きすぎます（${MAX_OUTPUT_BYTES / (1024 * 1024)}MB 以下に収まるサイズにしてください）`,
    "outputTooLarge",
    { maxMB: MAX_OUTPUT_BYTES / (1024 * 1024) }
  );
}

// data URI の MIME 判定用（要件に挙げられた拡張子）
const DATA_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
};

// テキストとしてインライン化する拡張子。
// script（js/mjs）と stylesheet（css）の経路だけで使う — 汎用 href/src
// 属性の置換対象にはしない（html/md/csv/txt/json を汎用パスで掴むと
// <a href> がファイル全文に置換されて壊れるため、汎用側は datauri のみ）。
const TEXT_EXT = new Set(["css", "js", "mjs"]);

// 外部参照と判定して素通しするプレフィックス
function isExternalUrl(url) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return true; // http:, https:, data:, mailto:, tel: …
  if (url.startsWith("//")) return true;             // protocol-relative
  if (url.startsWith("#")) return true;              // in-page anchor
  return false;
}

// path.normalize 相当（自作・zip 内は / 区切りを前提とする）
// ".." でルート外に出るパスは null を返す（＝変換しない）。
function normalizePath(relFromDir) {
  const out = [];
  for (const seg of relFromDir.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null; // zip ルート外へ出る不正パス
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

// zip エントリ名を正規化（Windows 区切り \ → /、先頭 / 除去）。
// 戻り値が null のものは除外対象。".." を含むエントリ名は格納しない
// （zip slip 対策 — 解決時の normalizePath と二重に守らせる）。
function normalizeEntryName(name) {
  const p = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.endsWith("/")) return null;            // ディレクトリエントリ
  if (p === "__MACOSX/" || p.startsWith("__MACOSX/")) return null;
  if (p.split("/").pop() === ".DS_Store") return null;
  if (/(^|\/)\._[^/]*$/.test(p)) return null;        // macOS の AppleDouble（._xxx）
  if (p.split("/").includes("..")) return null;      // zip slip: ".." を含む格納は禁止
  return p;
}

// 主 HTML の選択: index.html があれば最優先。無ければ単一の .html。
// 0個 / 複数かつ index.html なし → throw（呼び出し側で 400 に変換）。
function pickEntryHtml(paths) {
  const htmls = paths.filter((p) => /\.html?$/i.test(p));
  if (htmls.length === 0) throw new BundleError("zip 内に HTML ファイルがありません", "noHtml");
  // 基準ディレクトリに置く index.html を探す（深い階層の index.html より浅いものを優先）
  const indexes = htmls
    .filter((p) => /(^|\/)index\.html?$/i.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length);
  if (indexes.length > 0) return indexes[0];
  if (htmls.length === 1) return htmls[0];
  throw new BundleError("zip 内の HTML が複数あり、主 HTML を特定できません（index.html を含めてください）", "ambiguousHtml");
}

function extOf(path) {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? m[1].toLowerCase() : "";
}

function toBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// zip 内パス → 置換後の文字列（属性値の中身）を解決。
// 解決できない（外部 URL / zip 外 / 未収録）場合は null を返す＝素通し。
// budget: 埋め込み時の累積出力長を数える共有オブジェクト（上限超過で throw）。
function resolveAsset(target, baseDir, files, budget) {
  if (isExternalUrl(target)) return null;

  // query/fragment を落とし、%xx デコードしてから zip 内パスに当てる
  // （css/x.css?v=2 / img/a.png#x / my%20img.png 対策）。デコード失敗は
  // 素のパスのまま試みる。
  let clean = target.split(/[?#]/)[0];
  try {
    clean = decodeURIComponent(clean);
  } catch (_) {
    /* malformed percent-encoding: keep raw */
  }

  const rel = normalizePath(baseDir ? `${baseDir}/${clean}` : clean);
  if (rel === null) return null;
  const bytes = files.get(rel);
  if (!bytes) return null;

  const ext = extOf(rel);
  if (ext === "css") {
    // <link> タグごと <style> に置換する側で使うので、CSS 本体を返す。
    // CSS 自身のディレクトリ基準で url(...) を data URI 化しておく。
    const cssDir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    return { kind: "css", text: inlineCssUrls(strFromU8(bytes), cssDir, files, budget) };
  }
  if (ext === "js" || ext === "mjs") {
    // </script> を含む JS で閉じタグが崩れないようエスケープ
    const js = strFromU8(bytes).replace(/<\/script/gi, "<\\/script");
    budget.add(js.length);
    return { kind: "js", text: js };
  }
  if (DATA_MIME[ext]) {
    // 同一パスの再計算・再埋め込みを防ぐ（メモ化 + 累積長カウント）
    const cached = files.get(`\0datauri:${rel}`);
    if (cached !== undefined) return { kind: "datauri", text: cached };
    const text = `data:${DATA_MIME[ext]};base64,${toBase64(bytes)}`;
    budget.add(text.length);
    files.set(`\0datauri:${rel}`, text);
    return { kind: "datauri", text };
  }
  if (TEXT_EXT.has(ext)) {
    // css/js/mjs は上で処理済み。ここは現状到達しないが、汎用 href/src
    // 経路では datauri 以外必ず素通しするので text が漏れることはない。
    return { kind: "text", text: strFromU8(bytes) };
  }
  // 未知のバイナリは data URI にできないので素通し（変換しない）
  return null;
}

// インライン化する CSS 内の url(...) を、その CSS が置かれていた
// ディレクトリ基準で data URI に置換する。外部 URL・data: は素通し。
// 画像/フォント系（datauri に解決できるもの）のみ置換し、それ以外は
// そのまま残す。@import は範囲外（未解決のまま素通し）。
function inlineCssUrls(css, cssDir, files, budget) {
  const re = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  return css.replace(re, (match, _quote, inner) => {
    const t = inner.trim();
    if (/^(?:https?:|data:|\/\/|#)/i.test(t)) return match;
    let clean = t.split(/[?#]/)[0];
    try {
      clean = decodeURIComponent(clean);
    } catch (_) {
      /* keep raw */
    }
    const rel = normalizePath(cssDir ? `${cssDir}/${clean}` : clean);
    if (rel === null) return match;
    const bytes = files.get(rel);
    if (!bytes) return match;
    const mime = DATA_MIME[extOf(rel)];
    if (!mime) return match; // 画像/フォント以外は触らない
    const cached = files.get(`\0datauri:${rel}`);
    const dataUri = cached !== undefined ? cached : `data:${mime};base64,${toBase64(bytes)}`;
    if (cached === undefined) {
      budget.add(dataUri.length - match.length);
      files.set(`\0datauri:${rel}`, dataUri);
    }
    return `url("${dataUri}")`;
  });
}

// <script ... src="x.js" ...> ... </script> をインライン化（src 属性は削除）。
// defer / async / type="module" は実行セマンティクス（遅延・実行順・
// module の import）を保証できないため変換せず素通しする。
// 解決結果は kind==="js" のみ受け入れる（.txt/.json を実行コード化しない）。
function replaceScriptTags(html, baseDir, files, budget) {
  const re = /<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"'>]*)\2[^>]*>\s*<\/script\s*>/gi;
  return html.replace(re, (match, attrsBefore, _quote, url) => {
    if (/\b(?:defer|async)\b/i.test(attrsBefore)) return match;
    if (/\btype\s*=\s*(["']?)\s*module\b/i.test(attrsBefore)) return match;
    const resolved = resolveAsset(url.trim(), baseDir, files, budget);
    if (!resolved || resolved.kind !== "js") return match;
    // 外部 URL や未収録は素通し。JS 本体は </script エスケープ済み。
    return `\n<script>\n${resolved.text}\n</script>`;
  });
}

// <link rel="stylesheet" href="x.css"> を <style> に置換する。
// rel 属性の位置・クオート順がどうであれ、href が css に解決できたら置換。
// CSS 内の url(...) は resolveAsset 内で data URI 化済み。
function replaceLinkStylesheets(html, baseDir, files, budget) {
  const re = /<link\b[^>]*>/gi;
  return html.replace(re, (tag) => {
    if (!/\brel\s*=\s*(["'])\s*stylesheet\s*\1/i.test(tag)) return tag;
    const hrefMatch = /\bhref\s*=\s*(["'])([^"'>]*)\1/i.exec(tag);
    if (!hrefMatch) return tag;
    const resolved = resolveAsset(hrefMatch[2].trim(), baseDir, files, budget);
    if (!resolved || resolved.kind !== "css") return tag;
    budget.add(resolved.text.length);
    return `<style>/* inlined from ${escapeHtmlCommentSafe(hrefMatch[2])} */\n${ensureCssSafe(resolved.text)}\n</style>`;
  });
}

// CSS 内の </style> で早期クローズされないようにする
function ensureCssSafe(css) {
  return css.replace(/<\/style/gi, "<\\/style");
}

// href / src 属性の一般置換。data URI にできるもの（画像・フォント等の
// DATA_MIME 系）だけを置換対象にする — html/md/csv/txt/json/js/css など
// を汎用パスで掴むと <a href> がファイル全文に置換されて壊れるため、
// datauri 以外は必ず素通し（安全側）。
// script の src と stylesheet link の href はタグ単位の置換に任せる。
// 注意: String.replace の置換文字列展開バグ（$& や $' の誤展開）を避けるため、
// 必ず replacer 関数で返り値を組み立てる。
// lookbehind で data-src / xlink:href 等を除外する。
// NOTE: Workers の V8 は lookbehind 対応のはずだが、デプロイ時に dry-run
//       ではなく実デプロイでの動作確認を推奨（非対応なら SyntaxError で
//       モジュール読み込み自体が落ちるため気付きやすい）。
const ATTR_RE = /(?<![\w:-])(href|src)\s*=\s*(["'])([^"'>]*)\2/gi;

function replaceGenericAttrs(html, baseDir, files, budget) {
  return html.replace(ATTR_RE, (match, attrName, quote, url, offset) => {
    const t = url.trim();
    const resolved = resolveAsset(t, baseDir, files, budget);
    if (!resolved) return match; // 外部 URL / zip 外 / 未収録 → 素通し
    if (resolved.kind !== "datauri") return match; // text/css/js は触らない

    // <script src> と <link rel=stylesheet> はタグ単位置換に譲る
    // （replacer の offset はマッチ開始位置。match.index は使えない）
    const open = html.lastIndexOf("<", offset);
    const tagHead = open >= 0 ? html.slice(open + 1, offset) : "";
    if (/^\s*script\b/i.test(tagHead)) return match;
    if (/^\s*link\b/i.test(tagHead) && /\brel\s*=\s*(["'])\s*stylesheet/i.test(tagHead)) return match;

    // 属性値を実データに置換（& " ' をエスケープして属性内に埋め込む）
    const attr = `${attrName.toLowerCase()}=${quote}`;
    const head = match.slice(0, match.indexOf(attrName)); // 前置の空白・インデント等
    return `${head}${attr}${escapeAttr(resolved.text)}${quote}`;
  });
}

// 置換の走査順: 属性一般 → script タグ → stylesheet link。
// 汎用属性パスは data URI（画像/フォント）だけを対象にするため、
// .js/.css の src/href には触れない＝後続のタグ単位置換と競合しない。
// 逆に汎用を後に走らせると、インライン化済みの <script>/<style> 本文内の
// src=/href=（JS 文字列リテラル等）まで書き換えて壊す。
function runInlinePasses(html, baseDir, files, budget) {
  let out = replaceGenericAttrs(html, baseDir, files, budget);
  out = replaceScriptTags(out, baseDir, files, budget);
  out = replaceLinkStylesheets(out, baseDir, files, budget);
  return out;
}


// HTML コメント内の入れ子崩壊（--!> 等）を単純化して防ぐ
function escapeHtmlCommentSafe(s) {
  return s.replace(/[<>&"']/g, "").replace(/-+/g, "-");
}

// 属性値にそのまま埋め込めるようエスケープ（data URI / テキスト用）
function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * zip File を単一自己完結 HTML に組み立てる。
 * @param {File} file アップロードされた zip
 * @returns {Promise<{html: string, entryName: string}>}
 *   entryName は主 HTML のファイル名（保存名に使う）。
 *   失敗時は Error を投げる — message はユーザー向け、.status が
 *   あれば HTTP ステータス候補（index.js 側で 400 に変換）。
 */
export async function bundleZip(file) {
  const zipBytes = new Uint8Array(await file.arrayBuffer());

  // ヘッダ宣言サイズ／件数の事前拒否 — unzipSync は同期で全部解凍して
  // しまうため、filter で展開前に弾く（DoS 対策）。originalSize は
  // ヘッダ由来で偽装しうるため、実展開後のサイズも後述で検算する。
  let declaredTotal = 0;
  let declaredCount = 0;
  let entries;
  try {
    entries = unzipSync(zipBytes, {
      filter: (f) => {
        if (++declaredCount > MAX_FILE_COUNT) {
          throw new BundleError(`zip 内のファイル数が多すぎます（${MAX_FILE_COUNT} ファイル以下）`, "tooManyFiles", { max: MAX_FILE_COUNT });
        }
        if (f.originalSize > MAX_SINGLE_BYTES) {
          throw new BundleError(`zip 内のファイルが大きすぎます（1ファイル ${MAX_SINGLE_BYTES / (1024 * 1024)}MB 以下）`, "singleFileTooLarge", { maxMB: MAX_SINGLE_BYTES / (1024 * 1024) });
        }
        declaredTotal += f.originalSize;
        if (declaredTotal > MAX_TOTAL_BYTES) {
          throw new BundleError(`zip の展開後合計サイズが大きすぎます（${MAX_TOTAL_BYTES / (1024 * 1024)}MB 以下）`, "totalTooLarge", { maxMB: MAX_TOTAL_BYTES / (1024 * 1024) });
        }
        return true;
      },
    });
  } catch (e) {
    if (e instanceof BundleError) throw e;
    throw new BundleError("zip を展開できませんでした（破損または非対応形式）", "zipUnreadable");
  }

  // フィルタ + 実サイズ検算（ヘッダ偽装対策）
  const files = new Map(); // 正規化パス → Uint8Array
  let total = 0;
  for (const [rawName, bytes] of Object.entries(entries)) {
    const name = normalizeEntryName(rawName);
    if (!name) continue;
    if (bytes.length > MAX_SINGLE_BYTES) {
      throw new BundleError(`zip 内のファイルが大きすぎます（${name}: 1ファイル ${MAX_SINGLE_BYTES / (1024 * 1024)}MB 以下）`, "singleFileTooLarge", { maxMB: MAX_SINGLE_BYTES / (1024 * 1024) });
    }
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) {
      throw new BundleError(`zip の展開後合計サイズが大きすぎます（${MAX_TOTAL_BYTES / (1024 * 1024)}MB 以下）`, "totalTooLarge", { maxMB: MAX_TOTAL_BYTES / (1024 * 1024) });
    }
    files.set(name, bytes);
  }

  const paths = [...files.keys()];
  const entryName = pickEntryHtml(paths); // HTML なし / 判別不能は throw（BundleError）

  // 主 HTML の基準ディレクトリ（例: "mock/index.html" → "mock"、ルートなら ""）
  const slash = entryName.lastIndexOf("/");
  const baseDir = slash === -1 ? "" : entryName.slice(0, slash);

  // 埋め込み累積長の概算カウント — datauri/js/css を解決・埋め込むたびに
  // 加算し、構築完了を待たずに MAX_OUTPUT_BYTES 超過で打ち切る。
  // （厳密な最終長ではなく重複カウントもあり得るが、上限防御としては
  //   十分。構築後の実サイズチェックも別途残す。）
  const budget = {
    embedded: 0,
    add(n) {
      this.embedded += n;
      if (this.embedded > MAX_OUTPUT_BYTES) throw overOutputError();
    },
  };

  const html = runInlinePasses(strFromU8(files.get(entryName)), baseDir, files, budget);

  // 変換後サイズの上限（単発 .html と同じ 10MB）— 構築後の実測でも検算
  if (new TextEncoder().encode(html).length > MAX_OUTPUT_BYTES) {
    throw overOutputError();
  }

  // 保存名は主 HTML のファイル名（ディレクトリ部分は落とす）
  return { html, entryName: entryName.slice(slash + 1) };
}
