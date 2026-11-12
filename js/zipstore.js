// ============================================
// 朱入れ — js/zipstore.js
// Minimal browser-side ZIP writer (STORE, no compression).
// Purpose: folder upload UX — the browser packs a picked/dropped
// folder into a .zip and reuses the existing zip upload path.
// The Worker's fflate unzipSync accepts STORE entries; correct
// CRC-32 is mandatory (unzipSync rejects bad CRC).
// No imports, no bundler (same spirit as i18n.js / brand.js).
// Public API: global `const ZipStore` -> ZipStore.createZip(files)
//   files: { name: string ("/"-separated entry path), data: Uint8Array|ArrayBuffer }[]
//   returns: Promise<Blob> (application/zip)
// Limits (non-zip64): < 65535 entries, each < 4GB. Exceeding them
// throws a clear error instead of producing a corrupt archive.
// ============================================

const ZipStore = (() => {
  const MAX_ENTRIES = 65535;
  const MAX_ENTRY_BYTES = 0xFFFFFFFE; // 4GB-2: >= 0xFFFFFFFF is zip64 territory

  // ---- CRC-32 (IEEE, reflected) ----
  let crcTable = null;
  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function toU8(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    throw new Error("zipstore: entry data must be Uint8Array or ArrayBuffer");
  }

  // DOS date/time from a Date (fixed per archive, fine for our use).
  function dosDateTime(d) {
    const time = ((d.getHours() & 0x1F) << 11) |
                 ((d.getMinutes() & 0x3F) << 5) |
                 ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    const year = Math.max(1980, d.getFullYear());
    const date = (((year - 1980) & 0x7F) << 9) |
                 (((d.getMonth() + 1) & 0x0F) << 5) |
                 (d.getDate() & 0x1F);
    return { time, date };
  }

  function utf8Size(s) {
    return new TextEncoder().encode(s).length;
  }

  // Write a little-endian u16/u32 into a Uint8Array at offset.
  function putU16(buf, off, v) {
    buf[off] = v & 0xFF;
    buf[off + 1] = (v >>> 8) & 0xFF;
  }
  function putU32(buf, off, v) {
    buf[off] = v & 0xFF;
    buf[off + 1] = (v >>> 8) & 0xFF;
    buf[off + 2] = (v >>> 16) & 0xFF;
    buf[off + 3] = (v >>> 24) & 0xFF;
  }

  const LOCAL_HEADER_SIZE = 30;
  const CENTRAL_HEADER_SIZE = 46;
  const EOCD_SIZE = 22;

  // Build one fixed-size header into `buf` at `off`.
  function writeLocalHeader(buf, off, nameBytes, crc, size, dos) {
    putU32(buf, off + 0, 0x04034b50);  // signature
    putU16(buf, off + 4, 20);          // version needed (2.0)
    putU16(buf, off + 6, 0x0800);      // flags: UTF-8 names
    putU16(buf, off + 8, 0);           // method: STORE
    putU16(buf, off + 10, dos.time);
    putU16(buf, off + 12, dos.date);
    putU32(buf, off + 14, crc);
    putU32(buf, off + 18, size);       // compressed size (== uncompressed)
    putU32(buf, off + 22, size);
    putU16(buf, off + 26, nameBytes.length);
    putU16(buf, off + 28, 0);          // extra length
  }

  function writeCentralHeader(buf, off, nameBytes, crc, size, localOffset, dos) {
    putU32(buf, off + 0, 0x02014b50);  // signature
    putU16(buf, off + 4, 20);          // version made by
    putU16(buf, off + 6, 20);          // version needed
    putU16(buf, off + 8, 0x0800);      // flags: UTF-8 names
    putU16(buf, off + 10, 0);          // method: STORE
    putU16(buf, off + 12, dos.time);
    putU16(buf, off + 14, dos.date);
    putU32(buf, off + 16, crc);
    putU32(buf, off + 20, size);
    putU32(buf, off + 24, size);
    putU16(buf, off + 28, nameBytes.length);
    putU16(buf, off + 30, 0);          // extra length
    putU16(buf, off + 32, 0);          // comment length
    putU16(buf, off + 34, 0);          // disk number start
    putU16(buf, off + 36, 0);          // internal attrs
    putU32(buf, off + 38, 0);          // external attrs
    putU32(buf, off + 42, localOffset);
  }

  function writeEocd(buf, off, count, centralSize, centralOffset) {
    putU32(buf, off + 0, 0x06054b50);  // signature
    putU16(buf, off + 4, 0);           // disk number
    putU16(buf, off + 6, 0);           // disk with central dir
    putU16(buf, off + 8, count);
    putU16(buf, off + 10, count);
    putU32(buf, off + 12, centralSize);
    putU32(buf, off + 16, centralOffset);
    putU16(buf, off + 20, 0);          // comment length
  }

  async function createZip(files) {
    if (!Array.isArray(files)) throw new Error("zipstore: files must be an array");
    if (files.length === 0) throw new Error("zipstore: no files to zip");
    if (files.length > MAX_ENTRIES) {
      throw new Error(`zipstore: too many entries (${files.length} > ${MAX_ENTRIES})`);
    }

    const encoder = new TextEncoder();
    const entries = [];
    let totalSize = 0;

    for (const f of files) {
      if (!f || typeof f.name !== "string" || !f.name) {
        throw new Error("zipstore: every entry needs a non-empty name");
      }
      // Normalize separators, strip leading slashes and ".." segments.
      const name = f.name.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!name || name.split("/").some((s) => s === "..")) {
        throw new Error(`zipstore: unsafe entry name: ${f.name}`);
      }
      const data = toU8(f.data);
      if (data.length > MAX_ENTRY_BYTES) {
        throw new Error(`zipstore: entry too large (>= 4GB): ${name}`);
      }
      const nameBytes = encoder.encode(name);
      entries.push({ name, nameBytes, data, crc: crc32(data) });
      totalSize += LOCAL_HEADER_SIZE + nameBytes.length + data.length +
                   CENTRAL_HEADER_SIZE + nameBytes.length;
    }
    totalSize += EOCD_SIZE;
    if (totalSize > MAX_ENTRY_BYTES) {
      throw new Error("zipstore: archive too large for non-zip64 (>= 4GB)");
    }

    const buf = new Uint8Array(totalSize);
    const dos = dosDateTime(new Date());
    let off = 0;
    const locals = [];

    for (const e of entries) {
      const localOffset = off;
      writeLocalHeader(buf, off, e.nameBytes, e.crc, e.data.length, dos);
      off += LOCAL_HEADER_SIZE;
      buf.set(e.nameBytes, off); off += e.nameBytes.length;
      buf.set(e.data, off); off += e.data.length;
      locals.push({ localOffset });
    }

    const centralOffset = off;
    entries.forEach((e, i) => {
      writeCentralHeader(buf, off, e.nameBytes, e.crc, e.data.length, locals[i].localOffset, dos);
      off += CENTRAL_HEADER_SIZE;
      buf.set(e.nameBytes, off); off += e.nameBytes.length;
    });
    const centralSize = off - centralOffset;

    writeEocd(buf, off, entries.length, centralSize, centralOffset);
    off += EOCD_SIZE;
    if (off !== totalSize) throw new Error("zipstore: internal size mismatch");

    return new Blob([buf], { type: "application/zip" });
  }

  return { createZip };
})();

if (typeof window !== "undefined") window.ZipStore = ZipStore;

// NOTE: this file is loaded as a CLASSIC <script> (see project.html) and is
// copied verbatim to dist/ by build.sh. Do NOT add ESM `export` statements
// here — they are a SyntaxError in classic scripts. Node verification
// scripts load it via createRequire (CommonJS path) instead.
if (typeof module !== "undefined" && module.exports) module.exports = ZipStore;
