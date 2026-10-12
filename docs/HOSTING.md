> 新專案請使用 [Workers 部署指引](WORKERS_DEPLOY.md)。以下 Pages 說明保留作歷史參考。

# 不依賴電腦開機的手機使用方式

目前的 `python serve_web.py --lan` 是由電腦提供網站，因此電腦關機後手機無法重新開啟網站。把靜態網站部署到雲端，即可在電腦關機時用手機網路／Wi-Fi 學習。

## 已準備好的上線檔案

```powershell
python scripts/package_site.py
```

產生 `artifacts/cijian-site.zip`，只包含網站程式、FSRS 模組及 `web/data.json` 單字庫；不包含 Duolingo 登入權杖、原始匯出、瀏覽器複習備份或 Python 工具。這個指令只打包，不會上傳。

## 代管方式

Cloudflare Pages 的 Direct Upload 可以從控制台上傳 ZIP，取得 `https://專案名稱.pages.dev` 網址。不需要自己的網域，也不需要讓電腦持續開機。

上線前需決定網站是否公開：目前網站没有登入保護；若希望只有本人能查看單字庫，需要先配置存取保護並驗證，包括 `data.json`，再上傳個人字庫。Pages 的預覽部署保護不等於正式網址已受保護。

選擇公開上線時，在 Cloudflare 的 Workers & Pages 建立 Pages Direct Upload 專案，上傳上述 ZIP 並部署。後續更新單字庫後，重新打包並部署至同一個正式網址。直接上傳專案日後若要改用 Git 自動部署，需要另建專案。

## 搬移紀錄

1. 在舊網站按「備份複習紀錄」。
2. 用手機開啟新的正式 HTTPS 網址。
3. 匯入剛才的備份，確認紀錄後繼續學習。

不同網址的瀏覽器儲存空間彼此獨立，舊紀錄不會自動出現在新網址。網站上線後，複習資料仍存在手機瀏覽器；並不因此有跨裝置自動同步。

網站代管與離線使用是兩件事：目前需要手機有網路；音訊也需要網路。尚未加入離線快取或安裝型 PWA。未來可另外加入。

## 來源

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Pages 預覽部署與存取保護](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

## 本次採用：私人 Cloudflare Pages

使用者已選擇只允許本人登入；Cloudflare 與 GitHub 都有帳號。此次可直接上傳，不需建立 GitHub 儲存庫。

部署順序：

1. 先用不含任何個人字庫的 `artifacts/cijian-bootstrap.zip` 建立網站。
2. Pages 設定啟用 Access policy。到 Access 應用設定把初始萬用字元 hostname 改為正式 `<project>.pages.dev`，並把允許名單限制為本人登入信箱。
3. 回到 Pages 再啟用預覽保護，確認 `*.<project>.pages.dev` 同樣只有本人可登入。
4. 未登入狀態下，正式網址、預覽網址與 `/data.json` 都應進入 Access 登入／拒絕頁，而不是讀到 bootstrap 資料。
5. 保護驗證完成後，才上傳 `artifacts/cijian-site.zip` 真正網站，並再次驗證匿名攔截與本人登入後能學習。

注意：不是只開啟「預覽部署保護」就完成。官方步驟見 [Enable Access on your pages.dev domain](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)。

## 更新：已改採網站專用密碼與手機同步

使用者拒絕 Zero Trust 的扣款授權，因此上面的 Zero Trust 部署流程不再採用。登入採伺服器 HTTP Basic 驗證，帳號 `owner`、密碼為 SITE_PASSWORD Secret。最新 GitHub → Cloudflare 與 D1 手機同步流程以 [CLOUD_SYNC.md](CLOUD_SYNC.md) 為準。不要把沒有 `_worker.js` 的純靜態 ZIP 當成私人網站部署。
