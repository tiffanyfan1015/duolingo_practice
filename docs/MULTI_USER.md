# 多人帳號與個人 Duolingo 連線

開發與建置使用 Node.js 24 以上。先執行 `npm ci` 安裝 TypeScript 與建置工具，再執行 `npm run build:cloud`；既有 `python scripts/cloud_build.py` 會呼叫同一套建置流程。

多人版提供邀請碼註冊、登入／登出、個人 Duolingo 憑證更新／解除連接、各自字庫與可接續同步。連接後動態取得語言課程清單，在「帳號與 Duolingo → 啟用課程」勾選要使用的課程並儲存。首次只啟用目前課程；「更新清單」保留選擇，新加入的課程不會自動啟用。取消啟用保留字庫和學習紀錄。

課程只顯示語言名稱；同語言有多門課時以數字區別，各自保存單字與進度。同步前需手動在 Duolingo 切換到所選課程，網站不會代為切換。釋義沿用課程提供的教學語言，不會自動翻譯成中文。清單和字庫取決於 Duolingo 非官方 API 的回應，真實課程仍需部署後驗證；Python CLI 的原有課程限制不變。

## 啟用

正式 Worker、自訂網域、GitHub 自動部署的設定與啟用狀態，統一見 [WORKERS_DEPLOY.md](WORKERS_DEPLOY.md)。以下說明帳號與 Secrets；完成這些設定不代表已連接 Git 自動部署。

若只想先在本機看畫面，可執行 `npm run preview`（需要支援 `node:sqlite` 的 Node 24）。開啟 `http://127.0.0.1:8766/account`，示範帳號 `demo`、密碼 `demo-study-12345`，已連接模擬 Duolingo 並載入範例字庫。註冊測試的邀請碼為 `browser-test-invitation-code`。此入口只監聽本機，使用記憶體資料庫及合成 API 回應，不連接真實 Duolingo；不要貼入真實憑證。停止再啟動後帳號資料會重設。此示範不需要 Cloudflare 或安裝額外 npm 套件，勿當作正式部署入口。

`wrangler.jsonc` 已設定 `MULTI_USER = "true"`。部署前配置真正的 D1 Database ID，以及以下 Worker Secrets：

| Secret | 用途 |
| --- | --- |
| `CREDENTIAL_KEY` | 用密碼管理器或密碼學亂數產生 32 bytes，轉為 64 位十六進位文字。用於 AES-256-GCM 加密各用戶的 Duolingo 憑證，請保存於 Secret，勿寫入 Git。 |
| `REGISTRATION_CODE` | 至少 20 字元的隨機邀請碼，私下提供給預計加入的用戶；移除或設為空字串可關閉新註冊，不影響現有帳號登入。 |

建置 `python scripts/cloud_build.py`，沿用 `npx wrangler@4 deploy`。所有用戶須使用 HTTPS 網址。未配置 DB 或有效加密金鑰時，多人模式拒絕提供服務。請勿隨意更換 `CREDENTIAL_KEY`；若金鑰遺失或更換，現有用戶需重新提交 Duolingo 憑證。帳號頁 `/account` 沿用 Workers Assets 預設的 [HTML 路由規則](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)，不需額外重導向設定。

### 本機 Secret 檔案與正式上傳

根目錄 `.env.example` 是可提交的空白範本；複製成 `.env` 後填入上述兩個 Secret。`.gitignore` 已排除 `.env`、其他 `.env.*` 與 `.dev.vars*`，只有 `.env.example` 例外。不要將真實值填入範本。

Wrangler 本機開發支援 `.env`；若同時存在 `.dev.vars`，會優先使用 `.dev.vars` 而忽略 `.env`，請只選一種。`python serve_web.py` 與 `npm run preview` 並非正式 Worker 執行環境，不會因此載入正式帳號 Secret。

本機 `.env` 不會透過 GitHub 自動上傳。完成 Worker 建立、確認 `wrangler.jsonc` 指向正確 Worker 後，可以在自己的終端執行：

```powershell
npx wrangler@4 login
npx wrangler@4 secret bulk .env
```

第二個指令會上傳檔案內的 Secret 並部署生效；只在兩個值都已填妥時執行。後續一般 GitHub 部署不需重傳未變更的 Secret。也可沿用 Cloudflare 控制台逐一設定。`.env` 在本機仍是明文檔，Git 忽略不等於加密。

資料庫名稱使用 `duolingo-vocab-db`，`db` 代表 database。建立 D1 後將真正的 Database ID 填入 `wrangler.jsonc` 的 `database_id`；程式使用的 binding 名稱 `DB` 維持不變。修改本機設定不會建立或重新命名既有雲端資料庫。

官方說明：https://developers.cloudflare.com/workers/configuration/secrets/

多人模式不讀取全站 `DUOLINGO_JWT` 與 `SITE_PASSWORD`，也不提供共用的 `data.json`。新用戶初始字庫為空。進入 `/account` 建立Duolingo 單字庫帳號，按照頁面說明取得自己 Duolingo 的 `jwt_token`，連接成功後進入練習室同步。不是 Duolingo 官方 OAuth，需手動取得與更新憑證；不需要提供 Duolingo 密碼。

## 隔離與登入

