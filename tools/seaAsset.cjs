// Locates the server module (binMain.mjs) embedded in the Linux `t3` single executable.
// Usage: node tools/seaAsset.cjs <t3> <output.mjs>   writes the module, for name mapping when porting.
// Asset record inside the SEA blob: u64 key length, key, u64 content length, content.
const fs = require('fs');

function findServerModule(exe) {
  const key = Buffer.concat([Buffer.alloc(8), Buffer.from('binMain.mjs')]);
  key.writeBigUInt64LE(11n);
  const at = exe.indexOf(key);
  if (at < 0 || exe.indexOf(key, at + 1) >= 0) throw Error('找不到唯一的內嵌伺服器程式 binMain.mjs。');
  const start = at + key.length + 8;
  const size = Number(exe.readBigUInt64LE(at + key.length));
  if (start + size > exe.length || !exe.subarray(start, start + 20).toString().startsWith('#!/usr/bin/env node')) throw Error('內嵌伺服器程式的長度或開頭不符。');
  return { start, size };
}

module.exports = { findServerModule };
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!output) throw Error('Usage: node tools/seaAsset.cjs <t3> <output.mjs>');
  const exe = fs.readFileSync(input);
  const { start, size } = findServerModule(exe);
  fs.writeFileSync(output, exe.subarray(start, start + size));
  console.log(`已寫出 ${output}（${size} 位元組）`);
}
