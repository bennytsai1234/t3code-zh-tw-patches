// Appended to the pinned Beta environment runtime module (utils-hMpAMf30); uses its existing helpers:
// Bd (optional service), JK (DPoP signer), aq (remote authorization), pD (session client), Zn (Option isNone),
// vBe (session client unavailable), CJ (authenticated request), Lu (async effect), Ku (generator effect), Hd (provide service).
// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return Ku(function* () {
    const session = yield* Bd(pD);
    if (Zn(session)) return yield* new vBe();
    const signer = yield* Bd(JK);
    const remoteAuthorization = yield* Bd(aq);
    // CJ passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* CJ({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so CJ renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return Lu(async signal => {
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
    }).pipe(Hd(pD, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "翻譯未通過環境驗證。");
    return result;
  });
}
