# 專案架構

本專案採用原生 ES modules 與 Python package，依責任分層。新增功能沿用以下邊界；不將 HTML、業務規則、儲存或 API 呼叫放回入口檔。

## 前端

```text
web/app.js                       組裝依賴與啟動
web/src/app-controller.mjs        應用流程、目前語言／模式／練習狀態
web/src/domain/
  learning.mjs                   答案正規化、複習排程
  session.mjs                    建立題組、揭示答案、推進題目
  vocabulary.mjs                 搜尋、單元與狀態篩選
web/src/services/
  catalog.mjs                    載入字庫
  progress-store.mjs             localStorage、資料清理、進度更新、備份合併
  browser-files.mjs              瀏覽器檔案讀取／下載
  audio.mjs                      音訊與装置語音的生命週期
web/src/ui/
  dom.mjs                        DOM 選取與通知
  events.mjs                     一次性事件綁定，轉送應用操作
  shell.mjs                      DOM 輸入讀取、頁面框架與內容掛載
  views/                         單字表、練習、詳情、說明的純 HTML 模板
web/styles/                      基礎、版面、元件、響應式樣式
```

依賴方向：入口組裝 controller 與 services；controller 呼叫 domain、services、ui；views 只處理呈現。domain 不讀取 DOM、localStorage、網路或全域應用狀態。views 不註冊事件、不更新進度、不讀取瀏覽器儲存。

狀態分為兩類：controller 擁有短期 UI／題組狀態；progress-store 擁有需持久保存的學習紀錄、收藏、筆記、設定。視圖拿到明確參數，不能直接修改儲存資料。事件只綁定一次，不隨重新渲染重複安裝。

既有 localStorage key `cijian-progress-v1`、單字 ID 與備份 schemaVersion 1 保留，重構不要求清除使用者紀錄。`web/learning.mjs` 是舊路徑相容匯出，新程式使用 domain 路徑。

## Python 資料流程

```text
duolingo_sync.py                  CLI 入口
build_web.py                      字庫建置入口與本機依賴初始化
serve_web.py                      限定 web/ 的靜態伺服器
vocab_sync/
  cli.py                         參數、隱藏輸入權杖、同步流程
  auth.py                        JWT 欄位與過期檢查，不保存權杖
  api.py                         HTTP transport、單字分頁
  course.py                      已學技能與課程單元解析
  export.py                      JSON／CSV 快照序列化
  mapping.py                     按技能探查與候選單元推論
  dataset.py                     快照一致性驗證、網站資料轉換
  enrichment.py                  OpenCC／pykakasi 函式庫轉接
  errors.py                      共用錯誤型別
```

資料流：Duolingo → API → 本機匯出／單元驗證 → dataset → `web/data.json`。網站不接收 Duolingo 權杖。Python 內部不可反向 import 根目錄 CLI；`unit_mapping.py` 僅保留舊 import 路徑相容性。

字庫轉换透過注入 enricher，避免把文字轉換函式庫與檔案驗證混在一起。原有 `python duolingo_sync.py`、`python build_web.py`、`python serve_web.py` 指令不變。

## 修改與驗證

- 練習規則改 domain，搭配 Node 純函式測試。
- 匯入或儲存格式改 progress-store，必須驗證舊格式相容與新舊紀錄合併。
- 視覺改 views／styles，事件改 events；功能流程改 controller。
- API 或課程欄位變更只改 Python 對應模組，維持 CLI 薄入口。
- 外部 API 測試不使用真實權杖；mock transport、合成資料測試錯誤與分頁。
- 前端整合測試使用獨立無頭瀏覽器，驗證桌面／手機流程，不使用使用者的 Chrome 個人資料。

```powershell
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python build_web.py
# 先啟動 python serve_web.py，再執行：
python tests/browser_check.py
```

## 每日複習擴充

- `domain/cards.mjs` 定義單字筆記衍生的三種卡片與穩定 ID；`review-queue.mjs` 計算每日份量、到期順序與單元範圍；`review-state.mjs` 負責資料驗證。
- `services/fsrs-scheduler.mjs` 隔離 ts-fsrs 及 Date 序列化；`review-store.mjs` 擁有卡片、設定、評分紀錄與單步撤銷；`collection-backup.mjs` 組合新舊備份格式。
- `review-controller.mjs` 擁有每日複習流程，透過 app-controller 接入原有導覽；`ui/views/review.mjs` 只生成 HTML，事件仍集中於 `ui/events.mjs`。
- `web/vendor/` 保存鎖定版本的 FSRS 瀏覽器模組與 MIT 授權，由 `scripts/vendor-fsrs.mjs` 從 npm 套件產生。
- 保留原 localStorage key；新的 `cijian-review-v1` 與備份 schemaVersion 2 增加卡片排程，仍可匯入 schemaVersion 1。
- 詳見 [ANKI_DESIGN.md](ANKI_DESIGN.md)，新增驗證：`tests/review.test.mjs`、`tests/browser_review_check.py`。

## 雲端同步與部署

`server/courses/` 分離課程探索與啟用規則、版本化設定儲存、API 流程。`user_course_settings` 按使用者及連線隔離；同步資料表的 language 欄位保存穩定課程 key，實際目標語言另存 language／learningLanguage。既有中文教學德文、日文保留 de／ja key，新課程使用上游課程 ID 形成獨立 key。前端 `domain/languages.mjs` 統一語言名稱及語音代碼，`ui/views/courses.mjs` 純呈現動態課程切換。停用課程不刪除資料，所有課程停用時顯示設定入口；備份 schema 保持相容。

多人版本見 [MULTI_USER.md](MULTI_USER.md)。`server/accounts/` 分開加密、資料庫、帳號流程與 HTTP 路由；`server/multi-user.mjs` 組裝登入與資源保護。`sync/user-repository.mjs` 提供以用戶及連線分區的同步儲存，沿用原同步 service／domain。`account-controller`、`account-client`、`ui/account-events`、`ui/views/account` 分別處理前端流程、HTTP、事件與純呈現。雲端多人版允許在專用帳號表單提交 Duolingo 憑證，後端驗證並加密保存，取代早期單人網站不接收憑證的限制。原 Python CLI 仍不保存憑證。

新增 server/ 分層，詳見 [CLOUD_SYNC.md](CLOUD_SYNC.md)。Duolingo API transport、同步領域規則、D1 repository、流程 service、HTTP routes 各自分開；worker 是登入與路由薄入口。前端同步亦拆成 controller／service／view。`scripts/cloud_build.py` 生成單一部署 Worker，不能將生成檔當作原始碼維護。私人字庫與憑證不進 GitHub。

## 個人模型與資料驗證工具

- `learning_tools/optimizer.py` 負責完整歷史、按單字分割訓練／驗證資料、官方訓練套件轉接。`scripts/optimize_fsrs.py` 是 CLI 薄入口，`scripts/fsrs-weights.mjs` 用網站鎖定的排程器驗證參數。
- `domain/fsrs-model.mjs` 驗證版本、語言、參數範圍；沿用 review-store 的語言設定保存參數與既有備份格式。review-controller 組織匯入／重設，事件與呈現維持分層。
- `vocab_sync/pilot/` 分成 download（來源與快取完整性）、sources（詞典解析）、japanese（純活用規則）、report（抽樣與 HTML／JSON 報告）。`scripts/validate_vocabulary.py` 是薄入口。候選資料不寫回正式字庫；後續正式補充資料另建儲存層。
- 私人備份與產出置於既有忽略的 data/、artifacts/；公開字典快取也不加入 Git。
