# GitHub → Cloudflare Workers 部署

目前優先使用 Workers + Static Assets + D1。`wrangler.jsonc` 預設啟用多人模式，請先依 [多人部署與移轉指引](MULTI_USER.md) 設定 `CREDENTIAL_KEY`／`REGISTRATION_CODE`；以下 `owner`、`SITE_PASSWORD` 與 `DUOLINGO_JWT` 步驟只適用 `MULTI_USER="false"` 的單人模式。尚未因本次修改建立雲端資源或部署。

1. Cloudflare 建立 D1 資料庫，名稱使用 `duolingo-vocab-db`。複製 Database ID。
2. 修改專案 `wrangler.jsonc`：將 `REPLACE_WITH_D1_DATABASE_ID` 換成真實 Database ID；若資料庫名称不同，一併改 `database_name`。Database ID 不是密碼，可隨設定提交；不要填帳號 ID。
3. 將程式連同 `wrangler.jsonc` 推到自己的 GitHub 私人 repository，保留 `.gitignore`。
4. Cloudflare 建立 Worker、連接該 GitHub repository，選正式分支。Worker 名稱應與設定的 `cijian-private` 相同（也可以兩邊一起改名）。
   - Build command：`python3 scripts/cloud_build.py`
   - Deploy command：`npx wrangler@4 deploy`
   - Root directory：專案位於 repository 最外層時留空或用介面預設值。
   - 不用填写 Pages 的 output directory 欄位，資源目錄已由 `wrangler.jsonc` 指定為 `dist`。
5. 在 Worker 的 Settings → Variables and Secrets 設定 **Secret**：
   - `SITE_PASSWORD`：至少 20 字元的隨機專用密碼，登入帳號固定 `owner`。
   - `DUOLINGO_JWT`：Duolingo 憑證。不要放在 GitHub 或前端。
   若介面需要先部署才能設定 Secret，第一次顯示 503「Private site is not configured yet」是預期的保護行為。設定後依介面儲存／部署，使新版本生效。
6. 查看 Worker 的 Bindings，確認 `DB` 指到自己的 D1，`ASSETS` 已存在。之後修改 D1 綁定也要更新 `wrangler.jsonc`，避免下次 Git 部署覆蓋設定。
7. 手機開啟 Cloudflare 顯示的正式 `https://...workers.dev` 網址，使用 `owner` + 網站專用密碼登入。初始字庫可能為空；先在 Duolingo 切到德文，再於網站同步德文，日文同樣操作。

安全設定：`run_worker_first: true` 使所有靜態資源先通過登入；不能只對 `/api/*` 啟用。建置輸出的 `.assetsignore` 排除舊 Pages 伺服器生成檔。不要改成只上傳靜態檔，否則登入及同步後端不會運作。

驗證：未登入時網站與 `/api/catalog` 應要求登入；登入後能載入網站。完成一次德文／日文同步，關閉電腦後再用手機重新開啟。Duolingo 是否接受 Cloudflare IP 仍需真實部署驗證，403 不是程式測試可以排除的限制。

多人版的 FSRS 個人參數與複習紀錄已支援同帳號跨裝置同步；需要從舊本機網址備份再匯入正式網址一次。部署後請在兩台裝置登入同一帳號，確認筆記、收藏與一次複習可同步。`/api/study` 會自動建立所需 D1 表，不需要新 Secret 或付費訓練服務。正式單字詳情亦已整合按需字典 API。

官方文件：
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/d1/get-started/
