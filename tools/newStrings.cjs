// node newStrings.cjs <old-client-dir> <new-client-dir> <out.json>
// Lists strings that are new in the new version, missing from the dictionary, and sit where translate.js
// would translate them; each row carries a source snippet for reading fragments in context.
const fs = require('fs');
const path = require('path');
const { scanFile } = require('./scan');
const { loadDict } = require('./translate');
const [oldDir, newDir, out] = process.argv.slice(2);
if (!oldDir || !newDir || !out) throw Error('Usage: node newStrings.cjs <old-client-dir> <new-client-dir> <out.json>');
const dict = loadDict(path.join(__dirname, '../translations/client'));
// Same contexts as translate.js: UI always, SOFT only when the string never appears in logic.
const UI = /^prop:(children|label|title|aria-label|description|placeholder|detail|text|ariaLabel|emptyText|heading|subtitle|hint|tooltip|confirmLabel|cancelLabel|actionLabel|alt|helperText|caption)$|^prop:\/settings\/|^join$|^call:[\w$]+\.confirm#0$/;
const SOFT = new Set(['var', 'return', 'assign', 'arrow', 'default', 'tplexpr']);
const LOGIC = /^(bin:(===|!==|==|!=|in)|case|key|ckey|member|call:(Set|Map)#|prop:(_tag|type|value|id|name|kind|key|status|className|d)$|test)/;
const looksLikeText = v => v.length >= 2 && /[A-Za-z]{2}/.test(v) && !/^[a-z0-9_.:\/-]+$/.test(v) && !/^[A-Za-z][A-Za-z0-9]*$/.test(v) || /^[A-Z][a-z]+$/.test(v);
const jsFiles = dir => fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
const old = new Set();
for (const f of jsFiles(oldDir)) scanFile(f, ({ value }) => old.add(value));
const found = new Map(), logic = new Set();
for (const f of jsFiles(newDir)) {
  scanFile(f, ({ node, value, ctx, src }) => {
    if (LOGIC.test(ctx)) logic.add(value);
    if (old.has(value) || dict.has(value) || !looksLikeText(value) || (!UI.test(ctx) && !SOFT.has(ctx))) return;
    let e = found.get(value);
    if (!e) found.set(value, e = { v: value, ctx: new Set(), files: new Set(), snippet: src.slice(Math.max(0, node.start - 160), node.end + 100) });
    e.ctx.add(ctx);
    e.files.add(path.basename(f).replace(/-[\w-]{8}\.js$/, ''));
  });
}
const rows = [...found.values()].map(e => {
  const ui = [...e.ctx].some(c => UI.test(c));
  return { v: e.v, ctx: [...e.ctx].join(','), ui, translatable: ui || !logic.has(e.v), files: [...e.files].join(','), snippet: e.snippet };
});
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`${rows.length} 條新字串；顯示位置 ${rows.filter(r => r.ui).length} 條，其他會被翻譯的位置 ${rows.filter(r => !r.ui && r.translatable).length} 條`);
