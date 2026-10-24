# 專案架構

本專案採用 TypeScript Worker、原生 JavaScript ES modules 前端與 Python package，依責任分層。新增功能沿用以下邊界；不將 HTML、業務規則、儲存或 API 呼叫放回入口檔。

## TypeScript 與建置

- `server/**/*.ts` 使用 strict mode；`server/types.ts` 定義 Worker 環境、帳號、課程、字庫和同步工作。D1 與 Fetcher 使用 Cloudflare 官方型別，外部 API 回應保留 `unknown` 並由 domain 驗證。
- `shared/study.ts` 定義跨裝置紀錄及 API 契約；`domain/study-validation.mjs` 與 `services/study-client.mjs` 使用 `@ts-check` 與 JSDoc 引用。其餘前端 JS 尚未全面型別化，瀏覽器不直接載入 `.ts`，也不需要先建置才能啟動原有 Python 靜態網站。
- `tsconfig.json` 檢查後端；`tsconfig.browser.json` 檢查上述前端模組，分開 Workers 與 DOM 全域型別。`npm run typecheck` 同時檢查兩者。
- Node.js 24 以上可直接執行測試所匯入的 `.ts`；`package.json` 明確使用 ESM。型別 import 使用 `import type`，不使用需要額外轉換的 enum 或 parameter properties。
- `scripts/cloud-build.mjs` 先執行兩套型別檢查，再用 esbuild 打包 Worker，按允許清單複製靜態檔。`scripts/cloud_build.py` 是保留原指令與 `build()` 介面的薄包裝；先安裝 `npm ci`。`npm run test:build` 驗證實際產出的 Worker 登入、D1 學習同步與資源清單。
- `wrangler.jsonc` 指向 `server/worker.ts`，Workers 部署由 Wrangler 編譯；Pages 相容產物為 `dist/_worker.js`。資料表、localStorage key、備份 schema 不因語言遷移改變。

## 前端

主流程 `app-controller` 不直接查詢或修改 DOM。應用層的帳號提示、同步區域與背景重繪的草稿保留集中在 `ui/application-shell.mjs`；HTML 模板仍放 `ui/views`，事件仍經 `ui/events` 轉送 controller。

`dictionary-controller.mjs` 透過注入的 client 與呈現 callback 管理請求版本；切換詞條、關閉詳情或開啟說明會使舊請求失效。它不操作 DOM、不儲存筆記，也不自行發送 HTTP。

`shared/vocabulary.ts` 是前後端共用的字庫型別，`shared/practice.ts` 定義自由練習與單字進度。`learning.mjs`、`session.mjs`、`vocabulary.mjs` 保留瀏覽器可直接載入的模組格式，透過 JSDoc 與 `@ts-check` 接受嚴格 TypeScript 檢查。型別不取代匯入資料的執行期驗證。

複習預設值統一於 `domain/review-settings.mjs`，排程、資料清理與同步封包共用；原 `review-queue.mjs` 匯出保留相容。不要在同步程式另外複製預設值。

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

多人版本見 [MULTI_USER.md](MULTI_USER.md)。`server/accounts/` 分開加密、資料庫、帳號流程與 HTTP 路由；`server/multi-user.ts` 組裝登入與資源保護。`sync/user-repository.ts` 提供以用戶及連線分區的同步儲存，沿用原同步 service／domain。`account-controller`、`account-client`、`ui/account-events`、`ui/views/account` 分別處理前端流程、HTTP、事件與純呈現。雲端多人版允許在專用帳號表單提交 Duolingo 憑證，後端驗證並加密保存，取代早期單人網站不接收憑證的限制。原 Python CLI 仍不保存憑證。

新增 server/ 分層，詳見 [CLOUD_SYNC.md](CLOUD_SYNC.md)。Duolingo API transport、同步領域規則、D1 repository、流程 service、HTTP routes 各自分開；worker 是登入與路由薄入口。前端同步亦拆成 controller／service／view。`scripts/cloud_build.py` 生成單一部署 Worker，不能將生成檔當作原始碼維護。私人字庫與憑證不進 GitHub。

`server/sync/incremental.ts` 決定哪些已完成技能查詢可沿用，以及新／移除單字造成的重新核對；service 仍讀取完整單字清單，依技能 ID 選取未核對項目。沿用結果及 ID 保存在既有、依帳號與連線隔離的同步工作中，不新增資料表或改變學習紀錄。`restart=true` 強制完整同步；舊版未完成工作仍可接續，發布前的進度驗證與 revision 交易保護維持不變。

## 個人模型與資料驗證工具

- `learning_tools/optimizer.py` 負責完整歷史、按單字分割訓練／驗證資料、官方訓練套件轉接。`scripts/optimize_fsrs.py` 是 CLI 薄入口，`scripts/fsrs-weights.mjs` 用網站鎖定的排程器驗證參數。
- `domain/fsrs-model.mjs` 驗證版本、語言、參數範圍；沿用 review-store 的語言設定保存參數與既有備份格式。review-controller 組織匯入／重設，事件與呈現維持分層。
- `vocab_sync/pilot/` 分成 download（來源與快取完整性）、sources（詞典解析）、japanese（純活用規則）、report（抽樣與 HTML／JSON 報告）。`scripts/validate_vocabulary.py` 是薄入口。候選資料不寫回正式字庫；後續正式補充資料另建儲存層。
- 私人備份與產出置於既有忽略的 data/、artifacts/；公開字典快取也不加入 Git。

