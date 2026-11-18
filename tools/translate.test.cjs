const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { translateFile } = require('./translate');

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

test('官方設定詞庫翻譯雜湊鍵下的文字並保留鍵值', { timeout: 10000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3zh-translate-test-'));
  try {
    const file = path.join(dir, 'settings.js');
    fs.writeFileSync(file, 'const label = "Manual"; export default { "0a75e464d833bca8": "Settings", "62570d4bfe4ab517": label };');
    const dict = new Map([['Settings', '設定'], ['Manual', '手動']]);
    const result = translateFile(file, dict, new Set(['Manual']), { used: new Set(), edits: 0 }, { settingsCatalog: true });
    assert.equal(result, 'const label = "手動"; export default { "0a75e464d833bca8": "設定", "62570d4bfe4ab517": label };');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
