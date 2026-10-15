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
    if ((key !== 'children' && ['Identifier','MemberExpression'].includes(value.type)) ||
        (value.type === 'MemberExpression' && ['label', 'displayLabel', 'optionLabel', 'effortLabel', 'title', 'description'].includes(value.property.name))) {
      edits.push({ start: value.start, end: value.end, text: `zhDisplayLabel(${src.slice(value.start, value.end)})` });
    }
  });
  // These two getters are the picker library's item-to-label interface, not option values.
  if (/\/ProviderModelPicker-/.test(file)) {
    for (const match of src.matchAll(/function (?:lt|ut)\(e\)\{return e\.label\}/g)) {
      const start = match.index + match[0].indexOf('e.label');
      edits.push({ start, end: start + 'e.label'.length, text: 'zhDisplayLabel(e.label)' });
    }
  }
  if (/\/utils-Gxj8xu3M\.js$/.test(file)) {
    const from = 'let{label:ne}=ee,re=';
    if (src.split(from).length !== 2) throw Error('找不到模型選項的最終顯示標籤。');
    const start = src.indexOf(from);
    edits.push({ start, end: start + from.length, text: 'let{label:zhOptionLabel}=ee,ne=zhDisplayLabel(zhOptionLabel),re=' });
  }
  if (/\/main-CYYWX3h1\.js$/.test(file)) {
    const from = 'function sk(e,t){return e===0?null:`${e} ${t}${e===1?``:`s`}`}';
    if (src.split(from).length !== 2) throw Error('找不到更新項目數量的顯示函式。');
    const start = src.indexOf(from);
    edits.push({ start, end: start + from.length, text: 'function sk(e,t){return e===0?null:`${e} 個${t===`provider`?`供應商`:t===`server`?`伺服器`:t}`}'});
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
writeArchive(input, output, replacements);
console.log(`顯示標籤：${total} 個顯示接點；模型 ID、選項值及比對值維持原文。`);
