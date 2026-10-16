// Appended to the pinned Beta environment runtime module (runtime-D0ddCMLS); uses its existing helpers:
// vi (optional service), jf (DPoP signer), Zf (remote authorization), Gn (session client), M (Option isNone),
// Bh (session client unavailable), Fh (authenticated request), Zi (async effect), R (generator effect), D (provide service).
// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return R(function* () {
    const session = yield* vi(Gn);
    if (M(session)) return yield* new Bh();
    const signer = yield* vi(jf);
    const remoteAuthorization = yield* vi(Zf);
    // Fh passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* Fh({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so Fh renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return Zi(async signal => {
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
    }).pipe(D(Gn, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "思考翻譯未通過環境驗證。");
    return result;
  });
}
