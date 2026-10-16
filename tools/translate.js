// Translate UI string literals in one JS source using the dictionary.
const { scanFile } = require("./scan");
const fs = require("fs");
const path = require("path");

const UI_CTX = new Set([
  "prop:children", "prop:label", "prop:title", "prop:aria-label", "prop:description", "prop:placeholder",
  "prop:detail", "prop:text", "prop:ariaLabel", "prop:emptyText", "prop:heading", "prop:subtitle", "prop:hint",
  "prop:tooltip", "prop:confirmLabel", "prop:cancelLabel", "prop:actionLabel", "prop:alt", "prop:helperText", "prop:caption",
]);
// Value-holding contexts that are only translated when the string never shows up in logic anywhere.
const SOFT_CTX = new Set(["var", "return", "assign", "arrow", "default", "tplexpr"]);
const LOGIC = /^(bin:(===|!==|==|!=|in)|case|key|ckey|member|call:(Set|Map)#|prop:(_tag|type|value|id|name|kind|key|status|className|d)$|test)/;
// The "Code" beside the T3 logo is the product name; the same word as a tab label is still translated.
const WORDMARK_CHILDREN = new Set(["Code"]);

function loadDict(dir) {
  const dict = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const obj = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const [k, v] of Object.entries(obj)) {
      if (dict.has(k) && dict.get(k) !== v) console.warn("dict conflict:", JSON.stringify(k), f);
      dict.set(k, v);
    }
  }
  return dict;
}

function placeholders(s) {
  return (s.match(/\{\d+\}/g) || []).sort().join(",");
}

function escTpl(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

// Source text of [start, end) with every edit fully inside that range applied.
function applyWithin(src, start, end, edits) {
  const inner = edits.filter((e) => e.start >= start && e.end <= end).sort((a, b) => a.start - b.start);
  let out = "";
  let pos = start;
  for (const e of inner) {
    if (e.start < pos) continue; // nested inside an edit already applied
    out += src.slice(pos, e.start) + e.text(edits);
    pos = e.end;
  }
  return out + src.slice(pos, end);
}

function render(node, src, zh, edits) {
  if (node.type === "Literal") return JSON.stringify(zh);
  const exprs = node.expressions.map((e) => applyWithin(src, e.start, e.end, edits));
  let out = "`";
  let last = 0;
  zh.replace(/\{(\d+)\}/g, (m, i, at) => {
    out += escTpl(zh.slice(last, at)) + "${" + exprs[Number(i)] + "}";
    last = at + m.length;
    return m;
  });
  return out + escTpl(zh.slice(last)) + "`";
}

// logicStrings: Set of values seen in logic contexts across the whole bundle.
function translateFile(file, dict, logicStrings, stats) {
  const edits = [];
  let src;
  scanFile(file, ({ node, value, ctx, src: s }) => {
    src = s;
    const zh = dict.get(value);
    if (zh === undefined) return;
    if (ctx === "prop:children" && WORDMARK_CHILDREN.has(value)) return;
    const dialog = ctx === "join" || /^call:[\w$]+\.confirm#0$/.test(ctx);
    // Page titles keyed by route, e.g. { "/settings/general": "General" }.
    const routeTitle = ctx.startsWith("prop:/settings/");
    // Labels can also serve as discriminants (e.g. label === "Commit").
    // Preserve those data values; patchLabels handles their final JSX display.
    const ui = UI_CTX.has(ctx) && !(ctx === "prop:label" && logicStrings.has(value));
    const ok = ui || dialog || routeTitle || (SOFT_CTX.has(ctx) && !logicStrings.has(value));
    if (!ok) return;
    // Translations may drop placeholders (e.g. English plural suffixes) but never add unknown ones.
    const known = new Set(placeholders(value).split(","));
    if (placeholders(zh) && !placeholders(zh).split(",").every((p) => known.has(p))) {
      console.warn("placeholder mismatch:", JSON.stringify(value), JSON.stringify(zh));
      return;
    }
    edits.push({ start: node.start, end: node.end, text: (all) => render(node, s, zh, all) });
    stats.used.add(value);
    stats.edits++;
  });
  if (!edits.length) return null;
  return applyWithin(src, 0, src.length, edits);
}

function collectLogicStrings(files) {
  const set = new Set();
  for (const f of files) scanFile(f, ({ value, ctx }) => { if (LOGIC.test(ctx)) set.add(value); });
  return set;
}

module.exports = { loadDict, translateFile, collectLogicStrings };
