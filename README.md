# T3 Code 繁體中文與自動思考翻譯補丁

適用 Windows **T3 Code (Beta) 0.1.1**，官方 commit **fe27e8e3dc12**。此工具修改現有程式包，不升級 T3 Code，不匯入舊對話，不變更供應商、快捷鍵與外觀設定。不同版本會停止建置，需先重新移植補丁。

## 目前安裝方式

先安裝 Node.js 22.12 以上與上述版本的官方 T3 Code (Beta)。官方程式包與安裝程式不包含在此倉庫。以下在 PowerShell、倉庫根目錄執行：

```powershell
npm ci --prefix tools
# 第一次套用前，從尚未修改的官方安裝保存原始程式包。
$resources = "$env:LOCALAPPDATA\Programs\t3code\resources"
New-Item -ItemType Directory -Path builds\0.1.1\orig -Force
Copy-Item "$resources\app.asar", "$resources\server.asar" builds\0.1.1\orig
node tools/build.cjs builds/0.1.1/orig builds/0.1.1/zh-release
```

建置會驗證兩份官方原始程式包的 SHA256，依序套用外觀修正、思考翻譯、固定介面翻譯及顯示標籤，並檢查所有修改後 JavaScript 的 V8 語法。請保留 `orig`，以後一律從它重建；不要將已修改的程式包當作原始輸入。

儲存工作、完全關閉 T3 Code (Beta) 後，再執行：

```powershell
.\tools\install.ps1 -Src .\builds\0.1.1\zh-release
# 安裝位置不同時，加上 -InstallDir 'D:\Apps\t3code'
```

安裝後用官方的 `T3 Code (Beta)` 捷徑開啟，資料使用預設的 `%USERPROFILE%\.t3\userdata`。

官方自動更新會用原版程式包覆蓋補丁，因此用 T3 Code 內建的環境變數固定版本：

```powershell
setx T3CODE_DISABLE_AUTO_UPDATE true
```

設定後新開的 T3 Code 不會自動檢查或下載更新，設定頁會顯示自動更新已停用。要升級時執行 `setx T3CODE_DISABLE_AUTO_UPDATE false`，重開 T3 Code 後再更新，並先移植補丁到新版。

安裝工具不會停止任何程序。它會檢查版本與輸出雜湊，將兩份原程式包備份至 `%LOCALAPPDATA%\t3code-zh-tw-patches\backups\<時間>` 後才覆寫；若複製失敗，會嘗試從這份備份還原。安裝只更新兩份 `.asar`，同版本的 `.asar.unpacked` 與其他安裝資源保留。

還原時先關閉 Beta，再將安裝時顯示的備份路徑傳給同一工具：

```powershell
.\tools\install.ps1 -Src "$env:LOCALAPPDATA\t3code-zh-tw-patches\backups\<時間>"
```

在其他電腦使用時，安裝相同官方版本、複製本倉庫，照以上流程執行即可。登入及供應商設定由該電腦的 T3 Code 管理，不需從原電腦複製個人資料。

## 思考翻譯行為

- 使用所屬專案有效設定中的「文字生成模型」，沿用 T3 Code 現有供應商登入及模型選項。未另外設定專案覆寫時，使用環境的文字生成模型。
- 只翻譯供應商已提供給介面顯示的思考內容，不要求或取得隱藏推理。區塊完成後才送出，串流期間保留原文；固定介面文案不呼叫模型。
- 預設顯示繁體譯文，可切換「查看英文原文／查看繁體翻譯」。一般活動列、展開思考、展開後工作記錄中的思考正文及來源對話引用共用相同翻譯結果；工作記錄裡的工具輸出不翻譯。
- 以環境、對話與完整原文去除重複請求，依序翻譯完成的區塊。成功譯文保存在 T3 Code 的本機 IndexedDB，重開程式後同一段讀取快取，不再呼叫模型；翻譯失敗不快取。索引是環境、對話與原文組合的 SHA-256，資料庫只存譯文；譯文不寫回對話紀錄，也不跨裝置同步。清除 T3 Code 本機資料時快取一併清除。
- 環境連線尚未就緒時先等待，連上後才送出。從開始處理這個區塊的請求起算（不含排在前面的區塊），等待連線與翻譯合計超過 210 秒（請求本身 180 秒逾時，另留 30 秒給連線）就顯示失敗並可手動重試，不卡住後續區塊。
- 與所選供應商共用額度，Auto-resume limited threads 不會增加翻譯額度。翻譯失敗保留原文並提供手動重試，不自動重試。
- 後端新增 `/api/zh-tw/thinking`，使用原有環境驗證及對話操作權限；前端透過 T3 Code 內建的環境認證請求送出，沿用目前連線的 Bearer／DPoP 授權，DPoP 被拒時會自動更新授權再試一次。遠端環境也需要套用同版本後端補丁。
- 支援原版 `fromRunner` 供應商及其 Codex、OpenCode 包裝，另接上 Muse 的文字生成 runner。不支援文字生成的供應商會顯示錯誤並保留原文。

