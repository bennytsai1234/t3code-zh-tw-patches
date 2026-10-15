// Rewrite an asar archive in place-style: keep the header layout (incl. unpacked
// flags), replace contents of selected files, recompute offsets and integrity.
const fs = require("fs");
const crypto = require("crypto");
const asar = require("@electron/asar");

const BLOCK = 4 * 1024 * 1024;

function integrity(buf) {
  const blocks = [];
  for (let i = 0; i < buf.length; i += BLOCK) blocks.push(crypto.createHash("sha256").update(buf.subarray(i, i + BLOCK)).digest("hex"));
  if (blocks.length === 0) blocks.push(crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  return { algorithm: "SHA256", hash: crypto.createHash("sha256").update(buf).digest("hex"), blockSize: BLOCK, blocks };
}

function listFiles(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files)) {
    const p = prefix ? prefix + "/" + name : name;
    if (entry.files) listFiles(entry, p, out);
    else if (!entry.link && !entry.unpacked) out.push([p, entry]);
  }
  return out;
}

function readArchive(file) {
  const { header, headerSize } = asar.getRawHeader(file);
  const data = fs.readFileSync(file);
  const base = 8 + headerSize;
  const read = (entry) => data.subarray(base + Number(entry.offset), base + Number(entry.offset) + entry.size);
  return { header, files: listFiles(header, "", []), read };
}

// replacements: Map<path, Buffer>
function writeArchive(src, dest, replacements) {
  const { header, files, read } = readArchive(src);
  const chunks = [];
  let offset = 0;
  // Keep original data order (sorted by original offset) for stable layout.
  files.sort((a, b) => Number(a[1].offset) - Number(b[1].offset));
  // Identical files share one data region in the original archive; keep that sharing.
  const shared = new Map();
  for (const [p, entry] of files) {
    let buf = read(entry);
    if (replacements.has(p)) {
      buf = replacements.get(p);
      entry.integrity = integrity(buf);
      entry.size = buf.length;
      replacements.delete(p);
    } else {
      const key = entry.offset + ":" + entry.size;
      if (shared.has(key)) {
        entry.offset = shared.get(key);
        continue;
      }
      shared.set(key, String(offset));
    }
    entry.offset = String(offset);
    offset += buf.length;
    chunks.push(buf);
  }
  if (replacements.size) throw new Error("not in archive: " + [...replacements.keys()].join(", "));
  // Chromium pickle header, same as @electron/asar's writer.
  const json = JSON.stringify(header);
  const strBuf = Buffer.from(json, "utf8");
  const payloadSize = 4 + strBuf.length + ((4 - (strBuf.length % 4)) % 4);
  const inner = Buffer.alloc(4 + payloadSize);
  inner.writeUInt32LE(payloadSize, 0);
  inner.writeInt32LE(strBuf.length, 4);
  strBuf.copy(inner, 8);
  const outer = Buffer.alloc(8);
  outer.writeUInt32LE(4, 0);
  outer.writeUInt32LE(inner.length, 4);
  fs.writeFileSync(dest, Buffer.concat([outer, inner, ...chunks]));
}

module.exports = { readArchive, writeArchive };
