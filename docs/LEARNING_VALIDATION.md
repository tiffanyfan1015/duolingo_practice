# 個人模型與德日字庫驗證

## 1. 個人 FSRS 模型

這一版在電腦訓練，手機網站匯入結果後即可使用，複習不需要電腦保持開機。不是手機直接訓練，也不會把紀錄上傳第三方。需要 Python 3.11 與 Node.js；使用官方 `fsrs-rs-python==0.9.3`，輸出 FSRS-6 的 21 個參數，與目前 ts-fsrs 5.4.2 相容。

### 操作

1. 在你實際複習的手機網站按「備份」，將 JSON 傳到電腦，例如放在 `data/study-backup.json`。必須是含 `review.logs` 的 schemaVersion 2 完整備份；Duolingo 匯出的單字清單不能拿來訓練。
2. 在專案目錄執行（本次已安裝於 `.deps`，換電腦才需安裝）：

```powershell
python -m pip install --target .deps fsrs-rs-python==0.9.3
python scripts/optimize_fsrs.py data/study-backup.json --language de
python scripts/optimize_fsrs.py data/study-backup.json --language ja
```

3. 查看 `artifacts/fsrs-de.json` / `artifacts/fsrs-ja.json`：
   - `accepted: true`：新參數在保留資料上的 log loss 比目前模型低至少 0.001，可以匯入；數字越低越好。
   - `insufficient-history`：先繼續複習，不會產生可套用參數。
   - `no-validation-improvement`：維持目前參數，不強行套用。
4. 將通過的檔案傳回手機。在更新後的網站切換對應語言 →「每日複習」→「個人 FSRS 模型」→ 匯入參數檔。
5. 重新整理仍顯示「使用個人最佳化參數」。換語言不應跟著改變。需要時按「恢復預設參數」。參數也會包含在往後的完整學習備份中。

新參數從下一次評分開始使用；不清除收藏、筆記、歷史，也不立即改寫現有到期時間。既有卡片的記憶狀態會隨後續評分逐漸更新，沒有重播全歷史或批次重排。

### 訓練的限制與驗證

- 只使用這個網站的「每日複習」紀錄，德、日分開。舊簡單練習不偽造為 FSRS 紀錄。
- 必須有第一次學習（`wasNew`）開始的完整序列；不完整的舊卡排除。重複 ID 去重，相同 ID 不同內容會報錯。
- 約 20% 單字保留做驗證，同一字的不同方向卡不拆到訓練和驗證兩邊。
- 本站採保守門檻：至少 20 張卡、訓練 100 筆及驗證 20 筆跨 UTC 日期的複習，兩組都要有成功與忘記。這是本站門檻，並非 Anki 規定；只累積當天短間隔評分不夠。
- 短間隔紀錄保留在歷史裡，日期差採目前排程器的 UTC 日期規則。驗證使用實際的 JS 排程器重播，與目前參數比較，並未用同一批資料同時訓練和評分。
- 驗證改善不是未來記憶率的保證。每次拿新的真實紀錄重新訓練；不要把測試用合成紀錄匯入你的帳號。
- 目前學習紀錄與個人參數存在該瀏覽器的 localStorage；換裝置／網址需要完整備份還原，尚非雲端同步學習進度。

官方來源：https://github.com/open-spaced-repetition/fsrs-rs-python

## 2. 字典 API 驗證

預設逐字查詢 API，不下載整份字典，也不需要 Duolingo JWT：

```powershell
python scripts/validate_vocabulary.py --limit 3 --output artifacts/vocabulary-api
```

開啟 `artifacts/vocabulary-api/report.html`；同目錄 `report.json` 保存完整候選。省略參數時，從 `web/data.json` 每門課跨單元抽樣 20 字，輸出至 `artifacts/vocabulary-pilot`。可用 `--catalog path/to/catalog.json` 指定網站格式字庫。

### 來源與取得方式

- 德文、日文：透過中文維基詞典 MediaWiki API 取得展開後的詞條內容，解析原形、詞性、中文義項、來源例句／中文譯文、語法說明與中文詞形表。不是維基百科。
- 日文未命中時，以 Jisho API 查表記／原形；只有精確表記、讀音或已知活用規則吻合才追查中文詞條。不直接採用搜尋第一筆。
- 詞形表保留中文表頭、合併儲存格與字典原文；常用日文表頭顯示「ます形（禮貌形）」「て形（連接形）」等。下載版候選的常見英文詞形標籤也轉成中文。
- API 回應存於 `data/dictionaries/api-cache`，快取七天；請求循序執行、間隔至少一秒、每次最多 2 MB、逾時 20 秒。API 失敗顯示查詢錯誤，不假裝查無資料，也不自動改下載。
- 有安裝 OpenCC 時，中文釋義、譯文與表頭轉為繁中；沒有時保留來源中文。日文單字和例句不做簡繁轉換。
- 其他語言暫時保留 Duolingo 資料。此階段尚未實作德文一般變位反查；來源沒有的例句、中文翻譯及其他欄位保留缺漏，不要求使用者補寫。

### 驗證頁操作

釋義、例句與詞形直接顯示字典內容。選候選、勾選適用義項，再保存「採用／需修正／不採用」即可；只有核對備註是選填。發音繼續使用 Duolingo 音訊，無法播放時嘗試裝置語音。

缺漏提示只檢查來源資料是否存在，不代表語言品質已核可。「採用」確認義項配對，不要求先補齊資料。舊版手動補充仍保留在審核檔與折疊區中，不會因再次儲存而清空。

