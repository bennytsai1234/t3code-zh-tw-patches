# T3 Code 繁中補丁 — Agent 指南

對官方 T3 Code 的兩份程式包（`app.asar`、`server.asar`）套用外觀修正、思考與回覆翻譯及繁體中文。補丁只支援一個官方版本，寫在 `README.md` 開頭；安裝方式與使用者看得到的行為以 README 為準。

## 建置流程

`node tools/build.cjs <orig> <輸出>` 依序執行，每步都做 V8 語法檢查，找不到接點就停住並指出位置：

1. `prepareAppearance.cjs`：外觀修正，依 `appearance-fix/changes-0.0.45.json` 的原文改寫。`server.asar` 前端的等寬字型判斷改成快取加簡化量測（原本每個字型量 32 次，字型多時外觀頁卡死）；`app.asar` 的 `main.cjs` 加上全域 `unhandledRejection`、視窗外觀呼叫與系統主題事件的防護。用正規表示式找函式，名稱每版不同也能套。
2. `patchThinking.cjs`：後端翻譯路由（`thinking-server.inc.js`）與文字產生 runner；前端附加環境請求（`thinking-runtime.inc.js`）、等待連線與請求（`thinking-request.inc.js`）、正文 Markdown 保護（`response-markdown.inc.js`）、顯示元件與本機快取（`thinking-client.inc.js`），再換掉四個思考顯示接點（第四個在 `patchThinkingRender.cjs`）與 AI 回覆正文接點。
3. `apply.js`：介面翻譯，規則見下方「翻譯規則」。
4. `patchLabels.cjs`：模型選項等標籤只在 React 最後顯示時翻譯，不改選項值。
5. `applyDesktop.js`：桌面外殼逐字取代，`count` 是該字串應出現的次數。

`asarRewrite.js` 重新打包時保留原檔頭結構（哪些檔案在 `.unpacked`），重算 offset 與 integrity。

## 移植到新版

上游每次發版都會重新壓縮前端，模組檔名與壓縮後的變數名稱整批改變。暫存檔放 `work/<版本>/`（不進 Git）。每一步做到條件成立再往下：

