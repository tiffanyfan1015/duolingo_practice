"""Local website dictionary proxy. Reuse bounded API transport and its disk cache."""
import json
import threading
from http.server import SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit
from .pilot.dictionary_api import DictionaryAPI
from urllib.error import HTTPError


def dictionary_handler(root):
    api = DictionaryAPI(root / 'data/dictionaries/api-cache')
    lock = threading.Lock()

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            url = urlsplit(self.path)
            if url.path != '/api/dictionary':
                return super().do_GET()
            query = parse_qs(url.query)
            provider, term = query.get('provider', [''])[0], query.get('term', [''])[0].strip()
            if provider not in {'wiki', 'jisho'} or not term or len(term) > 120 or any(ord(c) < 32 or ord(c) == 127 for c in term):
                return self.send_json({'error': '查詢格式不正確。'}, 400)
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.send_json({'error': '請從單字庫查詢。'}, 403)
            if not lock.acquire(timeout=1):
                return self.send_json({'error': '字典查詢繁忙，請稍後重試。'}, 429)
            try:
                if provider == 'wiki':
                    data = api.get('https://zh.wiktionary.org/w/api.php', {
                        'action': 'parse', 'page': term, 'prop': 'text|revid', 'format': 'json',
                        'formatversion': 2, 'redirects': 1, 'uselang': 'zh-tw'})
                else:
                    data = api.get('https://jisho.org/api/v1/search/words', {'keyword': term})
                return self.send_json(data)
            except HTTPError as error:
                return self.send_json({'error': '字典查詢次數較多，請稍後重試。' if error.code == 429 else '字典暫時無法查詢，請稍後重試。'}, 429 if error.code == 429 else 502)
            except ValueError as error:
                return self.send_json({'error': '字典查詢次數較多，請稍後重試。' if '限流' in str(error) else '字典暫時無法查詢，請稍後重試。'}, 429 if '限流' in str(error) else 502)
            except OSError:
                return self.send_json({'error': '字典暫時無法查詢，請稍後重試。'}, 502)
            finally:
                lock.release()

        def send_json(self, data, status=200):
            body = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'private, no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler
