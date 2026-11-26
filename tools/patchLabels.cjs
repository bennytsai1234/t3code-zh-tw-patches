// Translate final rendered labels, preserving values used by selection and dispatch.
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const { readArchive, writeArchive } = require('./asarRewrite');
const { spawnSync } = require('child_process');
const [input, output] = process.argv.slice(2);
const labels = JSON.parse(fs.readFileSync(path.join(__dirname, '../translations/display-labels.json'), 'utf8'));
const archive = readArchive(input), replacements = new Map();
let total = 0;
// Version-pinned modules; a missing one means the chunk names changed.
const pinned = new Set(['picker', 'utils', 'main', 'network', 'composer']);
for (const [file, entry] of archive.files) {
  if (!/\/client\/assets\/.*\.js$/.test(file) || /\/(?:dist-|chunk-|runtime-|index-|katex|cytoscape|mermaid)/.test(file)) continue;
  let src = archive.read(entry).toString('utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  walk.fullAncestor(ast, (node, _, ancestors) => {
    // Text labels inside JSX child arrays (e.g. [option.label, defaultBadge]).
    if (node.type === 'MemberExpression' && ['label','description','effortLabel'].includes(node.property.name)) {
      const array = ancestors[ancestors.length - 2];
      const property = ancestors[ancestors.length - 3];
      const object = ancestors[ancestors.length - 4];
      const call = ancestors[ancestors.length - 5];
      if (array?.type === 'ArrayExpression' && property?.type === 'Property' &&
          (property.key.name ?? property.key.value) === 'children' && object?.type === 'ObjectExpression' &&
          call?.type === 'CallExpression' && call.arguments[1] === object &&
          /\.jsxs?\)?$/.test(src.slice(call.callee.start, call.callee.end))) {
        edits.push({start:node.start,end:node.end,text:`zhDisplayLabel(${src.slice(node.start,node.end)})`});
      }
    }
    if (node.type !== 'Property' || node.computed) return;
    const key = node.key.name ?? node.key.value;
    if (!['children', 'aria-label', 'title'].includes(key)) return;
    const parent = ancestors[ancestors.length - 2];
    const call = ancestors[ancestors.length - 3];
    if (parent?.type !== 'ObjectExpression' || call?.type !== 'CallExpression' || call.arguments[1] !== parent) return;
    const callee = src.slice(call.callee.start, call.callee.end);
    if (!/\.jsxs?\)?$/.test(callee)) return;
    const value = node.value;
    if ((key === 'children' && /\/SettingsPanels-Dcoqotsv\.js$/.test(file) && ['Identifier', 'MemberExpression'].includes(value.type)) ||
        (key !== 'children' && ['Identifier','MemberExpression'].includes(value.type)) ||
        (value.type === 'MemberExpression' && ['label', 'displayLabel', 'optionLabel', 'effortLabel', 'title', 'description'].includes(value.property.name))) {
      edits.push({ start: value.start, end: value.end, text: `zhDisplayLabel(${src.slice(value.start, value.end)})` });
    }
  });
  // These two getters are the picker library's item-to-label interface, not option values.
  if (/\/ProviderModelPicker-Tx_dd0AL\.js$/.test(file)) {
    const getters = [...src.matchAll(/function (?:gn|_n)\(e\)\{return e\.(?:label|fullLabel)\}/g)];
    if (getters.length !== 2) throw Error('找不到模型選擇器的兩個標籤函式。');
    for (const match of getters) {
      const value = match[0].includes('e.fullLabel') ? 'e.fullLabel' : 'e.label';
      const start = match.index + match[0].indexOf(value);
      edits.push({ start, end: start + value.length, text: `zhDisplayLabel(${value})` });
    }
    pinned.delete('picker');
  }
  if (/\/utils-Bng1kvMW\.js$/.test(file)) {
    const from = 'let{label:h}=m,g=n.provider===`codex`';
    if (src.split(from).length !== 2) throw Error('找不到模型選項的最終顯示標籤。');
    const start = src.indexOf(from);
    edits.push({ start, end: start + from.length, text: 'let{label:zhOptionLabel}=m,h=zhDisplayLabel(zhOptionLabel),g=n.provider===`codex`' });
    // The helper returns the server's option label for the composer trigger, menu rows and summaries; display-only.
    const trigger = 'return e.options.find(e=>e.id===r)?.label??';
    if (src.split(trigger).length !== 2) throw Error('找不到選項標籤的回傳位置。');
    const triggerStart = src.indexOf(trigger);
    edits.push({ start: triggerStart, end: triggerStart + trigger.length, text: 'return zhDisplayLabel(e.options.find(e=>e.id===r)?.label)??' });
    pinned.delete('utils');
  }
  if (/\/messages-Du1c-VEy\.js$/.test(file)) {
    const localeLabel = 'zh:`中文（简体）`';
    const localeMatch = 'var na=/^zh[-_](hant|tw|hk|mo)\\b/;function ra(e,t){let n=e.trim().toLowerCase(),r=n.split(/[-_]/)[0],i=t.find(e=>e.toLowerCase()===n);return i||na.test(n)?i:t.find(e=>e.toLowerCase()===r)}';
    for (const [from, text] of [
      [localeLabel, 'zh:`繁體中文`'],
      [localeMatch, 'function ra(e,t){let n=e.trim().toLowerCase(),r=n.split(/[-_]/)[0];return t.find(e=>e.toLowerCase()===n)??t.find(e=>e.toLowerCase()===r)}']
    ]) {
      if (src.split(from).length !== 2) throw Error('找不到官方中文語系標籤或系統語系比對位置。');
      const start = src.indexOf(from);
      edits.push({ start, end: start + from.length, text });
    }
    pinned.delete('main');
  }
  if (/\/network-IO1fFe6J\.js$/.test(file)) {
    const from = 'language:x.pipe(A(h(\x60en\x60)))';
    if (src.split(from).length !== 2) throw Error('找不到用戶端的預設語系設定。');
    const start = src.indexOf(from);
    edits.push({ start, end: start + from.length, text: 'language:x.pipe(A(h(\x60system\x60)))' });
    pinned.delete('network');
  }
  if (/\/ThreadRouteView-jIIdWstE\.js$/.test(file)) {
    const from = 'className:\x60max-w-24 truncate\x60,children:d';
    if (src.split(from).length !== 2) throw Error('找不到輸入框的模型思考程度標籤。');
    const start = src.indexOf(from);
    edits.push({ start, end: start + from.length, text: 'className:\x60max-w-24 truncate\x60,children:zhDisplayLabel(d)' });
    pinned.delete('composer');
  }
  if (!edits.length) continue;
  edits.sort((a,b) => b.start-a.start);
  for (const e of edits) src = src.slice(0,e.start)+e.text+src.slice(e.end);
  src += `\nconst zhDisplayLabels=${JSON.stringify(labels)};\nfunction zhDisplayLabel(value){return typeof value==="string"&&Object.hasOwn(zhDisplayLabels,value)?zhDisplayLabels[value]:value;}\n`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: src, encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr);
  replacements.set(file, Buffer.from(src));
  total += edits.length;
}
if (pinned.size) throw Error(`找不到版本限定的顯示模組：${[...pinned].join(', ')}`);
writeArchive(input, output, replacements);
console.log(`顯示標籤：${total} 個顯示接點；模型 ID、選項值及比對值維持原文。`);
