const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function harness(request) {
  const effects = [];
  const context = vm.createContext({
    Promise, Map, Set, Error, JSON,
    zhTranslateRequest: request,
    Qn: {},
    Z: { useContext: () => null, useState: initial => [initial, () => {}], useReducer: () => [0, () => {}], useEffect: effect => effects.push(effect) },
    $: { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'thinking-client.inc.js'), 'utf8') + '\nthis.component = ZhThinking;', context);
  return {
    render(text, active = false, threadId = 'thread-1') {
      const result = context.component({ text, active, threadId, environmentId: 'env-1', render: t => t });
      while (effects.length) effects.shift()();
      return result;
    },
    async settle() { await vm.runInContext('zhThinkingQueue', context); }
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
test('不同對話不共用翻譯；純中文不呼叫模型', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { translation: '測試' }; });
  h.render('這是中文思考。');
  h.render('Read file.', false, 'thread-1');
  h.render('Read file.', false, 'thread-2');
  await h.settle();
  assert.equal(calls, 2);
});
test('供應商用量錯誤保留原文，不自動重試；可手動重試', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw Error('用量已達上限'); });
  h.render('Inspect the source.');
  await h.settle();
  const result = h.render('Inspect the source.');
  await h.settle();
  assert.equal(calls, 1);
  assert.equal(result.props.children[0], 'Inspect the source.');
  const retryButton = result.props.children[1].props.children[0].props.children[2];
  assert.equal(retryButton.props.children, '重試翻譯');
  retryButton.props.onClick({ stopPropagation() {} });
  h.render('Inspect the source.');
  await h.settle();
  assert.equal(calls, 2);
});
test('前端執行服務解開 Effect Exit 後才將譯文交給元件', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'patchThinking.cjs'), 'utf8');
  const execute = source.match(/export async function zhExecuteTranslation[\s\S]*?\n}/)[0].replace('export ', '');
  const context = vm.createContext({
    Error,
    rt: received => effect => Promise.resolve({ _tag: 'Success', value: { translation: effect.text } }),
    zhTranslateEffect: (environmentId, threadId, text) => ({ text })
  });
  vm.runInContext(execute + '\nthis.execute = zhExecuteTranslation;', context);
  assert.equal((await context.execute({}, 'env-1', 'thread-1', '中文譯文')).translation, '中文譯文');
  context.rt = () => () => Promise.resolve({ _tag: 'Failure', cause: {} });
  await assert.rejects(() => context.execute({}, 'env-1', 'thread-1', 'text'), /思考翻譯失敗/);
});