1. **取得官方程式包**：`gh release download v<版本> -R pingdotgg/t3code -p 'T3-Code-<版本>-x64.exe' -p latest.yml`，核對安裝檔 SHA512 與 `latest.yml` 相同；用 7-Zip 解出 `$PLUGINSDIR/app-64.7z`，再解出其中的 `resources`，把兩份 `.asar` 與 `.unpacked` 複製到 `builds/<版本>/orig`。
2. **更新版本鎖定**：`tools/build.cjs` 的版本、兩份 `.asar` 的 SHA256、上游 commit；版本也改 `tools/checkVersion.cjs`、`tools/install.ps1`、`tools/prepareAppearance.cjs`。
3. **解出新舊前端**：`node tools/extractClient.cjs <舊版 server.asar> work/<版本>/old`、`node tools/extractClient.cjs builds/<版本>/orig/server.asar work/<版本>/new`。舊版程式包從目前安裝或上一版的 `orig` 取得。
4. **對應新名稱**，做到建置不再停住：版本鎖定的接點在 `patchThinking.cjs`、`patchThinkingRender.cjs`、`patchLabels.cjs`，附加程式開頭的註解列出它借用的模組內名稱。在新舊版用不會被壓縮的文字找同一段程式：錯誤訊息、`isUnauthorizedResponse`、`preparedConnectionValueAtom`、`fetchEnvironmentSessionState`、Tailwind class、`` `Thinking`:`Thought` ``、`message.streaming`；確認正文接點只接 AI 回覆，並對應同一模組的 Markdown 解析器。`node tools/inspect.cjs <檔案> <文字> [前後字數] [筆數]` 印出前後文。新名稱以新版同一位置的用法為準，再用 acorn 確認它是附加模組的最上層宣告（import 或頂層變數）：V8 語法檢查抓不到借錯的名稱，只有執行時才壞。相關測試的替身名稱一併改，`npm test --prefix tools` 要全過。
5. **補翻**：`node tools/newStrings.cjs work/<版本>/old work/<版本>/new work/<版本>/new.json` 列出新版新增、翻譯表沒有、而且會被翻譯的字串，每條附原始碼片段。翻好放進 `translations/client/` 新的編號檔，照下方「翻譯規則」。檔名是 8 碼大寫英數（如 `77XECAW3`）與 `lazy` 的模組是圖表繪製器 pele，列出的是 SVG 樣板與語法錯誤，不翻。重跑建置，`apply.js` 的 `used` 應增加新增的條數。桌面外殼出現 `expected N got M` 時，看新版是否多了同樣的標籤，再改 `count`。
6. **實測**：用獨立資料夾開測試伺服器，不碰使用者正在用的 T3 Code：環境變數 `ELECTRON_RUN_AS_NODE=1`、`T3CODE_HOME=<空資料夾>`、`T3CODE_PORT=3899`、`T3CODE_NO_BROWSER=1`，用解出的官方執行檔跑 `<zh-release>/server.asar/apps/server/dist/bin.mjs`，以記錄印出的 pairing URL 開瀏覽器。確認介面為繁體中文、翻譯路由未登入回 401。實測只用最便宜的模型：對話選 Claude Haiku 5.5，因為只有 Claude 會輸出畫面上看得到的思考摘要；文字產生模型用 GPT-6-Luna、思考程度 low（新環境的預設值）。執行模式改成「需確認」，提示裡要求不動檔案。確認思考與回覆正文都能顯示譯文、切換原文；正文中的程式碼、路徑與連結保持可用。重新整理後展開工作記錄及回覆直接顯示譯文，不再送翻譯請求，才算通過。
7. **收尾**：README 開頭改成新版本，「目前版本未實測」只留這次沒測到的項目；commit message 寫下做過的實測、名稱對應與沒測到的部分。

## 翻譯規則

- `translate.js` 只替換顯示位置的字串：`children`、`label`、`title`、`aria-label`、`description`、`placeholder` 等屬性值、`/settings/` 路徑對應的頁面標題、`confirm()` 與 `join()` 組成的對話框文字一律翻；變數、`return`、指派、樣板字串插值裡的字串，只在整個程式包從沒被拿來比較（`===`、`case`、物件鍵）時才翻。
- 樣板字串以 `{0}`、`{1}` 表示插入值，譯文可以調整順序、省略英文單複數用的插入值，不能新增。例如 `` `Read ${n} ${n===1?`file`:`files`}` `` 譯成 `已讀取 {0} 個檔案`。
- 被拆成片段的句子要看 `newStrings.cjs` 給的片段，確認拼起來通順，並確認該片段在整個程式包只用在那裡。只有英文複數 `s` 的片段無法單獨翻，整句保留英文；外層樣板不在顯示位置時（例如 `error` 屬性），內層片段也不要翻，以免中英混排。
- 保留英文：程式拿來比對的標籤（`Commit`、`Push`、`Default`、`Custom`、按鍵名稱等）、傳給 AI 代理的文字（`utils-*.js` 裡工具 schema 的說明與工具錯誤、`html_preview` 說明、計畫與附件標記）、品牌與模型名稱、logo 旁的 `Code`、伺服器傳來的資料（對話預設標題、模型選項值）。
- 用詞沿用既有翻譯：thread＝對話、machine＝電腦、worktree＝工作樹、tunnel＝通道、compact＝壓縮、snooze＝延後、subagent＝子代理；上下文用量的 token 譯「權杖」。

## 安裝到使用者的程式

使用者平常開著 T3 Code，正式安裝前先通知並等使用者關閉程式。升級時使用者要先執行同版本的官方安裝檔，`install.ps1` 會檢查已安裝版本。
