const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Runs the request helper against a fake atom runtime and registry.
// The real registry (effect-atom) delivers Initial -> waiting -> Success/Failure; the helper must settle only on a final result.
const pending = { _tag: 'Initial', waiting: true };
function harness({ initial = pending } = {}) {
  const atomsMade = [];
  const listeners = new Set();
  const timers = [];
  const registry = {
    subscribe(atom, listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get(atom) { return atom.current; }
  };
  const context = vm.createContext({
    Promise, Map, Set, Error, JSON,
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.cleared = true; },
    zhPending: pending,
    zhOptionToNullable: option => option._tag === 'Some' ? option.value : null,
    zhEnvironmentAtoms: { preparedConnectionValueAtom: environmentId => ({ prepared: environmentId }) },
    zhThinkingRuntime: { atom: read => { const atom = { read, current: initial }; atomsMade.push(atom); return atom; } },
    zhTranslateEffect: (prepared, threadId, text) => ({ prepared, threadId, text })
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'thinking-request.inc.js'), 'utf8') + '\nthis.request = zhTranslateRequest;', context);
  return {
    request: (...args) => context.request(registry, ...args),
    emit(atom, result) { atom.current = result; for (const l of [...listeners]) l(result); },
    fireTimers() { for (const t of timers) if (!t.cleared) t.fn(); },
    atomsMade,
    timers,
    listenerCount: () => listeners.size
  };
}

// Fake atom context: get() records a dependency, get.once() reads without one.
function context(value) {
  const deps = [];
  const get = atom => { deps.push(atom); return value; };
  get.once = () => value;
  return { get, deps };
}
test('環境連線尚未就緒時訂閱並等待；有連線後才建立翻譯請求，且不再依賴連線狀態', () => {
  const h = harness();
  h.request('env-1', 'thread-1', 'Read the file.');
  const read = h.atomsMade[0].read;
  const waiting = context({ _tag: 'None' });
  assert.equal(read(waiting.get), pending);
  assert.equal(waiting.deps.length, 1);
  const ready = context({ _tag: 'Some', value: { httpBaseUrl: 'http://x/' } });
  assert.deepEqual(read(ready.get),
    { prepared: { httpBaseUrl: 'http://x/' }, threadId: 'thread-1', text: 'Read the file.' });
  assert.equal(ready.deps.length, 0);
});

test('等待中的結果不結束請求；成功後回傳譯文、取消訂閱並清除計時', async () => {
  const h = harness();
  const p = h.request('env-1', 'thread-1', 'Read the file.');
  const atom = h.atomsMade[0];
  h.emit(atom, { _tag: 'Initial', waiting: true });
  h.emit(atom, { _tag: 'Success', waiting: true, value: { translation: '舊譯文' } });
  h.emit(atom, { _tag: 'Success', waiting: false, value: { translation: '先讀取檔案。' } });
  assert.deepEqual(await p, { translation: '先讀取檔案。' });
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.timers[0].cleared, true);
});

test('失敗結果回傳繁中錯誤訊息；手動重試時建立新的請求', async () => {
  const h = harness();
  const p = h.request('env-1', 'thread-1', 'Inspect the source.');
  h.emit(h.atomsMade[0], { _tag: 'Failure', waiting: false, cause: {} });
  await assert.rejects(p, /翻譯失敗/);
  assert.equal(h.listenerCount(), 0);
  h.request('env-1', 'thread-1', 'Inspect the source.');
  assert.equal(h.atomsMade.length, 2);
});

test('環境一直沒有連線時逾時結束，不會卡住後續翻譯', async () => {
  const h = harness();
  const p = h.request('env-1', 'thread-1', 'Inspect the source.');
  assert.equal(h.timers[0].ms, 210000);
  h.fireTimers();
  await assert.rejects(p, /逾時/);
  assert.equal(h.listenerCount(), 0);
});

test('進行中的同一區塊共用同一個 atom；不同對話另建', async () => {
  const h = harness();
  h.request('env-1', 'thread-1', 'Same block.');
  h.request('env-1', 'thread-1', 'Same block.');
  h.request('env-1', 'thread-2', 'Same block.');
  assert.equal(h.atomsMade.length, 2);
});

test('atom 已有最終結果時立即回傳', async () => {
  const h = harness({ initial: { _tag: 'Success', waiting: false, value: { translation: '已完成' } } });
  assert.deepEqual(await h.request('env-1', 'thread-1', 'Already done.'), { translation: '已完成' });
  assert.equal(h.listenerCount(), 0);
});
