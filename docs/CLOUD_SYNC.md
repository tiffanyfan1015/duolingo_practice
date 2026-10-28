# Duolingo 字庫同步與雲端架構

正式網站採 Workers 多人模式；部署與 GitHub 自動部署設定統一見 [WORKERS_DEPLOY.md](WORKERS_DEPLOY.md)。

## 目前能力

手機的「同步目前語言」會由 Cloudflare 呼叫 Duolingo learned-lexemes API，每次仍讀取完整單字清單以更新釋義並核對新增／移除的單字。技能對應採增量同步：同一課程結構下，沿用上次成功同步中完成等級與課數未變的技能結果，只重查新增或進度改變的技能。畫面會顯示沿用數量，也可按「完整重新同步」強制全部重查。課程結構改變、技能移除、上次紀錄不完整時不沿用；舊結果含已移除單字時重查該技能，新字仍未能對應時再重查其餘沿用技能一次。回傳整份字庫的技能結果不沿用，以免 API 未實際套用技能篩選。

每次只查一頁，進度與沿用結果存在 D1；手機關閉頁面後停止發出下一批請求，重新開啟可按「繼續同步」。不依賴電腦開機，但同步進行時請保持手機頁面開啟。既有完整同步紀錄可直接作為基準，不需新增資料表；首次同步或未完成工作被重新開始時，會完整核對技能。完成前仍驗證課程進度一致，並以同一交易發布字庫與完成狀態。

同步只讀取 Duolingo，不改課程進度。多人版動態取得語言課程，先在 Duolingo 切換到所選課程，再於網站同步；釋義沿用課程的教學語言。不假設可同時抓取非當前課程。Python CLI 仍保留原有支援範圍。

全部頁面完成、單元檢查及進度一致性檢查通過後，才在同一筆資料庫交易中發佈新字庫。失敗保留上次完整字庫；重複的並行請求不能覆蓋較新的狀態。工作有效期限為一天，超過後選重新開始。

使用 API 釋義，不呼叫翻譯或 AI 服務。中文教學課程（含 Duolingo 的 zh／zs／zt 代碼）的釋義及單元標題由 OpenCC JavaScript（`cn → twp`，對應本機 `s2twp`）轉成臺灣繁體；新同步的字庫保存轉換結果，既有字庫在 API 讀取時補轉，不需要重新同步或遷移資料庫。其他教學語言、單字原文、ID 與學習紀錄不變。日文新字沒有讀音時，瀏覽器會分批查詢目前頁面的待補單字，將確認的假名與羅馬拼音接回單字表、詳情與練習；純假名單字直接轉寫。字典讀音快取依帳號在本機保存 30 天，換裝置會重新查詢。查不到或有歧義時隱藏讀音文字，保留 Duolingo 音訊；多種字典讀音放在詳情，不猜測課程漢字讀音。初始字庫若已包含假名與羅馬拼音，後續相同字會保留。單元查詢未能證明篩選有效時，歸到「尚未確認單元」。

此處的同步功能負責 Duolingo 字庫。多人版另以 `/api/study` 自動同步收藏、筆記、FSRS 複習紀錄與設定，依穩定單字 ID 保留；衝突、離線與跨裝置操作見 [MULTI_USER.md](MULTI_USER.md)。

## 部署與既有資料

正式環境使用 `duolingo-vocab` Worker、`duolingo-vocab-db` D1 與自訂網域，沒有使用 Pages 部署流程。自動部署與手動部署步驟見 [WORKERS_DEPLOY.md](WORKERS_DEPLOY.md)，帳號、Secrets 與跨裝置資料見 [MULTI_USER.md](MULTI_USER.md)。

建置不攜帶私人字庫；每位使用者登入後連接自己的 Duolingo 並同步。舊 `scripts/seed_catalog.py` 僅適用單人模式的 `catalogs`，不能用來初始化多人帳號字庫。從舊本機網站搬移學習紀錄，請先備份，再匯入正式帳號。

## 架構

開發與建置使用 Node.js 24 以上，先執行 `npm ci`。Worker 原始碼為 TypeScript，`npm run build:cloud` 會先檢查型別再打包；原 `python scripts/cloud_build.py` 指令仍相容。

- `server/accounts/`、`server/multi-user.ts`：多人帳號、憑證與登入驗證；`server/basic-auth.ts` 保留舊單人模式。
- `server/worker.ts`：薄路由入口，先驗證登入才提供任何資源。
- `server/sync/duolingo.ts`：固定來源 API、憑證檢查與連線錯誤。
- `server/sync/domain.ts`：真實技能、分頁驗證、候選單元與字庫轉換。
- `server/sync/enrichment.ts`：OpenCC 繁體轉換與舊字庫讀取相容處理；轉換表隨 Worker 打包，不需額外服務。
- `server/sync/user-repository.ts`：依帳號與連線隔離的 D1 儲存、版本檢查、原子發佈；`repository.ts` 保留單人模式。
- `server/sync/incremental.ts`：技能結果沿用與回退核對。
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

查詢按需執行；Worker 的記憶體快取最多 32 筆／8 MB，保存至多七天，冷啟動可能清空。429 限流會依 Retry-After 暫停該上游的新請求，既有快取可讀。字典功能不需新增 D1 表、API 金鑰或環境變數。新增程式需建置與部署才會套用到線上；是否會在 push 後自動執行，取決於 [Workers Builds 設定](WORKERS_DEPLOY.md)。
