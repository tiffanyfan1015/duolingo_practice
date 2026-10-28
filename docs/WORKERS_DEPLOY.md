# GitHub → Cloudflare Workers 部署

正式網站使用 Workers + Static Assets + D1，多人模式已啟用。設定以根目錄 `wrangler.jsonc` 為準。

| 項目 | 設定 |
| --- | --- |
| GitHub | `tiffanyfan1015/duolingo_practice` |
| 正式分支 | `main` |
| Worker | `duolingo-vocab` |
| 網址 | https://duo-vocab.tiffanyfan.com |
| D1 | `duolingo-vocab-db`，binding 為 `DB` |
| 靜態資源 | `dist`，binding 為 `ASSETS` |

## 自動部署

選用 Cloudflare Workers Builds 直接連接 GitHub，無須另外加入 GitHub Actions 部署 workflow。同一正式環境只使用一條自動部署流程，避免重複部署。

**設定狀態（2026-10-27）**：尚未啟用。現有 Cloudflare 工具連線可查詢建置，但建立 repository connection 被拒絕，缺少 `workers-ci.write`（Workers CI Write）。須重新授權後完成設定，或依下列步驟在控制台連接。提交這份文件不會啟用自動部署。

| Builds 欄位 | 預定值 |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm ci && npm test && npm run test:build` |
| Deploy command | `npx wrangler@4 deploy` |
| Build variable | `NODE_VERSION=24` |
| Branch includes | `main` |
| Path includes | `*` |

建置會安裝依賴、執行 Node 測試、型別檢查及部署產物整合測試。通過後才部署，失敗時正式網站保留原版本。其他分支不部署至正式環境。Workers 不需填 Pages 的 output directory；資源目錄已寫在 `wrangler.jsonc`。

啟用後的流程：**修改 → commit → push 到 main → 等待 Build 與 Deploy 成功**。只有本機 commit 不會觸發；push 成功也不代表部署成功。

### 首次連接或重新設定

1. 在 Cloudflare 開啟既有的 `duolingo-vocab` → Settings → Builds → Connect repository。
2. 選 GitHub 的 `tiffanyfan1015/duolingo_practice`；若尚未授權，讓 Cloudflare GitHub App 存取這個儲存庫。
3. 設定上表欄位，選用有效的 Cloudflare build token，設定建置變數 `NODE_VERSION=24`。
4. 儲存並執行第一次 build，確認部署 commit 與 GitHub `main` 相同。

Git 連線、trigger、build token 與建置變數是 Cloudflare 雲端設定，不會只因提交 `wrangler.jsonc` 自動建立。若改用 GitHub Actions，還需設定 Cloudflare API token／account ID，並停用原 Builds 正式部署觸發器。

## Worker Secrets 與資料

正式多人模式使用 `CREDENTIAL_KEY` 與 `REGISTRATION_CODE`，設定於 Worker → Settings → Variables and Secrets。它們不是建置變數，也不需放進 GitHub。請保留既有 `CREDENTIAL_KEY`，不要因部署重新產生；詳細規則見 [MULTI_USER.md](MULTI_USER.md)。

使用者在 `/account` 註冊、登入，並連接自己的 Duolingo。多人模式不使用共用 `owner` 帳號、`SITE_PASSWORD` 或 `DUOLINGO_JWT`。本機 `.env` 已被 Git 忽略，不會隨 push 上傳；未變更的正式 Secrets 不需每次重傳。

D1 的 ID 已設在 `wrangler.jsonc`，沿用既有資料庫即可；程式按需建立資料表。`dist/` 不包含個人字庫，使用者字庫與學習紀錄存在 D1。`run_worker_first: true` 使資源先經 Worker 登入與路由檢查。

## 手動部署與驗證

使用 Node.js 24，在根目錄執行：

```powershell
npm ci
npm test
npm run test:build
npx wrangler@4 deploy
```

首次使用 Wrangler 須先完成 `npx wrangler@4 login`。手動部署不會替你 commit／push；後續自動部署以 GitHub `main` 為準。

部署後確認：

1. Builds 顯示成功、commit 正確，Deployments 顯示新版本為 Active Deployment。
2. `/account` 可開啟，未登入的 `/api/catalog` 不可讀取私人字庫。
3. 登入後字庫與學習紀錄仍在，兩台裝置以同一帳號可同步。

Duolingo 是否接受雲端請求，仍需實際同步確認。部署程式與使用者按「同步 Duolingo」更新字庫是不同操作。

## 官方參考

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Builds 設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
