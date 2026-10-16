// Appended to the pinned Beta chat module (_chat-D4Fgdsqn). zhThinkingRuntime is the app's atom runtime,
// zhEnvironmentAtoms its per-environment atoms. Like the module's own environment requests, the atom waits
// (pending) until the environment's prepared connection exists, then runs the authenticated request.
const zhThinkingAtoms = new Map();
// Fh's own request timeout (180 s) plus 30 s for the environment connection to come up.
const zhThinkingTimeoutMs = 210000;
function zhTranslateRequest(registry, environmentId, threadId, text) {
  const key = JSON.stringify([environmentId, threadId, text]);
  let atom = zhThinkingAtoms.get(key);
  if (atom === undefined) {
    atom = zhThinkingRuntime.atom(get => {
      const connection = zhEnvironmentAtoms.preparedConnectionValueAtom(environmentId);
      // Depend on the connection only while waiting for it: later updates (e.g. reconnects) would
      // otherwise interrupt and restart a request that is already running.
      const prepared = zhOptionToNullable(get.once(connection));
      if (prepared !== null) return zhTranslateEffect(prepared, threadId, text);
      get(connection);
      return zhPending;
    });
    zhThinkingAtoms.set(key, atom);
  }
  return new Promise((resolve, reject) => {
    let unsubscribe = null;
    let finished = false;
    const settle = (done) => {
      finished = true;
      clearTimeout(timer);
      if (unsubscribe !== null) unsubscribe();
      // A later manual retry must build a fresh atom instead of reading this one's cached result.
      zhThinkingAtoms.delete(key);
      done();
    };
    const finish = result => {
      if (finished || result._tag === "Initial" || result.waiting) return;
      if (result._tag === "Success") settle(() => resolve(result.value));
      else settle(() => reject(Error("思考翻譯失敗，請確認環境連線、文字生成模型與可用額度。")));
    };
    const timer = setTimeout(() => {
      if (!finished) settle(() => reject(Error("思考翻譯逾時，環境可能尚未連線；可手動重試。")));
    }, zhThinkingTimeoutMs);
    unsubscribe = registry.subscribe(atom, finish, { immediate: false });
    if (finished) unsubscribe();
    else finish(registry.get(atom));
  });
}
