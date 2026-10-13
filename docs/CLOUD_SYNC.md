> 新專案請使用 [Workers 部署指引](WORKERS_DEPLOY.md)。以下 Pages 說明保留作歷史參考。

# 手機一鍵同步與 GitHub → Cloudflare 部署

## 目前能力

手機的「同步目前語言」會由 Cloudflare 呼叫已驗證的 Duolingo learned-lexemes API，依目前實際已學技能讀取完整字庫，逐一核對候選單元。每次只查一頁，進度存在 D1；手機關閉頁面後停止發出下一批請求，重新開啟可按「繼續同步」。不依賴電腦開機，但同步進行時請保持手機頁面開啟。

同步只讀取 Duolingo，不改課程進度。現階段只支援中文教學的德文／日文「當前課程」。先在 Duolingo 切到想更新的語言，再回 Duolingo 單字庫選同一語言並按同步。尚未確認可直接同時抓取兩門非當前課程，因此不假設支援。

全部頁面完成、單元檢查及進度一致性檢查通過後，才在同一筆資料庫交易中發佈新字庫。失敗保留上次完整字庫；重複的並行請求不能覆蓋較新的狀態。工作有效期限為一天，超過後選重新開始。

使用 API 原始釋義，不呼叫翻譯或 AI 服務。原始資料可能包含簡體字。日文新字沒有讀音資料時，標示讀音待補，先使用 API 音訊；不猜測漢字讀音。初始字庫若已包含假名與羅馬拼音，後續相同字會保留。單元查詢未能證明篩選有效時，歸到「尚未確認單元」。

此處的同步功能負責 Duolingo 字庫。多人版另以 `/api/study` 自動同步收藏、筆記、FSRS 複習紀錄與設定，依穩定單字 ID 保留；衝突、離線與跨裝置操作見 [MULTI_USER.md](MULTI_USER.md)。

## GitHub 與 Cloudflare

GitHub 儲存庫由使用者建立；目前沒有替使用者建立或上傳儲存庫。

1. 將程式上傳到自己的 GitHub 私人儲存庫，沿用 `.gitignore`。不要強制加入 `data/`、`web/data.json`、`artifacts/`、`.dev.vars` 或憑證。
2. Cloudflare Pages 建立 **Git integration** 專案，連接該儲存庫。建置命令：`npm ci && npm run build:cloud`；輸出目錄：`dist`；框架選 None。
3. 建立 D1 資料庫，在 Pages 的正式與預覽環境綁定，名稱 **DB**。資料表在第一次 API 請求時自動建立。
4. 在正式環境設定 Secret **SITE_PASSWORD**：使用密碼管理器產生至少 20 字元的隨機專用密碼。登入帳號固定為 `owner`。不要填 Duolingo 密碼。
5. 設定 Secret **DUOLINGO_JWT**：放入自己 Duolingo 的 `jwt_token`。只存 Cloudflare Secret，不放 GitHub 或前端。不需要把憑證貼到聊天。
6. 重新部署使綁定與 Secret 生效。若開啟預覽環境，未設定 SITE_PASSWORD 時保持封鎖；如需預覽測試，使用獨立資料庫，避免影響正式同步。
7. 手機開啟正式 HTTPS 網址，以 `owner` 及專用密碼登入，再按同步。

登入憑證過期時需手動更新 DUOLINGO_JWT；Cloudflare 來源 IP 也可能遭 Duolingo 拒絕，這種情況會顯示錯誤，不繞過網站驗證。實際雲端連線必須在部署和設定自己的有效憑證後驗證，合成測試不能代表 Duolingo 一定接受雲端請求。

未設定 SITE_PASSWORD 時所有頁面與 API 都拒絕讀取。D1/DUOLINGO_JWT 未設定時顯示設定提示。此方案不使用 Cloudflare Zero Trust；仍受帳號目前 Workers/Pages/D1 方案額度限制，未替使用者升級或同意新的扣款授權。

## 保留原本電腦字庫（選用）

Github 建置不攜帶個人字庫，初次開啟會顯示空白字庫，按同步即可建立。若希望把現有兩門字庫與自動讀音一起帶過去，可在電腦執行 `python scripts/seed_catalog.py`，再用 Cloudflare D1 的 SQL 匯入功能或 Wrangler 將 `artifacts/catalog-seed.sql` 匯入同一個資料庫。此檔案含個人字库，請勿上傳 GitHub。匯入採 INSERT OR IGNORE，不覆蓋已存在的雲端課程。

換網址後，複習紀錄仍需由舊網址「備份」再到新網址「匯入」，不會自動跨網址搬移。

## 架構

開發與建置使用 Node.js 24 以上，先執行 `npm ci`。Worker 原始碼為 TypeScript，`npm run build:cloud` 會先檢查型別再打包；原 `python scripts/cloud_build.py` 指令仍相容。

- `server/basic-auth.ts`：伺服器登入驗證。
- `server/worker.ts`：薄路由入口，先驗證登入才提供任何資源。
- `server/sync/duolingo.ts`：固定來源 API、憑證檢查與連線錯誤。
- `server/sync/domain.ts`：真實技能、分頁驗證、候選單元與字庫轉換。
- `server/sync/repository.ts`：D1 儲存、版本檢查、原子發佈。
- `server/sync/service.ts`：可接續的分批同步流程。
- `server/sync/routes.ts`：API 邊界、同源檢查、錯誤訊息。
- `web/src/sync-controller.mjs`、`services/sync-client.mjs`、`ui/views/sync.mjs`：手機操作、HTTP 與畫面分層。
- `scripts/cloud_build.py`：由上述模組生成部署目錄，原始碼維持分層。

API：`GET /api/catalog`、`GET /api/sync/status?language=de`、`POST /api/sync/start?language=de`、`POST /api/sync/step?language=de`。寫入操作必須通過登入、同源 Origin 和自訂請求標頭檢查。前端不會取得 Duolingo 憑證。

## 驗證

```powershell
node --test tests/*.test.mjs
python -m unittest discover -s tests -v
npm ci
npm run build:cloud
node --check dist/_worker.js
# 先開 python serve_web.py，再執行：
python tests/browser_check.py
python tests/browser_review_check.py
python tests/browser_sync_check.py
```

同步測試使用合成 Duolingo 回應及真正 SQLite 交易來驗證 D1 查詢；手機 UI 使用模擬雲端端點，不會讀取真實登入憑證。

## 字典查詢

`GET /api/dictionary?provider=wiki&term=...`（或 `provider=jisho`）沿用網站登入保護，限制詞長、固定上游網址、15 秒上游逾時及 2 MB 回應上限。上游不接收本站 Cookie、登入資訊或 Duolingo token。前端只連同源端點，不需放寬 CSP。

查詢按需執行；Worker 的記憶體快取最多 32 筆／8 MB，保存至多七天，冷啟動可能清空。429 限流會依 Retry-After 暫停該上游的新請求，既有快取可讀。字典功能不需新增 D1 表、API 金鑰或環境變數。新增程式需重新建置與部署才會套用到線上；不會自行部署。
