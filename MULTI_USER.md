# 多人帳號與個人 Duolingo 連線

多人版提供邀請碼註冊、登入／登出、個人 Duolingo 憑證更新／解除連接、各自字庫與可接續同步。連接後動態取得語言課程清單，在「帳號與 Duolingo → 啟用課程」勾選要使用的課程並儲存。首次只啟用目前課程；「更新清單」保留選擇，新加入的課程不會自動啟用。取消啟用保留字庫和學習紀錄。

課程只顯示語言名稱；同語言有多門課時以數字區別，各自保存單字與進度。同步前需手動在 Duolingo 切換到所選課程，網站不會代為切換。釋義沿用課程提供的教學語言，不會自動翻譯成中文。清單和字庫取決於 Duolingo 非官方 API 的回應，真實課程仍需部署後驗證；Python CLI 的原有課程限制不變。

## 啟用

若只想先在本機看畫面，可執行 `npm run preview`（需要支援 `node:sqlite` 的 Node 24）。開啟 `http://127.0.0.1:8766/account`，示範帳號 `demo`、密碼 `demo-study-12345`，已連接模擬 Duolingo 並載入範例字庫。註冊測試的邀請碼為 `browser-test-invitation-code`。此入口只監聽本機，使用記憶體資料庫及合成 API 回應，不連接真實 Duolingo；不要貼入真實憑證。停止再啟動後帳號資料會重設。此示範不需要 Cloudflare 或安裝額外 npm 套件，勿當作正式部署入口。

`wrangler.jsonc` 已設定 `MULTI_USER = "true"`。部署前配置真正的 D1 Database ID，以及以下 Worker Secrets：

| Secret | 用途 |
| --- | --- |
| `CREDENTIAL_KEY` | 用密碼管理器或密碼學亂數產生 32 bytes，轉為 64 位十六進位文字。用於 AES-256-GCM 加密各用戶的 Duolingo 憑證，請保存於 Secret，勿寫入 Git。 |
| `REGISTRATION_CODE` | 至少 20 字元的隨機邀請碼，私下提供給預計加入的用戶；移除或設為空字串可關閉新註冊，不影響現有帳號登入。 |

建置 `python scripts/cloud_build.py`，沿用 `npx wrangler@4 deploy`。所有用戶須使用 HTTPS 網址。未配置 DB 或有效加密金鑰時，多人模式拒絕提供服務。請勿隨意更換 `CREDENTIAL_KEY`；若金鑰遺失或更換，現有用戶需重新提交 Duolingo 憑證。帳號頁 `/account` 沿用 Workers Assets 預設的 [HTML 路由規則](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)，不需額外重導向設定。

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

複習、收藏、筆記和 FSRS 個人參數仍在各自瀏覽器，跨裝置用備份／匯入。此版尚未包含忘記密碼、帳號刪除與管理介面，也未加入背景自動同步；同步時保持頁面開啟。實際 Duolingo 接受雲端請求與否需要部署後驗證。

執行 `node --test tests/*.test.mjs`、`python -m unittest discover -s tests -v`、`python scripts/cloud_build.py`、`node --check dist/_worker.js`。`tests/accounts.test.mjs` 使用合成憑證和 SQLite 驗證兩用戶端到端同步、會話撤銷、資料隔離、過期／跨站拒絕、加密儲存與舊備份相容。`python tests/browser_accounts_check.py` 會自行啟動隔離的 Worker 測試伺服器，以合成資料實測兩用戶的手機／桌面操作；需要 `.deps` 的 Playwright 與本機 Chrome。
