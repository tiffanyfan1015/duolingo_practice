# Duolingo 單字庫

將 Duolingo 已學單字整理成可搜尋、練習與每日複習的網頁。支援多人帳號，每位使用者連接自己的 Duolingo，選擇要啟用的課程。介面採用亮綠色、圓角卡片與立體按鈕，適用桌面與手機。

本專案不是 Duolingo 官方產品，使用非官方 API。實際課程資料與雲端連線可用性仍需以真實帳號驗證；本機示範及自動化測試使用合成資料。

## 先在本機看畫面

需要 Node.js 24（使用內建 `node:sqlite`），在專案根目錄執行：

```powershell
npm run preview
```

開啟 [本機預覽](http://127.0.0.1:8766/account)。不用 Cloudflare，也不用先安裝額外 npm 套件。

| 項目 | 示範值 |
| --- | --- |
| 帳號 | `demo` |
| 密碼 | `demo-study-12345` |
| 註冊邀請碼 | `browser-test-invitation-code` |

預覽已載入模擬課程與範例字庫，不會連接真實 Duolingo，請勿貼入真實憑證。伺服器只監聽本機，帳號與伺服器字庫存在記憶體；重啟後會重設。此入口僅供預覽，不作為正式部署入口。

## 目前功能

- **個人帳號**：邀請碼註冊、登入／登出、連接／更新／解除個人 Duolingo 憑證，個人字庫隔離。
- **動態課程**：取得帳號的語言課程清單，在「帳號與 Duolingo → 啟用課程」勾選並儲存。首次只啟用目前課程，更新清單不會自動啟用新課程；停用保留字庫和學習紀錄。
- **字庫管理**：單元篩選、搜尋、收藏、筆記、遮住釋義、分頁或全部展開。
- **自由練習**：翻卡、拼字、聽力，以及原有的簡單間隔複習。
- **每日複習**：FSRS 排程、四種評分、辨識／回想／聽力獨立卡片、每日份量、暫停與撤銷。
- **備份與匯入**：保存學習紀錄與個人設定，新版備份相容舊版資料。

課程只顯示語言名稱，例如德文、日文、法文；同語言有多門課時加上數字區別，各自保存單字與進度。網頁版不再將清單固定為德文與日文，Python CLI 仍維持原有支援範圍。

## 正式網站的使用流程

1. 使用管理者提供的邀請碼，建立本站帳號與專用密碼。
2. 在「帳號與 Duolingo」依頁面指示取得自己的 `jwt_token`，貼入連接欄位。憑證會在後端加密保存，過期時需更新；本站不需要你的 Duolingo 密碼，也不是官方 OAuth 登入。
3. 勾選要練習的課程並按「儲存課程」。若 Duolingo 新增了課程，可按「更新清單」。
4. **先在 Duolingo 切換到要同步的課程**，再回本站選擇同一課程並同步。同步期間保持頁面開啟，避免切換課程或做題。
5. 完成同步後，使用單字表、自由練習或每日複習。

同步只讀取資料，不會代為切換課程、完成課程或提交答案。釋義沿用課程的教學語言，不會自動全部翻譯成中文。

字庫與課程啟用設定儲存在伺服器；複習、收藏、筆記與 FSRS 個人參數會先儲存在目前瀏覽器，再同步至 D1。同一帳號可在不同裝置同步學習紀錄，離線修改會等連線恢復後上傳；同欄位有衝突時由使用者選擇。清除網站資料前，請確認同步完成或匯出備份。

## 部署多人版

目前 `wrangler.jsonc` 預設 `MULTI_USER = "true"`，使用 Cloudflare Workers 與 D1。部署前須填入真正的 D1 Database ID，並設定 `CREDENTIAL_KEY` 與 `REGISTRATION_CODE` Secrets。

```powershell
npm ci
npm run build:cloud
npx wrangler@4 deploy
```

建置輸出為 `dist/`，預設不包含個人字庫。正式網站需使用 HTTPS。多人設定、憑證加密、資料隔離與舊資料移轉請閱讀 [MULTI_USER.md](docs/MULTI_USER.md)；GitHub 自動部署欄位見 [WORKERS_DEPLOY.md](docs/WORKERS_DEPLOY.md)。該文件中的 `owner`、`SITE_PASSWORD`、`DUOLINGO_JWT` 步驟僅適用舊單人模式，多人版使用自己的帳號與上述兩個 Secrets。

尚未提供忘記密碼、帳號刪除、管理介面或 Duolingo 字庫背景自動同步。Duolingo 的內部 API 可能變更或拒絕雲端請求。

## Python 本機工具與靜態網站

這是另一種使用方式：以 Python 匯出個人字庫，再產生單人靜態網站。需要 Python 3.10 以上；單字匯出本身不需額外套件。

### 匯出單字

先在自己的 Duolingo 切到德文或日文課程。在瀏覽器開發者工具的 **Application → Storage → Cookies → https://www.duolingo.com** 找到 `jwt_token`，於工具的隱藏提示貼上，不要放進命令列參數或 Git。

```powershell
python duolingo_sync.py --language de --check
python duolingo_sync.py --language de
# 日文請先切換課程，再執行：
python duolingo_sync.py --language ja
```

工具不保存權杖；進階使用可透過 `DUOLINGO_JWT` 環境變數提供。匯出存於 `data/exports/`，包含 JSON 與 UTF-8 BOM CSV。原始匯出保留 API 翻譯與音訊網址，不下載音檔。

### 驗證單元對應

```powershell
python duolingo_sync.py --language de --map-units
```

日文改用 `--language ja --map-units`。此模式先取得完整字庫，再用已學技能逐一查詢，會比普通同步多出請求；期間請勿做題或切換課程。結果另存 `data/exports/*-unit-probe.json`，中斷會保留已完成紀錄，重跑建立新報告。

`filter_supported` 代表查詢支持技能篩選，仍不是官方單字歸屬證明；`filter_not_demonstrated`、`inconclusive`、`inconsistent_results` 或 `incomplete_run` 不提供可用對應。候選單元可有多個，未涵蓋的字保留為 `unmapped`。

### 建置與開啟靜態網站

```powershell
python -m pip install --target .deps -r requirements-web.txt
python build_web.py
python serve_web.py
```

開啟 [靜態網站](http://127.0.0.1:8765)。每次重新匯出及完成單元驗證後，需再次執行 `python build_web.py`。匯出與驗證的單字集合不一致時會停止建置。

手機可與電腦連接同一個可信任的 Wi-Fi，改以 `python serve_web.py --lan` 啟動，再開啟 `http://電腦的區網IPv4:8765`。這個靜態伺服器只提供 `web/`，沒有多人登入或雲端同步 API。

Python 建置會使用 OpenCC 轉換中文釋義、pykakasi 產生日文假名與羅馬拼音，結果尚未逐條人工校訂。雲端同步不執行這些 Python 轉換。完整詞形、例句及離線音訊快取尚未提供。

## 開發與驗證

開發前閱讀 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 與 [AGENTS.md](AGENTS.md)。前端分為 domain／services／ui／controller；後端分開帳號、課程與同步職責；Python 指令維持薄入口。

後端 `server/` 使用 TypeScript strict mode，入口為 `server/worker.ts`；跨裝置資料契約位於 `shared/study.ts`，前端同步 API 與資料驗證透過 JSDoc 使用同一套型別。前端其餘部分維持原生 JavaScript，尚未導入 Vue。開發及建置使用 Node.js 24 以上，先執行 `npm ci` 安裝鎖定依賴。

```powershell
npm run typecheck
node --test tests/*.test.mjs
python -m unittest discover -s tests -v
npm run test:build
```

`npm run build:cloud` 先檢查型別，再使用 esbuild 產生 `dist/_worker.js` 和靜態資源。既有 `python scripts/cloud_build.py` 仍可使用，會呼叫同一套建置流程；純 Python 匯出及靜態網站指令維持原樣。

測試使用合成資料，不需要真實 Duolingo 憑證。瀏覽器整合測試需要安裝在 `.deps` 的 Playwright 與本機 Chrome，使用獨立無頭瀏覽器：

```powershell
# 自行啟動隔離的多人測試伺服器
python tests/browser_accounts_check.py
python tests/browser_study_sync_check.py
# 以下需先啟動 python serve_web.py，並備妥靜態字庫
python tests/browser_check.py
python tests/browser_review_check.py
```

瀏覽器所需的 FSRS 模組已放在 `web/vendor/`，預覽與 Python 靜態網站可直接使用；後端型別檢查與雲端建置需要先安裝 npm 依賴。重建 FSRS 模組使用 `npm run vendor`。憑證、個人單字匯出與學習紀錄不得提交 Git。

## 延伸文件

- [MULTI_USER.md](docs/MULTI_USER.md)：多人部署、Secrets、帳號隔離與移轉。
- [WORKERS_DEPLOY.md](docs/WORKERS_DEPLOY.md)：Workers 與 GitHub 部署設定。
- [ANKI_DESIGN.md](docs/ANKI_DESIGN.md)：每日複習的操作與排程設計。
- [LEARNING_VALIDATION.md](docs/LEARNING_VALIDATION.md)：FSRS 個人模型與字典／例句候選驗證。
- [WORD_INFO.md](docs/WORD_INFO.md)：德日詞條內容規格。正式單字詳情會按需查字典，顯示其他義項、例句及中文詞形；不用先人工審核。`python scripts/validate_vocabulary.py` 另可產生獨立品質驗證報告，不覆寫正式字庫或學習紀錄。
- [CLOUD_SYNC.md](docs/CLOUD_SYNC.md)：同步流程及舊單人 Pages 模式的歷史說明。
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)：模組分層與開發規範。
