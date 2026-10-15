// node applyDesktop.js <in.asar> <out.asar> <replacements.json>
const fs = require("fs");
const { readArchive, writeArchive } = require("./asarRewrite");
const [inAsar, outAsar, replFile] = process.argv.slice(2);
const P = "apps/desktop/dist-electron/main.cjs";
const { files, read } = readArchive(inAsar);
let src = read(files.find(([p]) => p === P)[1]).toString("utf8");
for (const r of JSON.parse(fs.readFileSync(replFile, "utf8"))) {
  const n = src.split(r.from).length - 1;
  if (n !== r.count) throw new Error(`expected ${r.count} got ${n}: ${r.from.slice(0, 60)}`);
  src = src.split(r.from).join(r.to);
}
new Function(src.replace(/^#!.*/, "")); // syntax check
writeArchive(inAsar, outAsar, new Map([[P, Buffer.from(src, "utf8")]]));
console.log("ok");
