const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Runs zhTranslateEffect with stand-ins for the runtime module's Effect helpers. The fake Fh plays the
// attempts the real one makes: it asks url() for each attempt's endpoints, then builds that attempt's request.
function harness(attempts, fhResult) {
  const seen = { urls: [], requests: [], options: null };
  const done = value => ({ *[Symbol.iterator]() { return value; } });
  const context = vm.createContext({
    URL, JSON, Error, globalThis: {},
    R: generator => ({ run: () => { const it = generator(); let step = it.next(); while (!step.done) step = it.next(); return step.value; } }),
    vi: tag => done({ _tag: 'Some', value: tag }),
    M: option => option._tag === 'None',
    Gn: 'session', jf: 'signer', Zf: 'remote', Bh: class {},
    D: () => effect => effect,
    Zi: run => ({ run }),
    Fh: options => {
      seen.options = options;
      for (const origin of attempts) {
        seen.urls.push(options.url({ session: () => origin + 'api/auth/session' }));
        seen.requests.push(options.request({ headers: { authorization: 'DPoP token' } }));
      }
      return { pipe: () => done(fhResult) };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'thinking-runtime.inc.js'), 'utf8').replace('export function', 'function') + '\nthis.effect = zhTranslateEffect;', context);
  return { context, seen, run: () => context.effect({ httpAuthorization: { _tag: 'Dpop' }, httpBaseUrl: 'https://old.example/' }, 'thread-1', 'Read the file.').run() };
}
function fetchStub(status, body) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return { status, ok: status >= 200 && status < 300, json: async () => body }; };
  return { fetch, calls };
}

test('授權更新換了連線網址時，該次請求送到新網址；簽章與送出網址相同', async () => {
  const h = harness(['https://old.example/', 'https://new.example/'], { translation: '先讀取檔案。' });
  assert.deepEqual(await h.run(), { translation: '先讀取檔案。' });
  assert.deepEqual(h.seen.urls, ['https://old.example/api/zh-tw/thinking', 'https://new.example/api/zh-tw/thinking']);
  const stub = fetchStub(200, { translation: '先讀取檔案。' });
  h.context.globalThis.fetch = stub.fetch;
  await h.seen.requests[1].run(undefined);
  assert.equal(stub.calls[0].url, 'https://new.example/api/zh-tw/thinking');
  assert.equal(stub.calls[0].init.credentials, 'omit');
  assert.equal(stub.calls[0].init.headers.authorization, 'DPoP token');
});

test('401 交給內建流程判斷為未授權；兩次都被拒時回報驗證錯誤', async () => {
  const h = harness(['https://old.example/'], { zhUnauthorized: true, error: '授權已失效' });
  const stub = fetchStub(401, { error: '授權已失效' });
  h.context.globalThis.fetch = stub.fetch;
  assert.throws(() => h.run(), /授權已失效/);
  const response = await h.seen.requests[0].run(undefined);
  assert.deepEqual({ ...response }, { zhUnauthorized: true, error: '授權已失效' });
  assert.equal(h.seen.options.isUnauthorizedResponse(response), true);
  assert.equal(h.seen.options.isUnauthorizedResponse({ translation: '譯文' }), false);
});

test('非 401 的錯誤回應直接失敗，不當成未授權', async () => {
  const h = harness(['https://old.example/'], { translation: 'x' });
  h.run();
  h.context.globalThis.fetch = fetchStub(502, { error: '思考翻譯失敗，請確認文字生成模型與可用額度；可手動重試。' }).fetch;
  await assert.rejects(() => h.seen.requests[0].run(undefined), /可用額度/);
});
