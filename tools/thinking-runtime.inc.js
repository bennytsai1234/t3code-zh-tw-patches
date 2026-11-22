// Appended to utils-CfAhq9cy: Ov is the session client, xr tests None, Ore is the unavailable error,
// aj and Tj provide authorization, $M performs authenticated requests, Xa wraps an async effect,
// Kn creates a generator effect, rr reads an optional service, and H creates a successful effect.
export const zhOptionToNullable = option => xr(option) ? null : option.value;
export const zhPending = H(undefined);

// Same shape as the module's own environment session-state request: the caller passes the prepared connection.
export function zhTranslateEffect(prepared, threadId, text) {
  return Kn(function* () {
    const session = yield* rr(Ov);
    if (xr(session)) return yield* new Ore();
    const signer = yield* rr(aj);
    const remoteAuthorization = yield* rr(Tj);
    // $M passes the endpoint builder for the base URL of each attempt; a relay may move it when the
    // authorization is renewed. Sign and fetch the same URL, on the origin of the app's own session endpoint.
    let url = null;
    const result = yield* $M({
      prepared, signer, remoteAuthorization, group: "auth", method: "POST", timeoutMs: 18e4,
      url: endpoints => (url = new URL("/api/zh-tw/thinking", endpoints.session()).toString()),
      // A 401 is returned as a marker so $M renews a rejected DPoP authorization and retries once.
      isUnauthorizedResponse: result => result.zhUnauthorized === true,
      request: ({ headers }) => { const target = url; return Xa(async signal => {
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
    }).pipe(fo(Ov, session.value));
    if (result.zhUnauthorized) throw Error(result.error || "翻譯未通過環境驗證。");
    return result;
  });
}
