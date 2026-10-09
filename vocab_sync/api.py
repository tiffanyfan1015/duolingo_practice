"""HTTP transport and paginated learned-vocabulary queries."""
import json
import re
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from .errors import SyncError

ORIGIN = "https://www.duolingo.com"

class Client:
    def __init__(self, token):
        self.token = token

    def request(self, path, body=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = Request(ORIGIN + path, data=data, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        })
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            hints = {
                401: "登入失效，請更新 jwt_token。",
                403: "存取遭拒，可能需要重新登入、網站驗證，或此課程不提供該介面。請停止重試並回報狀態碼。",
                404: "此 API 路徑不可用；需要確認課程支援或介面變更。",
                429: "請求過於頻繁，請稍後再試。",
            }
            raise SyncError(f"HTTP {exc.code}：" + hints.get(exc.code, "伺服器拒絕請求。")) from None
        except (URLError, TimeoutError):
            raise SyncError("無法連線到 Duolingo，請確認網路後再試。") from None
        except (ValueError, UnicodeError):
            raise SyncError("API 沒有回傳有效 JSON，可能是登入頁或網站驗證。") from None



def fetch_words(client, user_id, course, skills, *, allow_empty=False):
    target, source = course.get("learningLanguage"), course.get("fromLanguage")
    if not all(isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_-]+", code) for code in (target, source)):
        raise SyncError("課程缺少有效的 learningLanguage / fromLanguage；未猜測語言代碼。")
    if not skills:
        raise SyncError("找不到可辨識的已學技能。已停止單字請求，避免把未知進度當成完整單字清單。")
    words, seen = [], set()
    start, expected = 0, None
    while start is not None:
        if not isinstance(start, int) or isinstance(start, bool) or start < 0 or start in seen or len(seen) >= 200:
            raise SyncError("API 分頁異常，已停止；不覆蓋之前的匯出。")
        seen.add(start)
        path = (f"/2017-06-30/users/{user_id}/courses/{target}/{source}/learned-lexemes"
                f"?limit=50&sortBy=LEARNED_DATE&startIndex={start}")
        page = client.request(path, {"lastTotalLexemeCount": 0, "progressedSkills": skills})
        if not isinstance(page, dict) or not isinstance(page.get("learnedLexemes"), list):
            raise SyncError("API 回傳格式已改變：缺少 learnedLexemes。")
        batch, pagination = page["learnedLexemes"], page.get("pagination")
        if not isinstance(pagination, dict) or "nextStartIndex" not in pagination:
            raise SyncError("API 缺少分頁資訊，無法確認匯出是否完整。")
        if any(not isinstance(word, dict) or not isinstance(word.get("text"), str) for word in batch):
            raise SyncError("API 單字格式不符合預期，未儲存不完整資料。")
        total = pagination.get("totalLexemes")
        if isinstance(total, int):
            if expected is not None and expected != total:
                raise SyncError("同步期間單字總數發生變化，請學習結束後重新同步。")
            expected = total
        words.extend(batch)
        start = pagination["nextStartIndex"]
        if start is not None and (not batch or not isinstance(start, int) or start <= max(seen)):
            raise SyncError("API 分頁未前進，已停止同步。")
        print(f"已讀取 {len(words)} 個單字項目", flush=True)
        if start is not None:
            time.sleep(0.3)
    if expected is not None and len(words) != expected:
        raise SyncError(f"只取得 {len(words)} / {expected} 個單字項目，未覆蓋之前的匯出。")
    if not words and not allow_empty:
        raise SyncError("API 回傳零個單字；尚不能確認此課程支援，未覆蓋之前的匯出。")
    return words

