// Translate UI string literals in one JS source using the dictionary.
const { scanFile, strValue, contextOf } = require("./scan");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

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
  function canTranslate(value, ctx) {
    if (!dict.has(value) || (ctx === "prop:children" && WORDMARK_CHILDREN.has(value))) return false;
    const dialog = ctx === "join" || /^call:[\w$]+\.confirm#0$/.test(ctx);
    // Page titles keyed by route, e.g. { "/settings/general": "General" }.
    const routeTitle = ctx.startsWith("prop:/settings/");
    // Labels can also serve as discriminants (e.g. label === "Commit").
    // Preserve those data values; patchLabels handles their final JSX display.
    const ui = UI_CTX.has(ctx) && !(ctx === "prop:label" && logicStrings.has(value));
    return ui || dialog || routeTitle || (SOFT_CTX.has(ctx) && !logicStrings.has(value));
  }
  scanFile(file, ({ node, value, ctx, ancestors, src: s }) => {
    src = s;
    if (!canTranslate(value, ctx)) return;
    // An input object's title is request data, not a rendered title.
    if (ctx === "prop:title" && ancestors.some(parent => parent.type === "Property" &&
        !parent.computed && (parent.key.name ?? parent.key.value) === "input")) return;
    // A fragment must not create mixed-language text inside an untranslated template.
    for (let i = 0; i < ancestors.length - 1; i++) {
      const parent = ancestors[i];
      if (parent.type === "TemplateLiteral" && !canTranslate(strValue(parent), contextOf(ancestors.slice(0, i + 1), parent).ctx)) return;
    }
    const zh = dict.get(value);
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

function readCatalog(file) {
  const source = fs.readFileSync(file, "utf8");
  const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const bindings = new Map(ast.body.flatMap(node => node.declarations ?? [])
    .map(node => [node.id.name, node.init]));
  const entry = ast.body.flatMap(node => node.specifiers ?? [])
    .find(specifier => specifier.exported?.name === "default");
  const messages = bindings.get(entry?.local.name);
  if (messages?.type !== "ObjectExpression") throw Error("找不到官方介面詞庫的預設匯出：" + file);
  const entries = new Map(messages.properties.map(property => [property.key.name ?? property.key.value, property.value]));
  return { source, ast, bindings, entries };
}

function catalogText(node) {
  if (node.type === "Literal" || (node.type === "TemplateLiteral" && node.expressions.length === 0)) {
    return strValue(node);
  }
  return null;
}

function createTaiwanTextConverter() {
  const toTaiwan = require("opencc-js/cn2t").Converter({ from: "cn", to: "twp" });
  const terms = { 子智慧體: "子代理", 智慧體: "代理", 子智能體: "子代理", 智能體: "代理",
    會話: "對話", 計算機: "電腦", 憑據: "憑證", 令牌: "權杖", 許可權: "權限" };
  const termPattern = new RegExp(Object.keys(terms).join("|"), "g");
  return text => text.replace(/\x60[^\x60]*\x60|https?:\/\/[^\s]+|\p{Script=Han}+/gu, part =>
    /^\p{Script=Han}/u.test(part) ? toTaiwan(part).replace(termPattern, term => terms[term]) : part);
}

function translateCatalog(englishFile, chineseFile, dict, stats) {
  const english = readCatalog(englishFile);
  const chinese = readCatalog(chineseFile);
  if (english.entries.size !== chinese.entries.size) throw Error("官方英中詞庫的鍵數不符。");
  const convert = createTaiwanTextConverter();
  const overrides = new Map();
  for (const [key, original] of english.entries) {
    const target = chinese.entries.get(key);
    if (!target) throw Error("官方中文詞庫缺少鍵 " + key);
    const value = catalogText(english.bindings.get(original.name) ?? original);
    if (!dict.has(value) || catalogText(chinese.bindings.get(target.name) ?? target) === null) continue;
    overrides.set(target, dict.get(value));
    stats.used.add(value);
  }
  const edits = [];
  walk.fullAncestor(chinese.ast, (node, _, ancestors) => {
    let translation = overrides.get(node);
    if (translation === undefined) {
      const text = catalogText(node);
      if (!text || !/\p{Script=Han}/u.test(text)) return;
      const context = contextOf(ancestors, node).ctx;
      if (context === "key" || context === "ckey") return;
      translation = convert(text);
      if (translation === text) return;
    }
    edits.push({ start: node.start, end: node.end, text: () => JSON.stringify(translation) });
    stats.edits++;
  });
  return applyWithin(chinese.source, 0, chinese.source.length, edits);
}

function collectLogicStrings(files) {
  const set = new Set();
  for (const f of files) scanFile(f, ({ value, ctx }) => { if (LOGIC.test(ctx)) set.add(value); });
  return set;
}

module.exports = { loadDict, translateFile, translateCatalog, createTaiwanTextConverter, collectLogicStrings };
