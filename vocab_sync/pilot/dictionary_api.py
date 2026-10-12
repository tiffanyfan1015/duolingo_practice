"""Bounded, cached per-word API lookups; never download dictionary dumps."""
import hashlib
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit
from email.utils import parsedate_to_datetime
from .japanese import conjugate
from .wiki_parser import parse_entry


class DictionaryAPI:
    def __init__(self, cache, transport=None, convert=lambda s: s):
        self.cache, self.transport, self.convert = Path(cache), transport, convert
        self.last_request = 0
        self.blocked_until = {}

    def get(self, endpoint, params):
        url = endpoint + '?' + urlencode(params)
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if path.exists() and time.time() - path.stat().st_mtime < 7 * 86400:
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                self.validate(endpoint, data)
                return data
            except (ValueError, OSError):
                pass
        if self.transport:
            data = self.transport(url)
        else:
            host = urlsplit(endpoint).hostname
            if self.blocked_until.get(host, 0) > time.time():
                raise ValueError('字典服務限流中，請稍後重試')
            time.sleep(max(0, 1 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            request = Request(url, headers={'User-Agent': 'DuolingoVocabularyPrototype/0.1 (per-word dictionary validation)', 'Accept': 'application/json'})
            try:
                with urlopen(request, timeout=20) as response:
                    body = response.read(2_000_001)
                    if len(body) > 2_000_000:
                        raise ValueError('字典 API 回應超過大小限制')
                    data = json.loads(body)
            except HTTPError as error:
                if error.code == 429:
                    raw = error.headers.get('Retry-After', '60')
                    try:
                        delay = int(raw) if raw.isdigit() else parsedate_to_datetime(raw).timestamp() - time.time()
                    except (ValueError, TypeError):
                        delay = 60
                    self.blocked_until[host] = time.time() + min(3600, max(1, delay))
                raise
        self.validate(endpoint, data)
        error = data.get('error', {})
        if error and error.get('code') != 'missingtitle':
            raise ValueError('字典 API 錯誤：' + str(error.get('code', 'unknown')))
        self.cache.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        temp.replace(path)
        return data

    @staticmethod
    def validate(endpoint, data):
        if not isinstance(data, dict):
            raise ValueError('字典 API 回應格式不符')
        if 'wiktionary' in endpoint and not data.get('error'):
            page = data.get('parse')
            if not isinstance(page, dict) or not isinstance(page.get('text'), (str, dict)):
                raise ValueError('字典 API 缺少詞條內容')
        if 'jisho.org' in endpoint:
            if not isinstance(data.get('data'), list) or data.get('meta', {}).get('status', 200) != 200:
                raise ValueError('Jisho API 回應格式或狀態不符')

    def wiki(self, text, language):
        payload = self.get('https://zh.wiktionary.org/w/api.php', {
            'action': 'parse', 'page': text, 'prop': 'text|revid', 'format': 'json',
            'formatversion': 2, 'redirects': 1, 'uselang': 'zh-tw'})
        return parse_entry(payload, language, self.convert)

    def lookup(self, text, language):
        if language not in {'ja', 'de'}:
            return []
        candidates = self.wiki(text, language)
        if candidates or language != 'ja':
            return candidates
        # Jisho resolves kana/inflected spellings only. Do not accept unrelated search hits.
        data = self.get('https://jisho.org/api/v1/search/words', {'keyword': text})
        lemmas = []
        for entry in data.get('data', [])[:5]:
            pos = [p for s in entry.get('senses', []) for p in s.get('parts_of_speech', [])]
            for spelling in entry.get('japanese', []):
                lemma = spelling.get('word') or spelling.get('reading', '')
                variants = {lemma, spelling.get('reading', '')}
                variants.update(f['form'] for f in conjugate(lemma, pos))
                variants.update(f['form'] for f in conjugate(spelling.get('reading', ''), pos))
                if text in variants and lemma != text and lemma not in lemmas:
                    lemmas.append(lemma)
        for lemma in lemmas[:3]:
            for candidate in self.wiki(lemma, language):
                candidate['match'] = 'Jisho 詞形／表記比對 → 中文維基詞典'
                candidate['lookupSource'] = 'https://jisho.org/search/' + urlencode({'keyword': text}).split('=', 1)[1]
                candidates.append(candidate)
        return candidates