- 字庫驗證頁：`pilot/report.py` 負責抽樣與資料組合，`pilot/page.py` 為候選內容建立穩定指紋並包成私人獨立 HTML。呈現位於 `ui/views/validation.mjs`，事件位於 `ui/validation-events.mjs`，流程由 `validation-controller.mjs` 組織。`domain/validation.mjs` 驗證義項、P0 缺漏與匯入格式；獨立審核儲存由 `progress-store` 匯出的 `createValidationStore` 提供，實作在 `services/validation-store.mjs`。使用專屬備份種類及 key，與 FSRS 學習紀錄隔離。產出包含自動取得的字典候選與使用者保存的配對结果（兼容先前人工補充），不自動發布到正式字庫。

- 字典 API：`pilot/dictionary_api.py` 負責逐字 HTTP、限量與快取；`pilot/wiki_parser.py` 純解析來源 HTML 為文字資料，不執行或嵌入來源 HTML。`domain/morphology-labels.mjs` 純轉換常見詞形標籤。完整字典下載保留為明確指定的替代路徑，不自動觸發。

## 正式單字詳情與按需查字典

- `app-controller` 轉送詳情開啟、關閉與重試操作給 `dictionary-controller`；透過 shell 僅更新字典區域，不重繪筆記或讓已關閉詞條的舊回應覆蓋新內容。
- `services/dictionary-client.mjs` 負責同源 API、當次頁面快取與原形查詢流程；`dictionary-parser.mjs` 在不啟用內容的 template 中解析來源，再輸出文字資料。來源 HTML 永不掛到頁面上。
- `domain/dictionary.mjs` 提供保守的詞形比對、義項排序與中文表頭；不推測未取得的義項，不刪除其他意思。`ui/views/dictionary.mjs` 與 `styles/dictionary.css` 提供正式卡片、例句、折疊義項及詞形表。
- `server/dictionary/routes.ts` 提供固定上游、限量、限時、限流暫停與有界記憶體快取；必須先通過既有 Worker 登入驗證。本機 `vocab_sync/dictionary_http.py` 沿用 Python API transport 與七天快取，`serve_web.py` 僅組裝 handler。
- 字典內容不覆寫 Duolingo 字庫，也不寫入學習紀錄或備份；筆記仍經 progress-store 保存。正式頁不需要人工審核，獨立驗證工具仍保留供查詢品質檢查。
- 日文讀音由 `reading-controller.mjs` 分批補齊目前顯示的待補單字（最多兩個並行查詢）；只接受詞條或已驗證詞形配對的唯一假名，不把原形讀音直接當作活用形讀音。透過 progress-store 匯出的 `reading-store` 保存可丟棄的帳號分區字典快取（30 天、最多 2000 筆），不更改學習紀錄／備份格式。應用 controller 更新記憶體字庫，shell 僅更新讀音節點以保留筆記草稿。
- `services/language-tools.mjs` 封裝 OpenCC 與 WanaKana；由 `scripts/vendor-language.mjs` 產生自帶授權的靜態瀏覽器模組。字典解析只轉換中文文字，保留有語言標記的日文原文及外語例句。羅馬拼音由確認過的假名轉寫，不猜測漢字讀音。
- 單字表沒有確定假名時隱藏讀音文字，保留 Duolingo 播放按鈕。字典詳情另外呈現 Jisho 精確詞條／已驗證活用形的各種讀音與英文用法，依來源限制配對義項，排除不相關詞與百科義項；多種讀音不自動選一個寫回單字表。
- 驗證：`tests/dictionary.test.mjs`、`tests/test_dictionary_http.py`、`tests/browser_dictionary_check.py`（合成 API 回應、獨立瀏覽器）。

## 跨裝置學習紀錄

- `domain/study-sync.mjs` 純函式將學習資料拆為欄位、比較雲端基準／本機／遠端三個版本並驗證格式。筆記與收藏分開合併；FSRS 卡片狀態與模型保持完整。
- `services/study-store.mjs` 經 progress-store 匯出，負責帳號隔離的基準與待送日誌；progress/review store 的訂閱與同步替換維持原 key／備份相容。先持久保存同步日誌，再更新原 store，重啟時可修復中途停止的套用。
- `study-sync-controller` 組織 GET／版本条件 PUT 與衝突選擇，經 app-controller 接入；`services/study-client` 處理 HTTP，`ui/study-sync-events` 綁定事件，`ui/views/study-sync` 只產生 HTML。背景更新保留筆記草稿並使舊 FSRS 評分預覽失效。
- `server/study/repository` 用 D1 分塊保存、單次查詢讀取一致快照、atomic batch 條件更新；`routes` 只使用已驗證帳號，不接受指定他人 user ID。未修改舊字庫表或 ID，沒有雲端訓練。
- 驗證：`tests/study-sync.test.mjs`、`tests/browser_study_sync_check.py`。
