// Appended to utils-yaDPh6e6: jd gets optional services, DK and RK provide authorization,
// FE is the session client, Jn tests None, cBe is the unavailable error, oJ performs authenticated requests,
// Ane runs an async effect, Fu creates a generator effect, and Nd supplies a service.
// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return Fu(function* () {
    const session = yield* jd(FE);
    if (Jn(session)) return yield* new cBe();
    const signer = yield* jd(DK);
    const remoteAuthorization = yield* jd(RK);
    // dJ passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* oJ({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so dJ renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return Ane(async signal => {
        const response = await globalThis.fetch(target, {
          method: "POST", headers: { ...headers, "content-type": "application/json" },
          credentials: prepared.httpAuthorization === null ? "include" : "omit",
          body: JSON.stringify({ threadId, text }), signal
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) return { zhUnauthorized: true, error: result.error };
        if (!response.ok) throw Error(result.error || "翻譯失敗。");
        return result;
      }); }
    }).pipe(Nd(FE, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "翻譯未通過環境驗證。");
    return result;
  });
}
