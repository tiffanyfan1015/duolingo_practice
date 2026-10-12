import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from vocab_sync.pilot.dictionary_api import DictionaryAPI
from vocab_sync.pilot.wiki_parser import parse_entry
from vocab_sync.pilot.report import build_report

HTML = '''<h2>日語</h2><h3>動詞</h3>
<p><span class="headword-line"><strong class="headword" lang="ja"><ruby>食<rp>(</rp><rt>た</rt><rp>)</rp></ruby>べる</strong> 他動詞 一段</span></p>
<ol><li>吃<dl><dd><span lang="ja"><ruby>寿司<rt>すし</rt></ruby>を食べる。</span><dl><dd><span lang="la">sushi o taberu</span></dd><dd>吃寿司。</dd></dl></dd></dl></li><li>維持生計</li></ol>
<h4>活用</h4><table><tr><th rowspan="2">禮貌形</th><td lang="ja">食べます</td></tr><tr><td>現在式</td></tr></table>
<h2>古高地德語</h2><h3>動詞</h3><ol><li>不應混入</li></ol>'''
PAYLOAD = {'parse': {'title': '食べる', 'revid': 123, 'text': HTML}}


class DictionaryAPITests(unittest.TestCase):
    def test_nested_layout_tables_preserve_individual_inflections(self):
        tables = ''.join(f'<table><tr><th colspan="2">{label}</th></tr><tr><th>主格</th><td>{form}</td></tr></table>'
                         for label, form in [('原級', 'hoch'), ('比較級', 'höher'), ('最高級', 'höchste')])
        html = '<h2>德語</h2><h3>形容詞</h3><ol><li>高</li></ol><h4>變格</h4><table><tr><td>' + tables + '</td></tr></table>'
        c = parse_entry({'parse': {'title': 'hoch', 'text': html}}, 'de')[0]
        self.assertEqual([t['label'] for t in c['formTables']], ['原級', '比較級', '最高級'])
        self.assertEqual([t['rows'][1][1]['text'] for t in c['formTables']], ['hoch', 'höher', 'höchste'])

    def test_synonyms_are_not_examples_and_keep_usage_restrictions(self):
        html = '''<h2>日語</h2><h3>名詞</h3><ol><li><span class="defdate">（自1724年）</span>啤酒
        <dl><dd><span lang="ja">日本麦酒</span><dl><dd>日本啤酒</dd></dl></dd>
        <dd><span class="nyms">近義詞：僅用於複合詞 <span lang="ja">ビア</span></span></dd></dl></li></ol>'''
        sense = parse_entry({'parse': {'title': 'ビール', 'text': html}}, 'ja')[0]['senses'][0]
        self.assertEqual(sense['glosses'], ['啤酒'])
        self.assertEqual([e['text'] for e in sense['examples']], ['日本麦酒'])
        self.assertEqual(sense['related'], ['近義詞：僅用於複合詞 ビア'])

    def test_alternative_pos_heading_and_line_breaks(self):
        payload = {'parse': {'title': 'test', 'revid': 5, 'text': '<h2>德语</h2><h3>叹词</h3><ol><li>測試</li></ol><h4>变位</h4><table><tr><th>ii</th><td>a<br>b</td></tr></table>'}}
        c = parse_entry(payload, 'de')[0]
        row = c['formTables'][0]['rows'][0]
        self.assertEqual(row[0]['text'], '虛擬二式')
        self.assertEqual(row[1]['text'], 'a / b')

    def test_language_sense_example_ruby_and_table_boundaries(self):
        result = parse_entry(PAYLOAD, 'ja', lambda s: s.replace('寿', '壽'))
        self.assertEqual(len(result), 1)
        c = result[0]
        self.assertEqual(c['lemma'], '食べる')
        self.assertEqual(c['readings'], [{'text': 'たべる'}])
        self.assertEqual([s['glosses'] for s in c['senses']], [['吃'], ['維持生計']])
        e = c['senses'][0]['examples'][0]
        self.assertEqual(e['text'], '寿司を食べる。')
        self.assertEqual(e['translation'], '吃壽司。')
        self.assertEqual(c['formTables'][0]['rows'][0][0]['rowspan'], 2)
        self.assertIn('oldid=123', c['source']['url'])
        self.assertEqual(parse_entry(PAYLOAD, 'de'), [])

    def test_inflected_lookup_rejects_unrelated_jisho_hit_and_caches(self):
        calls = []
        def get(url):
            calls.append(url)
            query = parse_qs(urlparse(url).query)
            if 'jisho.org' in url:
                return {'data': [
                    {'japanese': [{'word': '食べるラー油'}], 'senses': [{'parts_of_speech': ['Noun']}]},
                    {'japanese': [{'word': '食べる', 'reading': 'たべる'}], 'senses': [{'parts_of_speech': ['Ichidan verb']}]}]}
            return PAYLOAD if query['page'] == ['食べる'] else {'error': {'code': 'missingtitle'}}
        with tempfile.TemporaryDirectory() as folder:
            api = DictionaryAPI(folder, transport=get)
            c = api.lookup('食べます', 'ja')
            self.assertEqual(c[0]['lemma'], '食べる')
            self.assertEqual(len(calls), 3)
            self.assertEqual(api.lookup('食べます', 'ja'), c)
            self.assertEqual(len(calls), 3)
            self.assertEqual(api.lookup('bonjour', 'fr'), [])
            self.assertEqual(len(calls), 3)

    def test_api_failure_is_visible_and_never_downloads_a_dump(self):
        with tempfile.TemporaryDirectory() as folder:
            def get(url):
                raise OSError('offline')
            api = DictionaryAPI(folder, transport=get)
            catalog = {'courses': [{'id': 'ja', 'words': [{'id': '1', 'text': '食べる', 'meanings': ['吃']}]}]}
            report = build_report(catalog, {}, limit=1, api=api)
            self.assertEqual(report['words'][0]['status'], 'lookup-error')
            self.assertIn('offline', report['words'][0]['lookupError'])
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_api_errors_are_not_cached_as_misses(self):
        with tempfile.TemporaryDirectory() as folder:
            api = DictionaryAPI(folder, transport=lambda url: {'error': {'code': 'ratelimited'}})
            with self.assertRaisesRegex(ValueError, 'ratelimited'):
                api.lookup('食べる', 'ja')
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_malformed_api_response_is_an_error_not_a_dictionary_miss(self):
        with tempfile.TemporaryDirectory() as folder:
            api = DictionaryAPI(folder, transport=lambda url: {})
            with self.assertRaisesRegex(ValueError, '缺少詞條內容'):
                api.lookup('食べる', 'ja')


if __name__ == '__main__':
    unittest.main()
