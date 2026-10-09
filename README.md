# Duolingo 單字同步原型

直接呼叫 Duolingo 的非官方 HTTP API，讀取目前課程的已學單字。支援檢查德文 `de`、日文 `ja`，來源語言從帳號資料讀取，不寫死中文代碼。

需要 Python 3.10 以上，不需安裝套件或 Chrome MCP。這是本機同步工具，尚未包含手機複習網站。

## 第一次使用

1. 在你自己的瀏覽器登入 Duolingo，選擇德文或日文課程。一般首頁即可，不需要 Words 頁面。
2. 按 F12 開啟開發者工具，選 **Application（應用程式）→ Storage → Cookies → https://www.duolingo.com**。
3. 找到 `jwt_token`，複製它的 **Value**。這是登入憑證，只在本機工具的隱藏提示貼上；不要貼到聊天或放在命令列參數。
4. 在自己的 PowerShell 執行：

```powershell
cd D:\project\duolingo_practice
python .\duolingo_sync.py --language de
```

提示輸入時貼上權杖再按 Enter。輸入不會顯示字元，程式不會將權杖儲存到檔案。用完可以清除剪貼簿。

若先想測試登入和課程格式：

```powershell
python .\duolingo_sync.py --language de --check
```

日文：先在 Duolingo 自行切到日文課程，再執行：

```powershell
python .\duolingo_sync.py --language ja
```

匯出存於 `data/exports/`，每次產生獨立的 JSON 與 UTF-8 BOM CSV。JSON 保留單字 API 回傳欄位；CSV 包含單字、原始翻譯、發音網址。翻譯仍是 API 原文，尚未轉成繁體中文。音訊只保存連結，未下載音檔。

進階使用可設定 `DUOLINGO_JWT` 環境變數；建議一般使用者採用隱藏輸入，避免權杖留在 shell 歷史。

## 能確認及尚未確認的事

- API 路徑和 Bearer 驗證方式已由開源實作核對，尚未以你的帳號實測。
- 單字讀取使用 POST 查詢；程式沒有任何課程切換、完成課程或提交答案的請求。
- 只傳遞帳號回傳的真實技能進度，不使用假造的完成次數。技能格式無法辨識時停止。
- 用 `nextStartIndex` 分頁；分頁重複、數量不符、零單字、登入失效或存取遭拒時停止，不覆蓋舊匯出。
- JSON 另存 API 可辨識的單元與技能索引，但沒有把單字猜配到單元。`wordUnitMapping` 保持 `unverified`。
- 單字是否完整、中文來源課程是否可用、單字是否有可用的單元 ID，需用實際回應確認。
- 德文詞形、日文假名／羅馬拼音、例句與手機複習介面，屬於後續功能。

若失敗，只需回報「同步停止」的訊息和課程代碼，不需要提供權杖、Cookie 或完整網路紀錄。403 不能直接解讀為不支援中文課程，亦可能是網站驗證或存取限制。

## 驗證

### 實測單元對應

在 Duolingo 選好課程，並於自己的 PowerShell 執行：

```powershell
python .\duolingo_sync.py --language de --map-units
```

日文請切換課程後改用 `--language ja --map-units`。權杖仍然隱藏輸入、不儲存。驗證期間請暫停在 Duolingo 做題或切換課程。

此模式會重新取得完整單字作為基準，再用每個已學技能的真實進度各別查詢同一個 `learned-lexemes` API，每個技能間隔一秒。每個技能可能有多頁；會比普通同步多出數十個請求，不會修改進度。連續前三個技能若都回傳完整字庫，就提前停止，避免無效請求。

結果是 `data/exports/*-unit-probe.json`，與原始單字匯出分開。每完成一個技能便寫入紀錄，失敗也會保留已完成的查詢；重跑會建立新報告，不會接續舊查詢。

- `runStatus: completed` 表示全部查詢結束且結束時課程與技能進度一致。
- `analysis.status: filter_supported` 表示不同技能回傳了不同的非空子集，支持篩選假設；不是官方單字歸屬證明。
- `filter_not_demonstrated` 表示至少三個技能都回傳完整字庫，沒有證據支持按技能篩選。
- `inconclusive` 表示證據不足（例如都回傳空集合），不建立對應。
- `inconsistent_results` 表示出現基準清單之外的字或文字無法唯一辨識，不建立對應。
- `incomplete_run` 表示中途錯誤或取消，保留查詢紀錄但不提供可用對應。
- `candidateMappings` 只列推定單元，保留多個可能單元；不猜第一次教學的單元。未涵蓋的單字保留為 `unmapped`。

完成後可以直接請我讀取報告判斷；不要提供 jwt_token。

### 離線測試

```powershell
python -m unittest discover -s tests -v
```

測試使用合成資料，不需要登入，不會呼叫 Duolingo。

## 參考來源

