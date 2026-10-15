// Build an inventory of natural-language-looking strings with their contexts.
const fs = require("fs");
const path = require("path");
const { scanFile } = require("./scan");

const dir = process.argv[2];
const out = process.argv[3];

function looksLikeText(v) {
  if (v.length < 2 || v.length > 400) return false;
  if (!/[A-Za-z]/.test(v)) return false;
  if (/^[a-z0-9_.:\/-]+$/.test(v)) return false; // identifiers, paths, keys
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(v) && !/^[A-Z][a-z]+$/.test(v)) return false; // camelCase / ALLCAPS ids
  if (/[{};=<>\\|^$]/.test(v.replace(/\{\d+\}/g, ""))) return false; // code / css / regex-ish
  if (/^(https?:|\.|#|--|@|\/)/.test(v)) return false;
  if (/^[\w-]+(\s[\w-]+)*$/.test(v) && /\b(flex|grid|text-|bg-|px-|py-|w-|h-|rounded|border|items-|justify-|gap-|size-|min-|max-|inset|shrink|absolute|relative|hidden)\b/.test(v)) return false; // tailwind classes
  return /^[A-Z]/.test(v) || /[a-z] [a-z]/.test(v);
}

const inv = new Map();
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
for (const f of files) {
  scanFile(path.join(dir, f), ({ value, ctx, via }) => {
    if (!looksLikeText(value)) return;
    let e = inv.get(value);
    if (!e) inv.set(value, (e = { n: 0, ctx: {}, files: new Set() }));
    e.n++;
    e.ctx[ctx] = (e.ctx[ctx] || 0) + 1;
    e.files.add(f);
  });
}
const arr = [...inv].map(([v, e]) => ({ v, n: e.n, ctx: e.ctx, files: [...e.files] }));
fs.writeFileSync(out, JSON.stringify(arr, null, 0));
const ctxTotals = {};
for (const e of arr) for (const [c, n] of Object.entries(e.ctx)) ctxTotals[c] = (ctxTotals[c] || 0) + n;
console.log(arr.length, "distinct strings");
console.log(Object.entries(ctxTotals).sort((a, b) => b[1] - a[1]).slice(0, 80).map((x) => x.join("=")).join("  "));
