// Appended to utils-Bng1kvMW: jv is the session client, se tests None, $re is the unavailable error,
// cj and Oj provide authorization, qM performs authenticated requests, et wraps an async effect,
// os creates a generator effect, _u reads an optional service, K creates a successful effect,
// and he provides a service.
export const zhOptionToNullable = option => se(option) ? null : option.value;
export const zhPending = K(undefined);

// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return os(function* () {
    const session = yield* _u(jv);
    if (se(session)) return yield* new $re();
    const signer = yield* _u(cj);
    const remoteAuthorization = yield* _u(Oj);
    // qM passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* qM({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so qM renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return et(async signal => {
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
    }).pipe(he(jv, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "翻譯未通過環境驗證。");
    return result;
  });
}
