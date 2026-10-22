# T3 Code 繁中補丁 — Agent 指南

對官方 T3 Code 安裝檔的兩份程式包（`app.asar`、`server.asar`）套用繁體中文、外觀修正與自動思考翻譯。補丁只支援一個官方版本，版本與上游 commit 寫在 `README.md` 開頭；安裝、使用者看得到的行為都以 README 為準，實測紀錄寫在 `VERIFICATION.md`。

## 指令

- `npm ci --prefix tools` 後，`node tools/build.cjs builds/<版本>/orig builds/<版本>/zh-release` 是完整建置；`npm test --prefix tools` 跑單元測試。
- `builds/`、`work/` 不進 Git：官方程式包、下載的安裝檔、解開的資源都放這兩處。

## 移植到新版

上游每次發版都會重新壓縮前端，模組檔名與壓縮後的變數名稱整批改變，所以補丁會在建置時停住並指出找不到的位置。照下面做，每一步做到建置不再報錯：

1. 從 GitHub 發行頁（`gh release download vX -R pingdotgg/t3code -p 'T3-Code-X-x64.exe'`）下載安裝檔，核對 `latest.yml` 的 SHA512，用 7-Zip 解出 `$PLUGINSDIR/app-64.7z` 裡的 `resources`。兩份 `.asar` 的 SHA256、版本、上游 commit 更新到 `tools/build.cjs`；版本也改 `tools/checkVersion.cjs`、`tools/install.ps1`、`tools/prepareAppearance.cjs`。
2. 版本鎖定的接點都在 `tools/patchThinking.cjs`、`tools/patchThinkingRender.cjs`、`tools/patchLabels.cjs`，附加程式 `tools/thinking-*.inc.js` 開頭的註解列出它借用的模組內名稱。把新舊版 `client/assets` 都解出來，用不會被壓縮的文字找對應：錯誤訊息、`isUnauthorizedResponse`、`preparedConnectionValueAtom`、Tailwind class、`Thinking`/`Thought` 這類字串。新名稱以「新版同一位置的用法」為準，再確認它在附加模組裡是最上層宣告（import 或頂層變數）：V8 語法檢查抓不到借錯的名稱，只有執行時才壞。測試裡的替身名稱（`thinking*.test.cjs`）一併改。
3. 補翻：比對新舊版前端字串，列出新版新增、翻譯表沒有的顯示文字，翻好放進 `translations/client/` 新的編號檔。用詞沿用既有翻譯（thread＝對話、machine＝電腦、worktree＝工作樹、tunnel＝通道、compact＝壓縮）。傳給 AI 代理的工具說明與錯誤（多在 `utils-*.js` 的 schema `description`）保留英文。被拆成片段的句子要看上下文，確認拼起來通順；英文複數用的 `s` 片段無法翻，整句寧可保留英文。桌面外殼 `translations/desktop-main.json` 的 `count` 是出現次數，新版多出同樣標籤時改次數。
4. 驗證：建置通過後，用獨立資料夾開測試伺服器（README 歷史紀錄的「驗證方式」）：`ELECTRON_RUN_AS_NODE=1`、`T3CODE_HOME=<空資料夾>`、`T3CODE_PORT=3899`、`T3CODE_NO_BROWSER=1`，用解出的官方執行檔跑 `zh-release/server.asar/apps/server/dist/bin.mjs`，再以記錄印出的 pairing URL 用瀏覽器檢查。思考區塊不一定出現在畫面上，前端請求程式可以在頁面內動態 import 出貨的模組、從 React 樹取得 atom registry 直接呼叫來實測。要送訊息給模型時選最便宜的模型，能重新整理既有對話檢查的就不送新訊息。

## 安裝與使用者的程式

使用者平常就開著 T3 Code，正式安裝（`tools/install.ps1`）前先通知並等使用者關閉程式；測試只用上面的獨立測試伺服器。升級時使用者要先裝好同版本的官方安裝檔，`install.ps1` 會檢查已安裝版本。