## 補丁內容與檢查

`translations/client/` 保存固定介面翻譯；`translations/display-labels.json` 保存模型選項與操作標籤的顯示對照，僅在 React 最後顯示時處理，不改 ID、option value、狀態與指令。品牌、模型名稱、程式碼、路徑及傳給代理的工具協定文字保留原文。

`tools/patchThinking.cjs` 是版本限定的串接補丁，`tools/patchThinkingRender.cjs` 是展開工作記錄的接點；`thinking-server.inc.js`（後端路由）、`thinking-runtime.inc.js`（環境認證請求）、`thinking-request.inc.js`（等待連線與請求）、`thinking-client.inc.js`（顯示元件與本機快取）是可閱讀的新增原始碼。`tools/build.cjs` 是完整重建入口；`tools/install.ps1` 支援 Beta 安裝與還原。`appearance-fix/` 保存原有外觀修正來源。

```powershell
npm test --prefix tools
```

測試涵蓋串流期間零請求、同區塊共用請求、跨重新載入讀取本機快取、不同對話隔離、純中文略過、翻譯失敗保留原文與手動重試、展開正文接點、本機資料庫無法開啟時照常翻譯、等待環境連線、逾時與重試時重建請求，以及授權更新換了連線網址時送到新網址、401 交給內建授權更新流程。實測證據與未測範圍見 [VERIFICATION.md](VERIFICATION.md)。執行中桌面程式的安裝／重啟需另行完成。各供應商的登入、額度與遠端環境仍以實際使用的供應商為準。

公開倉庫只收錄補丁原始碼、翻譯表、相依套件鎖定檔及說明。`builds`、`node_modules`、安裝程式、程式包、備份、記錄、個人啟動腳本、資料庫與登入資料均不納入 Git。

---

# 歷史修改紀錄（舊版指令僅供追溯，安裝請使用上方流程）

T3 Code 沒有多語系功能，介面文字直接寫在程式包裡。這個資料夾保存了對安裝檔所做的兩組修改，T3 Code 更新（程式包被覆蓋）後，可以照這裡的內容重新套用。

