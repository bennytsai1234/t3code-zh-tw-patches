# T3 Code 繁體中文與自動思考翻譯補丁

適用 Windows **T3 Code 0.1.3**，官方 commit **d2c440312e5f**。修改官方安裝的兩份程式包：介面翻成繁體中文、修正外觀頁字型選單卡死，並自動翻譯思考內容。不升級 T3 Code，不變更對話、供應商、快捷鍵與外觀設定。其他版本會在建置時停住，要先移植補丁（步驟見 [AGENTS.md](AGENTS.md)）。

## 安裝

先安裝 Node.js 22.12 以上與同版本的官方 T3 Code。以下在 PowerShell、倉庫根目錄執行：

```powershell
npm ci --prefix tools
# 第一次套用前，從尚未修改的官方安裝保存原始程式包；以後一律從它重建。
$resources = "$env:LOCALAPPDATA\Programs\t3code\resources"
New-Item -ItemType Directory -Path builds\0.1.3\orig -Force
Copy-Item "$resources\app.asar", "$resources\server.asar" builds\0.1.3\orig
node tools/build.cjs builds/0.1.3/orig builds/0.1.3/zh-release
```

建置會核對兩份官方程式包的 SHA256，拿已修改過的程式包當輸入會被擋下。儲存工作、完全關閉 T3 Code 後執行：

```powershell
.\tools\install.ps1 -Src .\builds\0.1.3\zh-release
# 安裝位置不同時，加上 -InstallDir 'D:\Apps\t3code'
```

安裝工具不會停止任何程序。它檢查已安裝版本與輸出雜湊，把原程式包備份到 `%LOCALAPPDATA%\t3code-zh-tw-patches\backups\<時間>` 後才覆寫，複製失敗時從備份還原。還原時關閉 T3 Code，把備份路徑傳給同一工具：

```powershell
.\tools\install.ps1 -Src "$env:LOCALAPPDATA\t3code-zh-tw-patches\backups\<時間>"
```

官方自動更新會用原版覆蓋補丁，用 T3 Code 內建的環境變數固定版本：

```powershell
setx T3CODE_DISABLE_AUTO_UPDATE true
```

要升級時改成 `false`、重開 T3 Code 更新，再照 AGENTS.md 移植補丁。其他電腦安裝相同官方版本、複製本倉庫後照上述步驟即可，登入與供應商設定由該電腦的 T3 Code 管理。

## 思考翻譯行為

- 使用所屬專案有效設定中的「文字產生模型」（未覆寫時用環境的設定），沿用 T3 Code 的供應商登入，與該供應商共用額度。
- 只翻譯供應商已提供給介面顯示的思考內容，不要求或取得隱藏推理。區塊完成後才送出，串流期間顯示原文；固定介面文字不呼叫模型。
- 預設顯示繁體譯文，可切換「查看英文原文／查看繁體翻譯」。活動列、展開的思考、展開工作記錄中的思考正文及來源對話引用共用同一份譯文；工具輸出不翻譯。
- 同一段原文只送一次，完成的區塊依序翻譯。成功譯文存在 T3 Code 的本機 IndexedDB（索引是環境、對話與原文的 SHA-256），重開後直接讀取；失敗不快取，不寫回對話紀錄，也不跨裝置同步。
- 環境尚未連線時先等待。單一區塊等待連線加翻譯超過 210 秒就顯示失敗，可手動重試，不卡住後續區塊；失敗時保留原文，不自動重試。
- 後端新增 `/api/zh-tw/thinking`，沿用環境驗證與對話操作權限；前端透過 T3 Code 內建的環境認證請求送出（Bearer／DPoP，DPoP 被拒時更新授權再試一次）。遠端環境也要套用同版本補丁。
- 支援 `fromRunner` 供應商及其 Codex、OpenCode 包裝，以及 Muse；不支援文字產生的供應商會顯示錯誤並保留原文。

## 目前版本未實測

工具列中的思考與來源對話引用兩個顯示位置只有單元測試與建置檢查涵蓋；DPoP 授權更新需要遠端中繼連線，未實測。

## 倉庫內容

`translations/client/` 是介面翻譯表，`translations/desktop-main.json` 是桌面外殼選單與對話框，`translations/display-labels.json` 是模型選項等只在最後顯示時替換的標籤。`tools/` 是建置、移植與安裝工具，`appearance-fix/` 是外觀修正的原文對照。`builds/`、`work/`、`node_modules`、安裝檔、備份與個人資料都不進 Git。
