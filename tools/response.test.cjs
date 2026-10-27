const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');

const source = '# Read the report\n\nUse `npm test` and [manual](https://example.com).\n\n```js\nconsole.log("secret");\n```\n\nOpen src/app.js.';
function fixtureTree(value) {
  function text(fragment, from = 0) {
    const start = value.indexOf(fragment, from);
    if (start < 0) throw Error(`Fixture text not found: ${fragment}`);
    return { type: 'text', position: { start: { offset: start }, end: { offset: start + fragment.length } } };
  }
  const translated = value.includes('閱讀報告');
  return { type: 'root', children: [
    { type: 'heading', depth: 1, children: [text(translated ? '閱讀報告' : 'Read the report')] },
    { type: 'paragraph', children: [
      text(translated ? '使用 ' : 'Use '), { type: 'inlineCode', value: 'npm test' },
      text(translated ? ' 和 ' : ' and '),
      { type: 'link', url: 'https://example.com', title: null, children: [text(translated ? '手冊' : 'manual')] },
      text('.', value.indexOf('https://example.com') + 'https://example.com'.length)
    ] },
    { type: 'code', lang: 'js', meta: null, value: 'console.log("secret");' },
    { type: 'paragraph', children: [text(translated ? '開啟 src/app.js.' : 'Open src/app.js.')] }
  ] };
}
function harness(request, parser = fixtureTree, indexedDB) {
  const effects = [];
  let original = false;
  const context = vm.createContext({
    Promise, Map, Set, Error, JSON, crypto: webcrypto, TextEncoder, indexedDB,
    Jp: { parse: parser }, zhTranslateRequest: request, zhThinkingRegistryContext: {},
    Z: {
      useContext: () => null,
      useState: () => [original, update => { original = typeof update === 'function' ? update(original) : update; }],
      useReducer: () => [0, () => {}],
      useEffect: effect => effects.push(effect)
    },
    $: { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  });
  const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
  vm.runInContext(read('response-markdown.inc.js') + '\n' + read('thinking-client.inc.js') + '\nthis.component = ZhThinking; this.prepare = zhPrepareResponse;', context);
  return {
    render(text, active = false, kind = 'response') {
      const result = context.component({ text, active, kind, threadId: 'thread-1', environmentId: 'env-1', render: t => t });
      while (effects.length) effects.shift()();
      return result;
    },
    prepare: context.prepare,
    async settle() { await vm.runInContext('zhThinkingQueue', context); }
  };
}
function translated(input) {
  return input.replace('Read the report', '閱讀報告').replace('Use ', '使用 ')
    .replace(' and ', ' 和 ').replace('manual', '手冊').replace('Open ', '開啟 ');
}
function mockIndexedDB(values) {
  let ready = false;
  const db = {
    objectStoreNames: { contains: () => ready },
    createObjectStore() { ready = true; },
    transaction() {
      const transaction = {};
      transaction.objectStore = () => ({
        get(key) { const request = {}; Promise.resolve().then(() => { request.result = values.get(key); request.onsuccess?.(); }); return request; },
        put(value, key) { values.set(key, value); Promise.resolve().then(() => transaction.oncomplete?.()); }
      });
      return transaction;
    }
  };
  return { open() { const request = {}; Promise.resolve().then(() => { request.result = db; if (!ready) request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; } };
}

test('回覆完成後才翻譯正文，保護程式碼、連結和路徑，並可切回原文', async () => {
  const calls = [];
  const h = harness(async (...args) => { calls.push(args); return { translation: translated(args[3]) }; });
  h.render(source, true);
  await h.settle();
  assert.equal(calls.length, 0);
  h.render(source);
  h.render(source);
  await h.settle();
  assert.equal(calls.length, 1);
  for (const protectedValue of ['npm test', 'console.log("secret");', 'https://example.com', 'src/app.js']) {
    assert.equal(calls[0][3].includes(protectedValue), false);
  }
  const result = h.render(source);
  assert.equal(result.props.children[0], source.replace('Read the report', '閱讀報告').replace('Use ', '使用 ').replace(' and ', ' 和 ').replace('manual', '手冊').replace('Open ', '開啟 '));
  const toggle = result.props.children[1].props.children[0];
  assert.equal(toggle.props.children, '查看原文');
  toggle.props.onClick({ stopPropagation() {} });
  assert.equal(h.render(source).props.children[0], source);
});

test('譯文破壞受保護格式時保留原文，不快取或自動重試，可手動重試', async () => {
  const values = new Map();
  let calls = 0;
  const h = harness(async (...args) => { calls++; return { translation: translated(args[3]).replace(/⟦T3ZH0X\d+⟧/, '') }; }, fixtureTree, mockIndexedDB(values));
  h.render(source);
  await h.settle();
  const result = h.render(source);
  await h.settle();
  assert.equal(calls, 1);
  assert.equal(values.size, 0);
  assert.equal(result.props.children[0], source);
  const retry = result.props.children[1].props.children[0].props.children[2];
  retry.props.onClick({ stopPropagation() {} });
  h.render(source);
  await h.settle();
  assert.equal(calls, 2);
});

test('成功的正文譯文重新載入時從本機快取取出', async () => {
  const values = new Map(), db = mockIndexedDB(values);
  let calls = 0;
  const first = harness(async (...args) => { calls++; return { translation: translated(args[3]) }; }, fixtureTree, db);
  first.render(source);
  await first.settle();
  const second = harness(async () => { calls++; throw Error('不應再次翻譯'); }, fixtureTree, db);
  second.render(source);
  await second.settle();
  assert.equal(calls, 1);
  assert.equal(second.render(source).props.children[0], first.render(source).props.children[0]);
});

test('只有程式碼的回覆不呼叫翻譯模型', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; }, () => ({ type: 'root', children: [{ type: 'code', value: 'const name = "English";' }] }));
  const code = '```js\nconst name = "English";\n```';
  assert.equal(h.render(code), code);
  await h.settle();
  assert.equal(calls, 0);
});

