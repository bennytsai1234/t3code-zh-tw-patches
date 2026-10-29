// This component runs inside the timeline module, using its existing React aliases.
const zhThinkingResults = new Map();
let zhThinkingQueue = Promise.resolve();
const zhThinkingDatabase = (() => {
  try {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      // open() can throw synchronously (e.g. storage disabled); an executor throw would reject this
      // shared promise forever and block every translation, so fall back to no cache instead.
      let request;
      try {
        request = globalThis.indexedDB.open("t3-zh-tw-thinking-cache", 1);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains("translations")) request.result.createObjectStore("translations");
        } catch {}
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  } catch {
    return Promise.resolve(null);
  }
})();
async function zhThinkingPersistentKey(key) {
  try {
    const bytes = new TextEncoder().encode(key);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return "v1:" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
function zhThinkingRead(db, key) {
  return new Promise(resolve => {
    try {
      const request = db.transaction("translations", "readonly").objectStore("translations").get(key);
      request.onsuccess = () => resolve(typeof request.result === "string" && request.result.trim() ? request.result : null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function zhThinkingWrite(db, key, translation) {
  return new Promise(resolve => {
    try {
      const transaction = db.transaction("translations", "readwrite");
      transaction.objectStore("translations").put(translation, key);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    } catch {
      resolve();
    }
  });
}
function ZhThinking({ text, active = false, environmentId, threadId, render, kind = "thinking" }) {
  const registry = (0,Z.useContext)(zhThinkingRegistryContext);
  const [original, setOriginal] = (0,Z.useState)(false);
  const [, refresh] = (0,Z.useReducer)(n => n + 1, 0);
  const [attempt, retry] = (0,Z.useReducer)(n => n + 1, 0);
  let prepared = null, preparationError = null;
  if (!active) {
    try { prepared = zhPrepareResponse(text ?? ""); }
    catch (error) { preparationError = error.message || "無法辨識回覆的 Markdown 格式。"; }
  }
  const key = JSON.stringify([kind === "response" ? "zh-tw-response-v1" : "zh-tw-thinking-v1", environmentId, threadId, text]);
  const needsTranslation = !!prepared?.needsTranslation;
  const entry = zhThinkingResults.get(key);
  (0,Z.useEffect)(() => {
    if (active || !needsTranslation || !threadId || !environmentId || preparationError) return;
    let current = zhThinkingResults.get(key);
    if (!current) {
      current = { status: "pending", listeners: new Set() };
      zhThinkingResults.set(key, current);
      // One completed block per request; serialize to avoid competing with resume bursts.
      zhThinkingQueue = zhThinkingQueue.catch(() => {}).then(async () => {
        try {
          const db = await zhThinkingDatabase;
          const storageKey = db ? await zhThinkingPersistentKey(key) : null;
          const cached = storageKey ? await zhThinkingRead(db, storageKey) : null;
          if (cached) current.translation = cached;
          else {
            const result = await zhTranslateRequest(registry, environmentId, threadId, kind === "response" ? prepared.input : text);
            if (typeof result.translation !== "string" || !result.translation.trim()) throw Error("翻譯結果為空白。");
            current.translation = kind === "response" ? prepared.restore(result.translation) : result.translation;
            if (storageKey) await zhThinkingWrite(db, storageKey, current.translation);
          }
          current.status = "done";
        } catch (error) {
          current.error = error.message || "翻譯失敗。";
          current.status = "error";
        }
        for (const listener of current.listeners) listener();
      });
    }
    current.listeners.add(refresh);
    refresh();
    return () => current.listeners.delete(refresh);
  }, [key, active, needsTranslation, threadId, environmentId, attempt]);
  if (preparationError) return (0,$.jsxs)("div", { children: [render(text), (0,$.jsx)("span", {
    className: "mt-2 text-xs text-muted-foreground", children: preparationError
  })] });
  if (!needsTranslation) return render(text);
  const controls = [];
  if (entry?.status === "done") controls.push((0,$.jsx)("button", {
    type: "button", className: "text-xs underline", onClick: e => { e.stopPropagation(); setOriginal(v => !v); },
    children: original ? "查看繁體翻譯" : kind === "response" ? "查看原文" : "查看英文原文"
  }, "toggle"));
  else if (entry?.status === "error") controls.push((0,$.jsxs)("span", { children: [entry.error, " ", (0,$.jsx)("button", {
    type: "button", className: "text-xs underline", onClick: e => { e.stopPropagation(); zhThinkingResults.delete(key); retry(); }, children: "重試翻譯"
  })] }, "error"));
  else controls.push((0,$.jsx)("span", { children: active ? (kind === "response" ? "回覆完成後自動翻譯" : "區塊完成後自動翻譯") : (kind === "response" ? "正在翻譯回覆…" : "正在翻譯思考內容…") }, "pending"));
  return (0,$.jsxs)(kind === "response" ? "div" : "span", { className: kind === "response" ? "min-w-0" : "whitespace-normal", children: [
    render(!original && entry?.status === "done" ? entry.translation : text),
    (0,$.jsx)("span", { className: kind === "response" ? "mt-2 inline-flex gap-2 text-xs text-muted-foreground" : "ml-2 inline-flex gap-2 text-xs text-muted-foreground", children: controls })
  ] });
}
