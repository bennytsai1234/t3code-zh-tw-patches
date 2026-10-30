// Appended to utils-Z26bPbM5: Ad gets optional services, NK and WK provide authorization,
// pD is the session client, Qn tests None, fze is the unavailable error, dJ performs authenticated requests,
// Au runs an async effect, Ru creates a generator effect, and Md supplies a service.
// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return Ru(function* () {
    const session = yield* Ad(pD);
    if (Qn(session)) return yield* new fze();
    const signer = yield* Ad(NK);
    const remoteAuthorization = yield* Ad(WK);
    // dJ passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* dJ({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so dJ renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return Au(async signal => {
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
    }).pipe(Md(pD, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "翻譯未通過環境驗證。");
    return result;
  });
}
