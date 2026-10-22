// node extractClient.cjs <server.asar> <output-directory>
// Writes every web client module (apps/server/dist/client/assets/*) flat into the output directory.
const fs = require('fs');
const path = require('path');
const { readArchive } = require('./asarRewrite');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node extractClient.cjs <server.asar> <output-directory>');
const prefix = 'apps/server/dist/client/assets/';
const archive = readArchive(input);
fs.mkdirSync(output, { recursive: true });
let count = 0;
for (const [p, entry] of archive.files) {
  if (!p.startsWith(prefix) || p.slice(prefix.length).includes('/')) continue;
  fs.writeFileSync(path.join(output, p.slice(prefix.length)), archive.read(entry));
  count++;
}
console.log(`已解出 ${count} 個檔案到 ${output}`);
