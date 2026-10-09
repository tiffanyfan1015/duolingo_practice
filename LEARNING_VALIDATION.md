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

## 2. 德文、日文各 20 字的補充資料驗證

在專案目錄執行：

```powershell
python scripts/validate_vocabulary.py --download
```

首次會下載 Kaikki 德文版 Wiktionary 原始 JSONL 和 JMdict 日英例句版，通常是數百 MB；資料來源大小會變動，程式驗證 gzip 完整性再接受快取。檔案存於 `data/dictionaries`，附來源 URL、下載時間及 SHA-256，不進 Git。中斷或檔案不完整時重新執行；不需 Duolingo JWT。

後續使用快取：

```powershell
python scripts/validate_vocabulary.py
```

輸出：

- `artifacts/vocabulary-pilot/report.html`：直接用瀏覽器打開，展開候選看內容。
- `artifacts/vocabulary-pilot/report.json`：同一份完整候選資料，含來源與待確認狀態。

預設從 `web/data.json` 的真實已學單字，跨單元穩定抽樣，每種語言 20 字，不只挑查得到的字。若要驗證不同字庫：

```powershell
python scripts/validate_vocabulary.py --catalog path/to/catalog.json --limit 20
```

catalog 必須是網站格式（`courses`），不是 Duolingo 的原始匯出快照；如尚無網站字庫，先執行 `python build_web.py`。

### 人工檢查方式

逐字記下「單字 ID、候選編號、通過／需修正／查無資料」，JSON 目前不會自動標為通過。

1. **詞義**：候選意思是否對應 Duolingo 這個用法？同字不同意思不能合併。
2. **德文**：查看 `tags` / `rawTags` / `forms` 的性別、冠詞、複數、現在式；查到的詞形是否回到正確原形。保留德文大小寫。
3. **日文**：檢查 `readings`、詞性、`restrictedTo`、`restrictedSpellings`、`restrictedReadings`。不要把「生」的所有讀音當成可互換。
4. **日文活用**：`rule:jmdict-pos-four-forms` 表示依字典詞性產生，並非字典原文。支援一段、常見五段、行く特例、ある否定、する、来る的四種常用形；沒有辨識到的特殊類型保持空白。活用可反查原形，例如 `食べます` → `食べる`。
5. **例句**：檢查是否是目標詞義、句子是否太難。德文例句來自 Wiktionary；日文例句來自 JMdict 內附 Tanaka 語料，保留句子來源 ID。目前未自動翻成繁中、未下載句子音訊；沒有例句的字仍空白。
6. **出處**：每筆候選保留來源、ID 或詞條網址與授權網址。若後續要重用或公開資料，需保留對應授權與署名。詞條候選不是品質已審核教材。

這一階段只產生報告，**不修改正式字庫、不上傳 Cloudflare、不覆寫學習紀錄**。待確認配對品質後，再實作獨立的補充資料表及正式單字卡介面，避免下次 Duolingo 同步蓋掉補充資料。

來源：
- https://kaikki.org/dictionary/rawdata.html
- https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html
- https://www.edrdg.org/edrdg/licence.html

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
```

瀏覽器檢查使用獨立、無頭 Chrome；不讀取你的 Chrome 登入資料。需要既有 `.deps/playwright` 與 Chrome。新增測試涵蓋：訓練資料完整性、同字隔離、真實官方訓練與 JS 驗證、資料不足拒絕產生模型、匯入錯誤語言、參數備份與重載、恢復預設、德文詞形、日文 DTD／讀音限制、活用反查、報告 HTML 跳脫。

Cloudflare 使用新版功能需要重新部署：`python scripts/cloud_build.py` 會產生 `dist`；或透過既有 GitHub → Cloudflare 建置流程。此次不自動部署。

本次抽樣補充：日文會先取最多 6 個以「ます」結尾的已學詞形，再跨單元補足 20 字，確保能檢查活用反查，不是只抽到名詞。這個挑選不依字典是否命中。德文「der／die／das + 名詞」可另外查去冠詞候選，會標為 article-stripped，冠詞是否正確仍由人工核對。

## 2026-09-26 實際資料結果

這輪已用完整下載的真實字典與現有已學單字產生報告：

| 語言 | 抽樣 | 有候選 | 有來源例句 | 待人工補查 |
| --- | ---: | ---: | ---: | --- |
| 德文 | 20 | 19 | 19 | im Ausland（片語） |
| 日文 | 20 | 17 | 16 | が あります 的連寫項目「があります」、なかやま、ゴミばこ |

日文有 4 個樣本透過活用規則找到原形候選：つくります、食べます、たべます、します。沒找到的項目涉及片語、人名或書寫變體，先保留空白，不自行改寫成某個詞條。命中率不等於正確率；仍需依上面的人工檢查步驟確認詞義與教材程度。
