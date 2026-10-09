# Anki 式每日複習

## 採用的設計

Anki 將「筆記」和「卡片」分開：一份字詞資料可以產生不同方向的卡片，每張卡各有複習排程。本專案把 Duolingo 單字當作筆記，產生辨識（單字 → 中文）、回想（中文 → 單字）、聽力（聲音 → 單字）卡。預設只啟用辨識卡。

單元作為可選的牌組範圍，仍使用同一張卡片 ID；同字出現在兩個單元不會產生兩份記憶紀錄。德文與日文各有每日份量與設定。

## 操作

1. 網頁選「每日複習」，上方可選全部或特定單元。
2. 預設每天最多 10 張新卡、100 張複習卡，目標記憶率 90%。在「調整卡片與每日份量」修改。
3. 先回想再按「顯示答案」，依實際感受選重來／困難／良好／簡單。每個按鈕顯示下次出現間隔。
4. 空白鍵翻面，翻面後 1–4 評分，空白鍵選良好。輸入設定或開啟對話框時不啟動快捷鍵。
5. 延至明天會在裝置當地時間午夜解除；暫停需到「管理卡片」手動恢復。
6. 「撤銷上一步」還原最近一次評分、暫停或恢復，也還原評分紀錄、每日份量與同字卡片延後。重新整理或修改設定後無法撤銷。

忘記應選「重來」；「困難」仍表示答對，只是回想費力。學習中的到期卡優先，再安排到期複習卡、新卡。學習中的短間隔卡不受每日複習上限限制。等待短間隔卡時，頁面顯示下次到期時間，到時間按「重新檢查」。

開啟「同字卡片延後」時，回答一張卡會將同一個字的其他新卡／複習卡延至明天，避免剛看見的答案直接提示另一張卡；已進入短間隔學習的卡不受影響。

## 排程與資料

- 使用 MIT 授權 `ts-fsrs` 5.4.2（FSRS），固定版本並將瀏覽器模組與授權放入 `web/vendor/`。網站無須 CDN 或 npm 服務即可執行。
- FSRS 採預設模型參數；新卡學習步驟 1 分鐘、10 分鐘，遺忘後重新學習步驟 10 分鐘。不加入間隔隨機擾動。
- 每張卡保存 due、stability、difficulty、reps、lapses 等完整模型狀態，頁面重新整理後繼續使用。
- 舊自由練習紀錄保留。辨識卡首次使用每日複習前沿用舊到期日；第一次新評分時初始化 FSRS，不虛構過往記憶參數。之後自由練習與每日卡片分別排程。
- 每日複習使用 `cijian-review-v1`，原本的收藏、筆記及自由練習使用 `cijian-progress-v1`。
- 備份 schemaVersion 2 同時包含兩者；仍可匯入 schemaVersion 1 舊備份。匯入合併相同 ID 的較新紀錄，並去除重複評分紀錄。
- 不同裝置仍需手動備份／匯入；資料存在各自瀏覽器中。合併備份不是即時同步，也無法解決兩台裝置同時學習所產生的所有衝突。

## 與完整 Anki 的差異

這一版實作 Anki 的核心記憶工作流程，並非完整相容客戶端。尚未提供 AnkiWeb 同步、`.apkg` 匯入匯出、挖空卡、自訂 HTML 模板、圖片遮罩或依個人歷史最佳化 FSRS 參數。牌組範圍沿用目前的 Duolingo 單元，不支援任意巢狀牌組。間隔與 Anki 的完整排程細節可能不同。

## 開發與驗證

```powershell
npm ci --ignore-scripts
node scripts/vendor-fsrs.mjs
node --test tests/*.test.mjs
# 啟動 python serve_web.py 後：
python tests/browser_check.py
python tests/browser_review_check.py
```

領域規則在 `domain/cards.mjs`、`review-queue.mjs`、`review-state.mjs`；模型轉接在 `services/fsrs-scheduler.mjs`；持久化在 `services/review-store.mjs`；備份格式組裝在 `services/collection-backup.mjs`；每日流程在 `review-controller.mjs`；畫面在 `ui/views/review.mjs`。入口維持薄層。

## 參考

- [Anki 筆記、卡片與牌組](https://docs.ankiweb.net/getting-started)
- [Anki 學習、四種評分、延後與暫停](https://docs.ankiweb.net/studying.html)
- [Anki 牌組選項與 FSRS](https://docs.ankiweb.net/deck-options)
- [ts-fsrs 官方程式庫](https://github.com/open-spaced-repetition/ts-fsrs)