test('真實模型依中文語序調換同一段內的程式碼時，仍還原正確內容', () => {
  const original = '# Status\n\nRead the [manual](https://example.com/docs), then run `npm test` in `src/app.js`.\n\n```js\nconsole.log("Hello");\n```';
  function parser(value) {
    const isOriginal = value === original;
    const leaf = (fragment, from = 0) => {
      const start = value.indexOf(fragment, from);
      assert.notEqual(start, -1);
      return { type: 'text', position: { start: { offset: start }, end: { offset: start + fragment.length } } };
    };
    const link = { type: 'link', url: 'https://example.com/docs', title: null, children: isOriginal ? [leaf('manual')] : [] };
    const command = { type: 'inlineCode', value: 'npm test' };
    const file = { type: 'inlineCode', value: 'src/app.js' };
    return { type: 'root', children: [
      { type: 'heading', depth: 1, children: isOriginal ? [leaf('Status')] : [] },
      { type: 'paragraph', children: isOriginal ? [leaf('Read the '), link, leaf(', then run '), command, leaf(' in '), file, leaf('.', value.indexOf('`src/app.js`') + '`src/app.js`'.length)] : [link, file, command] },
      { type: 'code', lang: 'js', meta: null, value: 'console.log("Hello");' }
    ] };
  }
  const prepared = harness(async () => {}, parser).prepare(original);
  assert.equal(prepared.input, '⟦T3ZH0X0⟧Status⟦T3ZH0X1⟧Read the ⟦T3ZH0X2⟧manual⟦T3ZH0X3⟧, then run ⟦T3ZH0X4⟧ in ⟦T3ZH0X5⟧.⟦T3ZH0X6⟧');
  const modelReply = '⟦T3ZH0X0⟧狀態⟦T3ZH0X1⟧閱讀⟦T3ZH0X2⟧手冊⟦T3ZH0X3⟧，然後在⟦T3ZH0X5⟧中執行⟦T3ZH0X4⟧。⟦T3ZH0X6⟧';
  assert.equal(prepared.restore(modelReply), '# 狀態\n\n閱讀[手冊](https://example.com/docs)，然後在`src/app.js`中執行`npm test`。\n\n```js\nconsole.log("Hello");\n```');
});

test('程式碼被移到不同區塊時拒絕譯文', () => {
  const original = '# Title\n\nUse `npm test`.';
  function parser(value) {
    const headingHasCode = value.slice(0, value.indexOf('\n\n')).includes('`npm test`');
    const code = { type: 'inlineCode', value: 'npm test' };
    const leaf = (start, end) => ({ type: 'text', position: { start: { offset: start }, end: { offset: end } } });
    return { type: 'root', children: [
      { type: 'heading', depth: 1, children: headingHasCode ? [code] : value === original ? [leaf(2, 7)] : [] },
      { type: 'paragraph', children: headingHasCode ? [] : value === original ? [leaf(9, 13), code, leaf(original.length - 1, original.length)] : [code] }
    ] };
  }
  const prepared = harness(async () => {}, parser).prepare(original);
  assert.equal(prepared.input, '⟦T3ZH0X0⟧Title⟦T3ZH0X1⟧Use ⟦T3ZH0X2⟧.');
  assert.throws(() => prepared.restore('⟦T3ZH0X0⟧標題⟦T3ZH0X2⟧⟦T3ZH0X1⟧使用。'), /未保留回覆格式/);
});
