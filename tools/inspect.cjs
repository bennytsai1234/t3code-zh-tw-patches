// Print bounded contexts from a bundled source without dumping minified lines.
const fs = require('fs');
const [file, term, radius = '400', limit = '8'] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
let at = -1;
for (let i = 0; i < Number(limit); i++) {
  at = src.indexOf(term, at + 1);
  if (at < 0) break;
  console.log(`\n@${at}: ${src.slice(Math.max(0, at - Number(radius)), at + term.length + Number(radius))}`);
}