- `app_users` 保存帳號、隨機 salt、PBKDF2-SHA256 密碼雜湊及加密的 Duolingo 憑證；不保存明文密碼。加密使用使用者 ID 作為 additional authenticated data，密文不能移至另一用戶使用。
- `app_sessions` 只保存隨機 session token 的 SHA-256 雜湊，7 天到期。Cookie 為 `__Host-`、HttpOnly、Secure、SameSite=Strict；登出即撤銷該次登入。
- 登入／註冊有每 IP 與每帳號的 15 分鐘嘗試限制，Duolingo 連接另有每用戶限制。寫入需同源 Origin、自訂標頭和 JSON；已有登入的個人操作另核對頁面所屬使用者 ID。
- `user_catalogs`、`user_sync_jobs` 以 `(user_id, connection_id, language)` 隔離。解除連接會清除憑證並更換 connection ID，進行中的舊同步即使稍後完成，也不能出現在新連線字庫中。舊字庫／工作資料仍留在資料庫，尚無定期清理工具。
- 每個Duolingo 單字庫帳號固定綁定一個 Duolingo ID；更新憑證需屬於同一個 Duolingo ID，以免同字 ID 的學習紀錄套用至另一人。另一個 Duolingo 帳號請建立另一個Duolingo 單字庫帳號。
- 瀏覽器紀錄沿用原始 schema 和備份，但加上 `cijian-user:<userId>:` 儲存命名空間。不同帳號不會自動繼承舊的單人紀錄。

加密與密碼衍生採用 [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)。PBKDF2 使用 100,000 次迭代以符合 Workers 執行環境；密碼至少 12 字元，建議使用密碼管理器產生獨立密碼。

## 舊資料移轉與回復

1. 切換前，從原單人網站備份複習紀錄；保留原網址的瀏覽器資料及 D1 備份。
2. 啟用多人模式，建立自己的Duolingo 單字庫帳號並連接相同 Duolingo 帳號，重新同步德文／日文字庫。
3. 用原有「匯入複習紀錄」匯入備份，schemaVersion 1／2 仍相容。單字 ID 保持不變。

舊 `catalogs`、`sync_jobs`、`cijian-progress-v1`、`cijian-review-v1` 都保留。需要回復單人模式時將 `MULTI_USER` 設為 `"false"`，並保留原本的 `SITE_PASSWORD`／`DUOLINGO_JWT`；多人資料不會回寫覆蓋單人資料。`scripts/seed_catalog.py` 仍只處理舊單人字庫。

## 目前範圍與驗證

同帳號的複習、收藏、筆記、羅馬拼音設定、每日份量與 FSRS 個人參數已支援跨裝置同步。登入練習室、切回頁面、恢復連線及修改後會自動同步；頁面顯示時另每 30 秒檢查更新。切換裝置或清除瀏覽器資料前，請確認「學習紀錄已同步」。字庫的 Duolingo 同步仍需手動啟動，並保持頁面開啟。

不同欄位的修改自動合併；同一筆記、設定或卡片狀態發生衝突時，顯示兩個版本，選擇保留此裝置或雲端的衝突內容，其餘變更照常合併。同時在兩台裝置複習同一張卡時，保留不同 ID 的評分歷史，但卡片排程需選擇一個版本，不宣稱可重播合成兩條排程。撤銷評分可同步刪除相應紀錄。背景同步不清空未儲存的筆記；其他裝置更新每日複習後，回到概況重新開始，避免使用舊的評分預覽。

離線時可在已開啟的頁面繼續操作，變更留在本機，恢復連線後補送；未實作離線安裝／首次載入。同步日誌保存在帳號專屬 `cijian-study-sync-v1`，包含雲端基準與待送資料，重新開啟後可繼續。瀏覽器空間不足或登入失效時明確提示，不顯示已同步。原學習 key、單字 ID、備份格式保持相容。從舊本地網址搬到正式網站仍需先匯出再匯入一次；正式網址各裝置用同一帳號即可同步。

後端 `/api/study` 使用既有登入與 D1，按使用者 ID 隔離，以版本條件寫入避免覆蓋；資料分塊儲存，初始化時自動建立 `user_study_state`、`user_study_chunks`。沒有新增 Containers、付費計畫或雲端訓練；仍受既有 Workers／D1 額度限制。單次同步上限 8 MB、100,000 個欄位；超過時保留本機資料並提示備份。尚未包含忘記密碼、帳號刪除與管理介面。實際 Duolingo 接受雲端請求與否需要部署後驗證。

新增同步驗證：`node --test tests/study-sync.test.mjs`、`python tests/browser_study_sync_check.py`。後者使用兩個獨立瀏覽器環境、真實 Worker 路由與測試 SQLite，不使用個人憑證。

執行 `node --test tests/*.test.mjs`、`python -m unittest discover -s tests -v`、`python scripts/cloud_build.py`、`node --check dist/_worker.js`。`tests/accounts.test.mjs` 使用合成憑證和 SQLite 驗證兩用戶端到端同步、會話撤銷、資料隔離、過期／跨站拒絕、加密儲存與舊備份相容。`python tests/browser_accounts_check.py` 會自行啟動隔離的 Worker 測試伺服器，以合成資料實測兩用戶的手機／桌面操作；需要 `.deps` 的 Playwright 與本機 Chrome。