審核存在此瀏覽器的獨立儲存空間，請匯出審核 JSON 備份。相同候選內容版本可匯入並保留較新的紀錄；不同版本拒絕匯入，避免把舊判斷套用到不同詞條。本機 `file://` 儲存受瀏覽器限制，無法保存時會提示匯出。

API 在產生報告時執行；打開報告不會再次查字典。只有播放音訊和手動點選來源連結會使用網路。候選保留來源詞條、版本與授權連結；個人報告和快取不進 Git。

這個工具只產生獨立品質驗證頁，不修改正式字庫與學習紀錄。正式網站另有按需查詢的單字詳情，不需先完成這份人工審核。

### 必要時才使用下載版

既有完整字典檔仍可使用：

```powershell
python scripts/validate_vocabulary.py --source local
# 只有明確要下載整份資料時才執行（數百 MB）：
python scripts/validate_vocabulary.py --source local --download
```

`--german`、`--jmdict` 可指定原有資料檔。下載版維持 Kaikki 德文 Wiktionary 與 JMdict 日英資料，不能視為 API 中文內容的等價替代。舊版 `--download` 單獨使用仍會明確下載並切至本機來源。

來源：
- https://www.mediawiki.org/wiki/API:Parsing_wikitext
- https://zh.wiktionary.org/
- https://jisho.org/
- https://kaikki.org/dictionary/rawdata.html
- https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html

### 正式網站的單字詳情

執行 `python serve_web.py`，在單字表點選單字即可查詢。Duolingo 目前學到的意思保留在上方；字典釋義按用字重疊作保守排序，其他義項、子義項及古語等保留在可展開區塊。詞形先展示常用形式，完整表格可左右捲動。字典回傳的原文及中文翻譯直接呈現，來源缺少的內容不自行填造。

正式頁保留來源中文，可能包含簡體；Python 驗證頁才會在有 OpenCC 時做繁中轉換。開啟其他語言時仍只呈現 Duolingo 資料。德文可查去掉 der／die／das 的名詞候選，一般變位反查尚未實作。

本機和 Cloudflare 都經同源 `/api/dictionary` 代理，Cloudflare 沿用原有登入保護，不需新增金鑰或資料表。部署後新同步的單字也能按需查詢；不依賴預先下載／預先產生的個人字典檔。查詢失敗時可重試，限流暫停不等於查無資料。

## 3. 程式驗證

```powershell
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python serve_web.py
```

保留上面的網站伺服器視窗，另開 PowerShell：

```powershell
python tests/browser_review_check.py
python tests/browser_model_check.py
python tests/browser_validation_check.py
python tests/browser_dictionary_check.py
```

瀏覽器檢查使用獨立、無頭 Chrome；不讀取你的 Chrome 登入資料。需要既有 `.deps/playwright` 與 Chrome。新增測試涵蓋：訓練資料完整性、同字隔離、真實官方訓練與 JS 驗證、資料不足拒絕產生模型、匯入錯誤語言、參數備份與重載、恢復預設、德文詞形、日文 DTD／讀音限制、活用反查、報告 HTML 跳脫。

Cloudflare 使用新版功能需要重新部署：`python scripts/cloud_build.py` 會產生 `dist`；或透過既有 GitHub → Cloudflare 建置流程。此次不自動部署。

下載版抽樣補充（API 版尚未支援一般德文變位反查）：日文會先取最多 6 個以「ます」結尾的已學詞形，再跨單元補足 20 字，確保能檢查活用反查，不是只抽到名詞。這個挑選不依字典是否命中。德文「der／die／das + 名詞」可另外查去冠詞候選，會標為 article-stripped，冠詞是否正確仍由人工核對。

## 2026-10-11 API 小樣本結果

擴大到德日各 20 字的第一輪，德文 13 字有候選、7 字查無；日文 2 字有候選、1 字查無、17 字因 HTTP 429 未完成。這不是日文命中率，限流部分須稍後重試。已加入 Retry-After 暫停機制，避免連續重打受限上游。明細位於 `artifacts/vocabulary-api-expanded/report.json`，不進 Git。

限流後另以正式網站、本機代理及即時 API 完成實際查詢：sprechen 顯示 6 個義項，食べます 正確查回 食べる 並顯示 3 個義項。這是正式使用流程的端到端檢查，未把測試資料寫回字庫或學習紀錄。

日文、德文各三個已學單字，六個中四個取得候選：tschüss、Restaurant、つくります、ありがとうございます。片語 ich komme aus、があります 未命中，保持 Duolingo 基礎資料，未改用整份下載。此為小樣本可行性檢查，不代表完整字庫命中率。

另以逐字 API 回應產生 `artifacts/vocabulary-api/examples.html`，展示食べる、sprechen 的中文義項、例句與詞形表，驗證日文表記不被簡繁轉換，以及德文人稱標籤與手機橫向捲動。

## 2026-09-26 下載版歷史結果

這輪已用完整下載的真實字典與現有已學單字產生報告：

| 語言 | 抽樣 | 有候選 | 有來源例句 | 待人工補查 |
| --- | ---: | ---: | ---: | --- |
| 德文 | 20 | 19 | 19 | im Ausland（片語） |
| 日文 | 20 | 17 | 16 | が あります 的連寫項目「があります」、なかやま、ゴミばこ |

日文有 4 個樣本透過活用規則找到原形候選：つくります、食べます、たべます、します。沒找到的項目涉及片語、人名或書寫變體，先保留空白，不自行改寫成某個詞條。命中率不等於正確率；仍需依上面的人工檢查步驟確認詞義與教材程度。
