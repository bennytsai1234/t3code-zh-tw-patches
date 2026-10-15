// This component runs inside the chat module, using its existing React aliases.
const zhThinkingResults = new Map();
let zhThinkingQueue = Promise.resolve();
function ZhThinking({ text, active = false, environmentId, threadId, render }) {
  const registry = (0,Z.useContext)(Qn);
  const [original, setOriginal] = (0,Z.useState)(false);
  const [, refresh] = (0,Z.useReducer)(n => n + 1, 0);
  const [attempt, retry] = (0,Z.useReducer)(n => n + 1, 0);
  const key = JSON.stringify([environmentId, threadId, text]);
  const needsTranslation = /[A-Za-z]{2}/.test(text ?? "");
  const entry = zhThinkingResults.get(key);
  (0,Z.useEffect)(() => {
    if (active || !needsTranslation || !threadId || !environmentId) return;
    let current = zhThinkingResults.get(key);
    if (!current) {
      current = { status: "pending", listeners: new Set() };
      zhThinkingResults.set(key, current);
      // One completed block per request; serialize to avoid competing with resume bursts.
      zhThinkingQueue = zhThinkingQueue.catch(() => {}).then(async () => {
        try {
          const result = await zhTranslateRequest(registry, environmentId, threadId, text);
          if (typeof result.translation !== "string" || !result.translation.trim()) throw Error("翻譯結果為空白。");
          current.translation = result.translation;
          current.status = "done";
        } catch (error) {
          current.error = error.message || "思考翻譯失敗。";
          current.status = "error";
        }
        for (const listener of current.listeners) listener();
      });
    }
    current.listeners.add(refresh);
    refresh();
    return () => current.listeners.delete(refresh);
  }, [key, active, needsTranslation, threadId, environmentId, attempt]);
  if (!needsTranslation) return render(text);
  const controls = [];
  if (entry?.status === "done") controls.push((0,$.jsx)("button", {
    type: "button", className: "text-xs underline", onClick: e => { e.stopPropagation(); setOriginal(v => !v); },
    children: original ? "查看繁體翻譯" : "查看英文原文"
  }, "toggle"));
  else if (entry?.status === "error") controls.push((0,$.jsxs)("span", { children: [entry.error, " ", (0,$.jsx)("button", {
    type: "button", className: "text-xs underline", onClick: e => { e.stopPropagation(); zhThinkingResults.delete(key); retry(); }, children: "重試翻譯"
  })] }, "error"));
  else controls.push((0,$.jsx)("span", { children: active ? "區塊完成後自動翻譯" : "正在翻譯思考內容…" }, "pending"));
  return (0,$.jsxs)("span", { className: "whitespace-normal", children: [
    render(!original && entry?.status === "done" ? entry.translation : text),
    (0,$.jsx)("span", { className: "ml-2 inline-flex gap-2 text-xs text-muted-foreground", children: controls })
  ] });
}
