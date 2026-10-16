// Inserted in the pinned Beta server bundle; uses its existing Effect services.
const layerZhThinkingTranslation = add$1("POST", "/api/zh-tw/thinking", gen$1(function* () {
  yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
  const request = yield* HttpServerRequest;
  const body = yield* request.json;
  if (!body || typeof body.threadId !== "string" || typeof body.text !== "string" || !body.text.trim()) {
    return jsonUnsafe({ error: "翻譯請求格式不正確。" }, { status: 400 });
  }
  const threads = yield* ThreadManagementService;
  const projection = yield* threads.getThreadRecords(body.threadId, []);
  const project = yield* (yield* ProjectStoreV2).get(projection.thread.projectId);
  if (isNone(project)) return jsonUnsafe({ error: "找不到所屬專案。" }, { status: 404 });
  const settings = resolveProjectSettings(yield* (yield* ServerSettingsService).getSettings, projection.thread.projectId).settings;
  const registry = yield* ProviderInstanceRegistry;
  const instance = yield* registry.getInstance(settings.textGenerationModelSelection.instanceId);
  if (!instance?.textGeneration?.translateThinking) {
    return jsonUnsafe({ error: "目前文字生成供應商不支援思考翻譯。" }, { status: 422 });
  }
  const result = yield* instance.textGeneration.translateThinking({
    cwd: projection.thread.worktreePath ?? project.value.workspaceRoot,
    modelSelection: settings.textGenerationModelSelection,
    text: body.text
  });
  return jsonUnsafe(result, { headers: { "cache-control": "no-store" } });
}).pipe(catchTags({
  EnvironmentAuthInvalidError: toResponse,
  EnvironmentInternalError: toResponse,
  EnvironmentScopeRequiredError: toResponse
}), catch_(() => succeed$1(jsonUnsafe({ error: "思考翻譯失敗，請確認文字生成模型與可用額度；可手動重試。" }, { status: 502 })))));