- [Owlcatraz API 原始碼](https://github.com/jlopez/owlcatraz/blob/main/extension/src/lib/duolingo.ts)：`/2023-05-23/users/{id}?fields=currentCourse`、Bearer 驗證、`learned-lexemes` 與分頁格式。此原型刻意不採用該專案的 99/99 進度替代值。
- [Duolingo Local 實作紀錄](https://jacobhans.net/posts/duolingo-local/)：單字、翻譯、音訊欄位的回傳實例。

本工具非 Duolingo 官方產品；內部 API 可能變更。

## 手機單字練習網頁

網站已包含：單元篩選、完整單字表（可選全部展開）、遮住中文、搜尋、收藏、筆記、翻卡、拼字、聽力、簡單間隔複習、紀錄備份與匯入、日文羅馬拼音開關。

首次建置依賴（僅裝入專案資料夾）：

```powershell
python -m pip install --target .deps -r requirements-web.txt
python build_web.py
```

每次重新匯出並完成單元驗證後，再執行 `python build_web.py` 更新網站字庫。匯出與單元驗證的單字集合必須一致，否則停止建置。

電腦使用：

```powershell
python serve_web.py
```

開啟 http://127.0.0.1:8765 。伺服器只提供 `web/`，不提供登入權杖、原始匯出或程式碼。

手機使用：先停止上面的伺服器（Ctrl+C），再執行：

```powershell
python serve_web.py --lan
ipconfig
```

手機與電腦連接同一個 Wi-Fi，在手機開啟 `http://電腦的區網IPv4:8765`。電腦需要保持開機、伺服器執行中；若 Windows 防火牆詢問，只針對可信任的私人網路允許 Python。網站沒有部署到網際網路，沒有離線音訊快取或雲端帳號同步。

複習資料存在瀏覽器 localStorage，以語言和單字共用一份紀錄。不同裝置不會自動同步；用「備份複習紀錄」與「匯入複習紀錄」搬移。清除網站資料會清除紀錄。

中文是 OpenCC s2twp 轉換的繁體原始釋義，尚未人工校訂。日文假名／羅馬拼音由 pykakasi 轉換，多音字可能需要修正，請搭配原始音訊。完整冠詞、複數、動詞變化與例句尚未補齊，單字詳情會明確提示，不把生成內容當成確定資料。

拼字與聽力忽略大小寫、全半形及多餘空白，但保留德文變音符號。日文接受原文及自動轉換的平假名。存在其他正確答案時，可以自行標為記得。每次回答後都要選擇記得／再練，才會更新紀錄。

記得依序排到 1、3、7、14、30 天後；忘記排到 10 分鐘後。待複習不包含還沒練過的字，選「尚未練習」即可開始新字。

額外驗證：`node --test tests/learning.test.mjs`。瀏覽器整合測試為 `tests/browser_check.py`，需要本機伺服器與安裝在 `.deps` 的 playwright，使用獨立無頭 Chrome，不使用你的登入瀏覽器。

## 程式架構

開發前請閱讀 [ARCHITECTURE.md](ARCHITECTURE.md)。前端採 domain／services／ui／controller 分層；Python 實作集中於 `vocab_sync/` 的各職責模組，根目錄指令只作為入口。後續新增功能請依此架構放置，規範亦記錄於 `AGENTS.md`。

## 每日複習（Anki 式）

新增「每日複習」頁籤，使用 FSRS 排程，提供四種評分、辨識／回想／聽力獨立卡片、每日新卡上限、單元牌組、同字卡片延後、暫停與撤銷。請見 [操作與設計說明](ANKI_DESIGN.md)。原有翻卡、拼字與聽力屬於自由練習，保留原排程；每日複習有獨立卡片紀錄。新版備份包含兩種紀錄，並接受舊備份。

一般使用者不用安裝 npm；瀏覽器所需的 FSRS 模組已放在 `web/vendor/`。開發時要重建該模組才執行 `npm ci --ignore-scripts` 與 `node scripts/vendor-fsrs.mjs`。

## 手機雲端同步

新增各自帳號與 Duolingo 連線，部署預設啟用多人模式，設定與既有資料移轉請見 [MULTI_USER.md](MULTI_USER.md)。個人字庫在雲端隔離；複習紀錄仍按帳號存於各自瀏覽器。

新增手機同步按鈕與可接續的雲端 API，部署／Secret／D1 設定及限制請見 [CLOUD_SYNC.md](CLOUD_SYNC.md)。GitHub 儲存庫由使用者自行建立。Cloudflare Git 建置命令為 `python3 scripts/cloud_build.py`，輸出 `dist`，不包含個人單字檔。

## 個人模型與補充資料小批驗證

詳見 [LEARNING_VALIDATION.md](LEARNING_VALIDATION.md)：官方 FSRS-6 個人參數訓練、手機匯入／恢復預設、德日各 20 字的字典與例句候選報告。
