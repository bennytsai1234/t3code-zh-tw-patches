// node apply.js <in.asar> <out.asar> <dictDir> [extractedDir]
// Translates client assets from in.asar and writes out.asar.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { readArchive, writeArchive } = require("./asarRewrite");
const { loadDict, translateFile, collectLogicStrings } = require("./translate");

const [inAsar, outAsar, dictDir] = process.argv.slice(2);
const PREFIX = "apps/server/dist/client/assets/";
const { files, read } = readArchive(inAsar);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t3zh-"));
const targets = [];
for (const [p, entry] of files) {
  if (!p.startsWith(PREFIX) || !p.endsWith(".js")) continue;
  const local = path.join(tmp, p.slice(PREFIX.length));
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, read(entry));
  targets.push([p, local]);
}
const dict = loadDict(dictDir);
const logic = collectLogicStrings(targets.map((t) => t[1]));
const stats = { used: new Set(), edits: 0 };
const repl = new Map();
for (const [p, local] of targets) {
  const out = translateFile(local, dict, logic, stats);
  if (out == null) continue;
  // V8 syntax check (the browser's parser), not just acorn.
  const check = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: out, encoding: "utf8" });
  if (check.status !== 0) throw new Error(`syntax error after translating ${p}:\n${check.stderr.slice(0, 600)}`);
  repl.set(p, Buffer.from(out, "utf8"));
}
fs.rmSync(tmp, { recursive: true });
const changedFiles = repl.size;
writeArchive(inAsar, outAsar, repl);
const unused = [...dict.keys()].filter((k) => !stats.used.has(k));
console.log(`dict ${dict.size}, used ${stats.used.size}, edits ${stats.edits}, files ${changedFiles}`);
if (unused.length) console.log("unused:", unused.map((u) => JSON.stringify(u)).join(" "));
