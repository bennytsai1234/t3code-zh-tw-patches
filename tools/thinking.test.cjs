const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const { patchExpandedReasoningRenderer } = require('./patchThinkingRender.cjs');

const expandedEntryRenderer = 'e=e=>(0,$.jsx)(lr,{className:`text-foreground`,text:e.detail??``,cwd:r.markdownCwd,threadRef:r.threadRef??void 0,skills:r.skills,isStreaming:s(e),headingLevelOffset:3,onUseArtifactTemplate:r.onUseArtifactTemplate,onImageExpand:r.onImageExpand,lineBreaks:!0},e.id),';

function harness(request, indexedDB) {
  const effects = [];
  const context = vm.createContext({
    Promise, Map, Set, Error, JSON, crypto: webcrypto, TextEncoder, indexedDB,
    Jp: { parse: text => ({ type: 'root', children: [{ type: 'text', position: { start: { offset: 0 }, end: { offset: text.length } } }] }) },
    zhTranslateRequest: request,
    zhThinkingRegistryContext: {},
    Z: { useContext: () => null, useState: initial => [initial, () => {}], useReducer: () => [0, () => {}], useEffect: effect => effects.push(effect) },
    $: { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'response-markdown.inc.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'thinking-client.inc.js'), 'utf8') + '\nthis.component = ZhThinking;', context);
  return {
    render(text, active = false, threadId = 'thread-1') {
      const result = context.component({ text, active, threadId, environmentId: 'env-1', render: t => t });
      while (effects.length) effects.shift()();
      return result;
    },
    async settle() { await vm.runInContext('zhThinkingQueue', context); }
  };
}
function mockIndexedDB(values) {
  let storeReady = false;
  const database = {
    objectStoreNames: { contains: name => storeReady && name === 'translations' },
    createObjectStore(name) {
      if (name !== 'translations') throw Error('Unexpected object store');
      storeReady = true;
    },
    transaction() {
      if (!storeReady) throw Error('Object store has not been created');
      const transaction = {};
      return Object.assign(transaction, {
        objectStore() {
          return {
            get(key) {
              const request = {};
              Promise.resolve().then(() => { request.result = values.get(key); request.onsuccess?.(); });
              return request;
            },
            put(value, key) {
              values.set(key, value);
              Promise.resolve().then(() => transaction.oncomplete?.());
            }
          };
        }
      });
    }
  };
  return {
    open() {
      const request = {};
      Promise.resolve().then(() => {
        request.result = database;
        if (!storeReady) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}
test('串流中的思考不呼叫模型；完成後多個顯示位置只翻譯一次，保留原文切換', async () => {
  const calls = [];
  const h = harness(async (...args) => { calls.push(args); return { translation: '先讀取檔案。' }; });
  h.render('Read the file first.', true);
  await h.settle();
  assert.equal(calls.length, 0);
  h.render('Read the file first.');
  h.render('Read the file first.');
  await h.settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [null, 'env-1', 'thread-1', 'Read the file first.']);
  const result = h.render('Read the file first.');
  assert.equal(result.props.children[0], '先讀取檔案。');
  assert.equal(result.props.children[1].props.children[0].props.children, '查看英文原文');
});
test('成功譯文保存至本機資料庫；重載元件後命中快取且不再呼叫模型', async () => {
  const values = new Map();
  const indexedDB = mockIndexedDB(values);
  let firstCalls = 0;
  const first = harness(async () => { firstCalls++; return { translation: '先讀取檔案。' }; }, indexedDB);
  first.render('Read the file first.');
  await first.settle();
  assert.equal(firstCalls, 1);
  assert.equal(values.size, 1);
  let reloadCalls = 0;
  const reloaded = harness(async () => { reloadCalls++; throw Error('不應再次呼叫模型'); }, indexedDB);
  reloaded.render('Read the file first.');
  await reloaded.settle();
  assert.equal(reloadCalls, 0);
  assert.equal(reloaded.render('Read the file first.').props.children[0], '先讀取檔案。');
});
test('本機資料庫開啟時同步拋錯，仍照常翻譯', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { translation: '先讀取檔案。' }; }, { open() { throw Error('storage disabled'); } });
  h.render('Read the file first.');
  await h.settle();
  assert.equal(calls, 1);
  assert.equal(h.render('Read the file first.').props.children[0], '先讀取檔案。');
});
test('不同對話不共用翻譯；純中文不呼叫模型', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { translation: '測試' }; });
  h.render('這是中文思考。');
  h.render('Read file.', false, 'thread-1');
  h.render('Read file.', false, 'thread-2');
  await h.settle();
  assert.equal(calls, 2);
});

test('思考摘要依開頭判定；中文夾英文不送請求，英文開頭仍翻譯', async () => {
  const calls = [];
  const h = harness(async (...args) => { calls.push(args); return { translation: '先檢查 API。' }; });
  for (const text of ['已完成 API 驗證。', '  1. 先確認 Forcepoint，再讀 README。', '「驗證完成」 OK', '123 😀', '確認完成。\n\nRead the file.']) {
    assert.equal(h.render(text, true), text);
    assert.equal(h.render(text), text);
  }
  await h.settle();
  assert.equal(calls.length, 0);
  h.render('  1. Inspect the API，接著處理中文。');
  await h.settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3], '  1. Inspect the API，接著處理中文。');
});
test('供應商用量錯誤保留原文，不自動重試；可手動重試', async () => {
  let calls = 0;
  const values = new Map();
  const h = harness(async () => { calls++; throw Error('用量已達上限'); }, mockIndexedDB(values));
  h.render('Inspect the source.');
  await h.settle();
  const result = h.render('Inspect the source.');
  await h.settle();
  assert.equal(calls, 1);
  assert.equal(values.size, 0);
  assert.equal(result.props.children[0], 'Inspect the source.');
  const retryButton = result.props.children[1].props.children[0].props.children[2];
  assert.equal(retryButton.props.children, '重試翻譯');
  retryButton.props.onClick({ stopPropagation() {} });
  h.render('Inspect the source.');
  await h.settle();
  assert.equal(calls, 2);
});
test('展開的思考正文進入翻譯元件，並以原 Markdown renderer 顯示譯文', () => {
  const patched = patchExpandedReasoningRenderer(`function Pz(){${expandedEntryRenderer}}`);
  assert.ok(patched.includes('e=>e.itemType===`reasoning`?(0,$.jsx)(ZhThinking,'));
  assert.ok(patched.includes('active:s(e),environmentId:r.threadRef?.environmentId,threadId:r.threadRef?.threadId'));
  assert.ok(patched.includes('render:text=>(0,$.jsx)(lr,{className:`text-foreground`,text,'));
  assert.ok(patched.includes('},e.id):(0,$.jsx)(lr,{'));
});
