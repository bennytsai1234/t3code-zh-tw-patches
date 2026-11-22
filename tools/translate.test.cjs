const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { translateFile, translateCatalog } = require('./translate');

test('樣板字串沒有完整譯文時保留內層片段；有完整譯文時一併翻譯', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3zh-translate-test-'));
  try {
    const file = path.join(dir, 'sample.js');
    fs.writeFileSync(file, 'const a = `${x ? `Side chat` : `Subagent`} needs ${n}`;\nconst b = { children: `${x ? `Side chat` : `Subagent`} is ready` };');
    const dict = new Map([['Side chat', '側邊對話'], ['Subagent', '子代理'], ['{0} is ready', '{0}已就緒']]);
    const result = translateFile(file, dict, new Set(), { used: new Set(), edits: 0 });
    assert.match(result, /`\$\{x \? `Side chat` : `Subagent`\} needs \$\{n\}`/);
    assert.match(result, /`\$\{x \? `側邊對話` : `子代理`\}已就緒`/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('請求的 input.title 保留原文，畫面標題仍可翻譯', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3zh-translate-test-'));
  try {
    const file = path.join(dir, 'sample.js');
    fs.writeFileSync(file, 'send({input:{title:`Side chat`}}); render({title:`Side chat`});');
    const result = translateFile(file, new Map([['Side chat', '側邊對話']]), new Set(), { used: new Set(), edits: 0 });
    assert.equal(result, 'send({input:{title:`Side chat`}}); render({title:`側邊對話`});');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('介面詞庫保留官方雜湊鍵、富文字結構和變數，優先採用專案譯文', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3zh-translate-test-'));
  try {
    const english = path.join(dir, 'en.js');
    const chinese = path.join(dir, 'zh.js');
    fs.writeFileSync(english, 'const label = "Manual", catalog = { a: "Settings", b: label, c: ["In ", {i:1,k:"_gt_value_1",v:"v"}] }; export { catalog as default, label as b };');
    fs.writeFileSync(chinese, 'const label = "手动", catalog = { a: "设置", b: label, c: ["计算机上的", {i:1,k:"_gt_value_1",v:"v"}, "会话"] }; export { catalog as default, label as b };');
    const dict = new Map([['Settings', '設定'], ['Manual', '手動']]);
    const result = translateCatalog(english, chinese, dict, { used: new Set(), edits: 0 });
    assert.equal(result, 'const label = "手動", catalog = { a: "設定", b: "手動", c: ["電腦上的", {i:1,k:"_gt_value_1",v:"v"}, "對話"] }; export { catalog as default, label as b };');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
