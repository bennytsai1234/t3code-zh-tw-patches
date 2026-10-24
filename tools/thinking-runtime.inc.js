// Appended to the pinned Beta environment runtime module (runtime-C4A8mG50); uses its existing helpers:
// Hr (optional service), lp (DPoP signer), kp (remote authorization), ur (session client), wo (Option isNone),
// Tg (session client unavailable), cg (authenticated request), y (async effect), P (generator effect), E (provide service).
// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return P(function* () {
    const session = yield* Hr(ur);
    if (wo(session)) return yield* new Tg();
    const signer = yield* Hr(lp);
    const remoteAuthorization = yield* Hr(kp);
    // cg passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* cg({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so cg renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return y(async signal => {
        const response = await globalThis.fetch(target, {
          method: "POST", headers: { ...headers, "content-type": "application/json" },
          credentials: prepared.httpAuthorization === null ? "include" : "omit",
          body: JSON.stringify({ threadId, text }), signal
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) return { zhUnauthorized: true, error: result.error };
        if (!response.ok) throw Error(result.error || "思考翻譯失敗。");
        return result;
      }); }
    }).pipe(E(ur, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "思考翻譯未通過環境驗證。");
    return result;
  });
}