- 安裝位置：`%LOCALAPPDATA%\Programs\t3code\resources\`
- 製作時的版本：0.0.45（commit `6c8fed35dded`）
- 原始未修改的程式包：同一個資料夾裡的 `app.asar.bak`、`server.asar.bak`

| 路徑 | 內容 |
|---|---|
| `appearance-fix/` | 外觀頁卡死修正的修改前後原文 |
| `translations/client/` | 網頁介面的對照表（只放對照表，`apply.js` 會讀整個資料夾） |
| `translations/desktop-main.json` | 桌面外殼的逐字取代清單 |
| `tools/` | 套用、檢查、安裝用的腳本，第一次用先在這裡跑 `npm ci` |
| `builds/0.0.45/zh/` | 0.0.45 繁體中文版（含外觀修正），目前安裝中 |
| `builds/0.0.45/en-fixed/` | 0.0.45 英文版（含外觀修正），退回英文用；不要用 `.bak`，那是沒有外觀修正的原版 |
| `install.log` | `tools/install.ps1` 的安裝紀錄 |

## 1. 外觀頁卡死修正（`appearance-fix/`）

這是之前做的修正，`changes-0.0.45.json` 保存了每一處修改前後的原文。

| 位置 | 內容 | 是否必要 |
|---|---|---|
| `server.asar` → `client/assets/main-*.js` 的等寬字型判斷函式 | 原本每個已安裝字型都要用 4 種字重／斜體 × 8 個字元做 canvas 量測（每個字型 32 次，還要切換字型），在 Windows 上字型很多，打開「設定 → 外觀」的字型選單會卡死。改成：結果存進快取，字型名稱含 mono/code/console/courier/fixed/terminal 直接算等寬，含 sans/serif/script 等直接算非等寬，其餘只量一次 `i` 和 `M` 的寬度 | **是，主要修正** |
| `server.asar` → `client/assets/settings.appearance-*.js` | 拿掉 React Compiler 的 memo 快取，行為不變 | 否，可以不套 |
| `app.asar` → `dist-electron/main.cjs` 開頭 | 加上全域 `unhandledRejection` 處理，未處理的 Promise 錯誤不會讓主程序崩潰 | 防護 |
| `app.asar` → `main.cjs` 的 `syncWindowAppearance` | 切換主題時設定視窗背景色、標題列按鈕顏色的呼叫包上 try/catch | 防護 |
| `app.asar` → `main.cjs` 的 `electronTheme.onUpdated` | 系統主題變更事件的處理包上 try/catch 與 `.catch` | 防護 |

之前那次修改還在 `server.asar` 內留下 `main-*.js.bak`、`SettingsPanels-*.js.bak` 兩個沒有作用的檔案，不影響執行。

注意：`main-*.js` 是壓縮過的程式碼，函式名稱（`AG`、`gG`、`CG`…）每個版本都會變，新版不能直接字串取代，要依上面的邏輯在新版中找到對應函式重寫。官方新版若已修好就不必再套。

## 2. 繁體中文化（`translations/`）

- `client/01.json`～`11.json`：英文 → 繁體中文的對照表，共約 4,050 條，套用到 `server.asar` 的 `apps/server/dist/client/assets/*.js`（網頁介面）。
- `desktop-main.json`：`app.asar` 的 `apps/desktop/dist-electron/main.cjs`（桌面外殼的右鍵選單、應用程式選單、更新與 WSL 對話框）的逐字取代清單，`count` 是該字串應出現的次數。

### 套用規則

對照表以「英文原文」為鍵，不依賴檔名或函式名稱，所以新版本大多能直接沿用；新版新增的文字需要補翻。

只替換「出現在顯示位置」的字串，用 JS 解析器（acorn）判斷字串所在的位置：

- 一律翻譯：物件屬性 `children`、`label`、`title`、`aria-label`、`description`、`placeholder`、`detail`、`text`、`ariaLabel`、`hint`、`tooltip`、`alt`、`subtitle` 的值；以 `/settings/` 路徑為鍵的頁面標題；`*.confirm(...)` 的參數與 `[...].join()` 組成的確認對話框文字。
- 有條件翻譯：存在變數、`return`、指派、箭頭函式回傳、預設值、樣板字串 `${}` 裡的字串，只有在整個程式包中這個字串**從沒被拿來比較**（`===`、`case`、物件鍵等）時才翻。
- 樣板字串（`` `Delete ${n} threads` ``）以 `{0}`、`{1}` 表示插入值，譯文可以調整順序，也可以省略英文複數用的插入值，但不能新增。
- 樣板字串的 `${}` 裡又有要翻的字串時，必須由內而外套用（曾因此產生語法錯誤）。

### 刻意保留英文

- 程式會拿來比對的標籤：`Commit`、`Push`、`Browser`、`Plan Ready`、`Fast`、`Default`、`Custom`、`Mixed`、`Unavailable`、`Agent`，以及按鍵名稱（`Enter`、`Esc`、`Ctrl`、`Alt`、`Home`、`Left`…）。程式碼裡有 `label === "Commit"` 這類判斷，翻了會壞。
- 會傳給 AI 代理的文字：`utils-*.js` 裡瀏覽器／裝置工具的說明、`pullRequestDetail.logic-*.js` 的 PR 修正提示、`[User attached one or more files…]`、`PLEASE IMPLEMENT THIS PLAN`、附件標記（`Image: {0}` 等），以及 t3.json 的 JSON Schema 說明。
- 品牌與專有名詞：側邊欄標誌「T3 **Code**」、Codex、ChatGPT、GitHub、模型名稱等。
- 由伺服器或供應商傳來的資料（模型選項如 `Medium`、既有對話標題等）不在程式包裡，無法翻譯。

### 驗證方式

1. 每個改過的檔案都要通過 V8 語法檢查：`node --input-type=module --check`（acorn 能解析不代表瀏覽器能解析）。
2. 用翻譯後的 `server.asar` 另外開一個測試伺服器，不影響正在用的 T3 Code：
   設定環境變數 `ELECTRON_RUN_AS_NODE=1`、`T3CODE_HOME=<空的測試資料夾>`、`T3CODE_PORT=3899`、`T3CODE_NO_BROWSER=1`，用 `T3 Code (Alpha).exe` 執行 `<server.asar>/apps/server/dist/bin.mjs`（同一層要有對應的 `.asar.unpacked` 資料夾），再用記錄中印出的 pairing URL 開瀏覽器檢查。
3. 重新打包 asar 時要保留原本的檔頭結構（哪些檔案放在 `.unpacked`）、重算 offset 與 SHA256 integrity；未修改時輸出應與原檔逐位元組相同。

## 3. 安裝

T3 Code 執行中會鎖住程式包，需要先完全關閉 T3 Code，再用修改後的 `app.asar`、`server.asar` 取代 `resources\` 裡的同名檔案，之後重新開啟。`tools/install.ps1` 會等 T3 Code 關閉、把舊檔移到資源回收筒、換上新檔並重新開啟：

```powershell
cd tools
.\install.ps1 -Src ..\builds\0.0.45\zh        # 中文版
.\install.ps1 -Src ..\builds\0.0.45\en-fixed  # 退回英文版
```

## 4. T3 Code 更新後重新套用

以下在 `tools/` 執行（`<版本>` 換成新版號）。

1. 把 `resources\` 裡新版的 `app.asar`、`server.asar` 複製到 `..\builds\<版本>\orig\`，之後都從這份產生。
2. 外觀修正：照第 1 節在新版 `main-*.js` 找到對應函式重寫；`node strdiff.js <舊檔> <新檔>` 可以列出兩個 JS 檔的差異。官方已修好就略過。
3. 網頁介面：`node apply.js <server.asar> ..\builds\<版本>\zh\server.asar ..\translations\client`。輸出的 `unused` 是新版已經不存在的英文原文；新版新增的文字要先 `npx asar extract` 解開，再用 `inventory.js`、`candidates.js` 列出候選字串，翻好補進對照表後重跑。
4. 桌面外殼：`node applyDesktop.js <app.asar> ..\builds\<版本>\zh\app.asar ..\translations\desktop-main.json`。出現 `expected N got M` 就是新版該字串變了，修正清單後重跑。
5. 照第 2 節「驗證方式」開測試伺服器檢查，再用 `install.ps1 -Src ..\builds\<版本>\zh` 安裝。

0.0.45 已用這個流程從 `en-fixed` 重新產生過，輸出與 `zh` 逐位元組相同。

## 5. 2026-10-15 升級 Nightly

已安裝 `0.0.46-nightly.20261015.3158`（commit `e6bbfdb9ffe8`），依使用者決定使用全新的對話資料，不匯入舊對話。

- Nightly 安裝位置：`%LOCALAPPDATA%\Programs\t3code-nightly`；原本 0.0.45 的 `t3code` 安裝保留。
- Nightly 資料位置：`%USERPROFILE%\.t3-nightly\userdata`；原本 `.t3\userdata` 保留。
- 桌面與開始功能表的 `T3 Code (Nightly)` 捷徑透過 `tools/launchNightly.vbs` 設定這個獨立資料位置。請使用這兩個捷徑開啟；直接執行程式會使用預設的 `.t3`，並匯入舊對話。
- 原本的介面設定、伺服器設定、快捷鍵、模型偏好、供應商設定、登入資料與主題已複製。新版會自動轉換設定格式，原本的快捷鍵全部保留，另加入九條新版預設快捷鍵。
- 保留等寬字型快取與簡化量測、全域 Promise 拒絕處理、視窗外觀呼叫防護、系統主題事件防護。舊版標為非必要的 React memo 移除未移植，因為新版已更換該頁模組。
- 中文化沿用原本 4,050 條對照，其中 3,901 條在新版仍有對應，共替換 5,658 處、98 個網頁介面檔案；桌面外殼 21 組取代全部沿用。這次未補翻新版新增文案。

`builds/0.0.46-nightly.20261015.3158/` 保存官方安裝程式 `installer.exe`、`orig/` 原始程式包、`en-fixed/` 英文修正版、`zh/` 中文修正版。`appearance-fix/changes-0.0.46-nightly.20261015.3158-report.json` 記錄補丁位置。

重新產生本版本的外觀修正：

```powershell
node tools/prepareNightly.cjs builds/0.0.46-nightly.20261015.3158/orig <輸出資料夾>
```

輸出為 `app-fixed.asar`、`server-fixed.asar`；接著用原本的 `applyDesktop.js`、`apply.js` 套用中文化。這個工具依本次版本移植，未來版本若改了程式結構，會停止並指出找不到的位置。

舊的 `tools/install.ps1` 仍專供 0.0.45 的 `t3code` 路徑，不適用 Nightly。Nightly 關閉後，應將對應版本 `zh/` 的兩個 `.asar` 複製到 `t3code-nightly/resources/`。官方更新會覆蓋本機補丁，之後每次更新都需重新對應並套用。

已驗證：官方 Windows 安裝檔 SHA256、修改後 JavaScript 的 V8 語法、獨立測試伺服器啟動、實際提供的中文與字型補丁模組、正式 Nightly 後端 HTTP 200、桌面視窗正常回應、全新資料庫對話數為 0。未逐頁操作介面，也未送出實際 AI 請求。

## 6. 2026-10-16 改用 Beta 0.1.0

官方 Beta `0.1.0`（commit `81493efb71e8`）比上述 Nightly 新 22 個上游 commit，安裝在原本 0.0.45 的 `%LOCALAPPDATA%\Programs\t3code`，資料沿用 `.t3\userdata`（舊版 168 段對話已由官方轉入新資料庫）。補丁改為只支援這個版本，Nightly 的版本鎖定、`launch.ps1` 與 `launchNightly.vbs` 移除；`prepareNightly.cjs` 改名為 `prepareAppearance.cjs`。

移植內容：

- 外觀修正、後端思考翻譯、桌面外殼翻譯不必修改即可套用。
- 前端模組檔名更新為 `runtime-D0ddCMLS`、`runtime-CpBx-VNw`、`_chat-D4Fgdsqn`、`utils-Hcg8Weh5`、`main-Optk7rV0`、`ProviderModelPicker-chYJxHjc`。思考區塊的 remark 外掛由 `Cz` 改名為 `Nz`，模型選擇器的標籤函式由 `lt`／`ut` 改名為 `ft`／`pt`，兩者內容與舊版相同；其餘使用到的壓縮識別字逐一比對，定義一致。
- `patchLabels.cjs` 的三個版本限定接點找不到時改為直接報錯；舊版遇到檔名變更會略過而不提示。

初次移植時翻譯表使用 4,907 條、替換 6,845 處、100 個模組，與 Nightly 相同；顯示接點 528 個。

同日補翻：比對上游 `e6bbfdb9ffe8..81493efb71e8` 的介面原始碼，Beta 新增的顯示文字只有載入骨架的 `Loading {0}`（譯為「正在載入 {0}」）與版本階段 `Beta`（屬產品名，保留原文）；另補上漏翻的 `Account`（帳號）。logo 旁的 `Code` 原本被翻成「T3 程式碼」，改由 `translate.js` 對 JSX children 的 `Code` 保留原文，PR 分頁標籤仍顯示「程式碼」。補翻後使用 4,909 條、替換 6,849 處。驗證結果見 [VERIFICATION.md](VERIFICATION.md)。

## 7. 2026-10-22 移植到 0.1.1

官方 `v0.1.1`（commit `fe27e8e3dc12`）比 0.1.0 新 1,486 個上游 commit，前端改用原生 React Compiler，模組檔名與壓縮識別字全部改變。補丁改為只支援 0.1.1。

- 外觀修正與後端思考翻譯不必修改即可套用。
- 前端模組檔名更新為 `runtime-Dk77ZTQi`、`runtime-eUbaXT1l`、`session-BRHKkYwR`、`_chat-CUpeYEZL`、`utils-CxoqT410`、`main-DtHZmDQQ`、`ProviderModelPicker-DwqeOA30`。思考區塊改由共用的 Markdown 元件 `ic`（`inline` 模式加 `extraRemarkPlugins`）顯示，三個顯示接點照新結構改寫；展開工作記錄的接點只換了元件與常數名稱。附加程式借用的名稱逐一以新版同一位置的用法對應，並確認都是所在模組的最上層宣告。
- 桌面選單新增數字鍵盤快捷鍵用的隱藏縮放項目，`實際大小`、`放大`、`縮小` 的出現次數改為 2、4、2。
- 補翻 0.1.1 新增的顯示文字 275 條（`translations/client/18.json`）：連線診斷、T3 Connect 疑難排解、跨電腦加入專案、排程任務篩選與合併、EAS 模擬器主機、數學公式顯示、儲存空間回收、上下文壓縮提示等。傳給代理的工具說明與錯誤、Clerk 開發設定說明保留英文。
- 順手修正 0.1.0 起就有的工作記錄摘要：原本譯成「已讀取 3 files」「已收到 1 update」，改為「已讀取 3 個檔案」「已收到 1 則更新」等；模型選單的「4 models」改為「4 個模型」。
- 翻譯表共 5,356 條，本版本使用 5,126 條、替換 7,129 處、104 個模組；顯示接點 578 個。
- 仍保留英文：PR 討論的「Show N older conversations」（英文複數片段無法單獨翻譯）、由伺服器傳來的對話預設標題 `New thread`，以及和 0.1.0 相同、被程式拿來比對的選項值。
