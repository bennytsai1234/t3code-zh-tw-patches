// Porting aid: line up the same source expression in two bundles and list renamed identifiers.
// Usage: node tools/mapNames.cjs <bundle A> <text in A> <bundle B> <text in B>
// Each text must occur once and end right before the expression to compare, e.g.
// "const layerAssetRoute = " in one bundle and "\tlayerAssetRoute = " in the other.
const fs = require('fs');
const acorn = require('acorn');
const options = { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true };
function expressionAfter(file, text) {
  const src = fs.readFileSync(file, 'utf8');
  const needle = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const at = src.indexOf(needle);
  if (at < 0 || src.indexOf(needle, at + 1) >= 0) throw Error(`${file}: 需要剛好一處 ${JSON.stringify(text)}`);
  const start = at + needle.length;
  const node = acorn.parseExpressionAt(src, start, options);
  return [...acorn.tokenizer(src.slice(start, node.end), options)];
}
function alignNames(a, b) {
  if (a.length !== b.length) throw Error(`權杖數不同：${a.length} 與 ${b.length}`);
  const names = new Map();
  a.forEach((x, i) => {
    const y = b[i];
    if (x.type.label === 'name' && y.type.label === 'name') {
      if (x.value === y.value) return;
      const seen = names.get(x.value);
      if (seen && seen !== y.value) throw Error(`${x.value} 同時對到 ${seen} 與 ${y.value}`);
      names.set(x.value, y.value);
    } else if (x.type !== y.type || x.value !== y.value) {
      throw Error(`第 ${i} 個權杖不同：${JSON.stringify(x.value ?? x.type.label)} 與 ${JSON.stringify(y.value ?? y.type.label)}`);
    }
  });
  return names;
}
module.exports = { alignNames, expressionAfter };
if (require.main === module) {
  const [fileA, textA, fileB, textB] = process.argv.slice(2);
  const names = alignNames(expressionAfter(fileA, textA), expressionAfter(fileB, textB));
  for (const [x, y] of names) console.log(`${x} -> ${y}`);
  if (!names.size) console.log('名稱全同');
}
