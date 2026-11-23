# T3 Code 繁體中文與自動翻譯補丁

適用 Windows **T3 Code 0.1.11** 與同版本的 [Linux 伺服器](#linux-伺服器)，官方 commit **59651c1761f6**。補丁將介面翻成繁體中文、修正外觀頁字型選單卡死，並自動翻譯思考內容與 AI 回覆。介面用語優先採用專案譯文，其餘官方中文介面文字在建置時轉成臺灣繁中。語言預設跟隨系統，新環境使用臺灣繁中系統語系時會顯示繁中，也可以在「設定 → 一般 → 語言」選擇「繁體中文」。其他版本需依 [移植步驟](AGENTS.md) 更新接點。

## 安裝

先安裝 Node.js 22.12 以上與同版本的官方 T3 Code。以下在 PowerShell、倉庫根目錄執行：

```powershell
npm ci --prefix tools
# 第一次套用前，從尚未修改的官方安裝保存原始程式包；以後一律從它重建。
$resources = "$env:LOCALAPPDATA\Programs\t3code\resources"
New-Item -ItemType Directory -Path builds\0.1.11\orig -Force
Copy-Item "$resources\app.asar", "$resources\server.asar" builds\0.1.11\orig
node tools/build.cjs builds/0.1.11/orig builds/0.1.11/zh-release
```

建置會核對兩份官方程式包的 SHA256，拿已修改過的程式包當輸入會被擋下。儲存工作、完全關閉 T3 Code 後執行：

```powershell
.\tools\install.ps1 -Src .\builds\0.1.11\zh-release
# 安裝位置不同時，加上 -InstallDir 'D:\Apps\t3code'
```

安裝工具不會停止任何程序。它檢查已安裝版本與輸出雜湊，覆寫後再次核對兩份程式包；安裝期間在記憶體保留原檔，複製或校驗失敗時還原，不建立備份目錄。要恢復官方版本，關閉 T3 Code 後重新執行同版本的官方安裝檔。

官方自動更新會用原版覆蓋補丁，用 T3 Code 內建的環境變數固定版本：

```powershell
setx T3CODE_DISABLE_AUTO_UPDATE true
```

要升級時改成 `false`、重開 T3 Code 更新，再照 AGENTS.md 移植補丁。其他電腦安裝相同官方版本、複製本倉庫後照上述步驟即可，登入與供應商設定由該電腦的 T3 Code 管理。

## Linux 伺服器

用 `npm install -g t3@0.1.11` 安裝的 Linux x64 伺服器，執行檔與網頁介面在 `~/.t3/runtime/versions/0.1.11`。桌面版透過 T3 Connect 開啟這台電腦的環境時，翻譯請求由這台伺服器處理，所以它也要套用補丁；用瀏覽器直接開它的網頁介面時也會是繁中。

補丁在已完成上述 Windows 建置的電腦上建置，需要 `builds/0.1.11/orig` 與 `builds/0.1.11/zh-release`。以下 `<主機>` 是 Linux 電腦的 SSH 名稱：

```powershell
New-Item -ItemType Directory -Path builds\0.1.11\linux-orig -Force
scp <主機>:.t3/runtime/versions/0.1.11/t3 builds/0.1.11/linux-orig/
scp -r <主機>:.t3/runtime/versions/0.1.11/client builds/0.1.11/linux-orig/
node tools/buildLinux.cjs builds/0.1.11/linux-orig builds/0.1.11/orig builds/0.1.11/zh-release builds/0.1.11/linux-zh-release
ssh <主機> mkdir -p t3code-zh-tw
scp -r builds/0.1.11/linux-zh-release tools/installLinux.cjs <主機>:t3code-zh-tw/
```

建置會核對官方執行檔的 SHA256，並確認 Linux 的網頁介面與 Windows 官方版逐檔相同。重新啟動服務會中斷進行中的對話，確認沒有對話在跑後，在 Linux 電腦上執行：

```sh
cd ~/t3code-zh-tw
node installLinux.cjs linux-zh-release
systemctl --user restart t3code
```

安裝工具第一次執行時把官方執行檔與網頁介面備份到 `~/.t3/zh-tw-official/0.1.11`，在旁邊暫存並校驗新檔後才換上，不會動到設定與對話資料。要恢復官方版本：

```sh
node ~/t3code-zh-tw/installLinux.cjs --restore
systemctl --user restart t3code
```

Linux 伺服器不會自動更新，只有在介面按「更新伺服器」或執行 `t3 update` 才會換版。換版後服務改跑新版本資料夾，補丁隨之失效，所以要先照 AGENTS.md 移植新版補丁再更新。

## 思考與回覆翻譯行為

- 使用所屬專案有效設定中的「文字產生模型」（未覆寫時用環境的設定），沿用 T3 Code 的供應商登入，與該供應商共用額度。
- 翻譯已顯示的思考內容與 AI 回覆，完成後才送出，串流期間顯示原文；不翻譯使用者輸入、工具輸出或未顯示的推理。固定介面文字不呼叫模型。
- 思考摘要與回覆正文都在本機比較整個區塊的漢字與英文字母（A–Z、a–z）數量。漢字較多或沒有英文字母時顯示原文。英文字母較多或兩者同數時翻譯整個區塊。計數排除 Markdown 格式、程式碼、路徑與網址，連結的顯示文字會計入。
- 預設顯示繁體譯文，可切換回原文。活動列、展開的思考、展開工作記錄中的思考正文及來源對話引用共用同一份思考譯文。
- 回覆中的程式碼、Markdown 結構、連結目標與路徑在本機保護並還原，粗體、斜體與刪除線旁的邊界空白也由本機保留，確保中文標點不破壞格式；翻譯結果未保留格式時顯示原文，提供手動重試。常見技術名詞優先採用臺灣通行譯名，品牌與模型名稱保留原文。
- 同一環境、對話和顯示類型的相同原文只送一次，完成的區塊依序翻譯。成功譯文存在 T3 Code 的本機 IndexedDB，重開後直接讀取；失敗不快取，不寫回對話紀錄，也不跨裝置同步。
- 環境尚未連線時先等待。單一區塊等待連線加翻譯超過 210 秒就顯示失敗，可手動重試，不卡住後續區塊；失敗時保留原文，不自動重試。
- 後端新增 `/api/zh-tw/thinking`，沿用環境驗證與對話操作權限；前端透過 T3 Code 內建的環境認證請求送出（Bearer／DPoP，DPoP 被拒時更新授權再試一次）。遠端環境也要套用同版本補丁。
- 使用 T3 Code 的文字產生服務，支援文字產生器、`fromRunner` 供應商及其 Codex、OpenCode 包裝，以及 Muse；不支援文字產生的供應商會顯示錯誤並保留原文。

## 驗證

0.1.11 已完成建置、34 項自動測試及獨立目錄的安裝演練。隔離環境已驗證臺灣繁中系統語系、設定側欄和模型思考程度的繁中顯示，以及翻譯路由未登入時回傳 401。用 Claude Haiku 5.5 對話與 GPT-6-Luna（low）翻譯，確認展開的思考和混合中英回覆皆可切換原文，且回覆保留行內程式碼、路徑和連結。重新整理後回覆與展開的思考使用本機快取，翻譯請求數為 0。Linux 伺服器在 Ubuntu 26.04 用獨立資料夾演練安裝、還原與重複安裝，並以 Claude Haiku 5.5 對話、Claude Haiku 5.5 與 GPT-6-Luna（low）分別翻譯，通過同樣的檢查；正式服務換上後翻譯路由未登入回 401，T3 Connect 正常連線。

## 目前版本未實測

桌面原生選單、獨立文字產生器、OpenCode 翻譯、遠端中繼的 DPoP 授權更新，以及桌面版經 T3 Connect 開啟 Linux 環境時的翻譯。

## 倉庫內容

`translations/client/` 是介面翻譯表，`translations/desktop-main.json` 是桌面外殼選單與對話框，`translations/display-labels.json` 是模型選項等只在最後顯示時替換的標籤。`tools/` 是建置、移植與安裝工具，`appearance-fix/` 是外觀修正的原文對照。`builds/`、`work/`、`node_modules`、安裝檔、備份與個人資料都不進 Git。
