"""Formal word details: synthetic API data, no personal records or live dictionary requests."""
import json
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.deps'))
from playwright.sync_api import sync_playwright

JA = '''<h2>日語</h2><h3>動詞</h3><p><span class="headword-line"><strong class="headword" lang="ja"><ruby>食<rt>た</rt></ruby>べる</strong> 他動詞 一段</span></p>
<ol><li>維持生計<ol><li>靠某工作維生</li></ol></li><li>吃<dl><dd><span lang="ja">パンを食べる。</span><dl><dd>吃麵包。</dd></dl></dd></dl></li><li>古語：吃喝</li></ol>
<h4>活用</h4><table><tr><th>敬體</th><td>食べます</td></tr><tr><th>接續</th><td>食べて</td></tr></table>
<img src="https://unexpected.test/track" onerror="window.injected=true"><script>window.injected=true</script>
<h2>德語</h2><h3>名詞</h3><ol><li>不應混入</li></ol>'''
DE = '''<h2>德語</h2><h3>動詞</h3><p><span class="headword-line"><strong class="headword" lang="de">sprechen</strong> 助動詞 haben</span></p><ol><li>說話<dl><dd><i lang="de">Ich spreche Deutsch.</i><dl><dd><span class="e-translation">我說德語。</span></dd></dl></dd></dl></li><li>宣布</li></ol><h4>變位</h4><table><tr><th>過去分詞</th><td>gesprochen</td></tr><tr><th>現在式</th><td>er spricht</td></tr></table>'''

JA = JA.replace('維持生計', '维持生计').replace('吃麵包。', '吃面包。')
DE = DE.replace('說話', '说话').replace('我說德語。', '我说德语。')

def word(text, language, meaning):
    return {'id': language + ':' + text, 'text': text, 'meanings': [meaning], 'units': ['u1'], 'audio': None}

catalog = {'courses': [
    {'id': 'ja', 'language': 'ja', 'name': '日文', 'units': [{'id':'u1','title':'測試單元'}], 'words': [word('食べます','ja','吃'),word('エラー','ja','測試'),word('未找到','ja','測試')]},
    {'id': 'de', 'language': 'de', 'name': '德文', 'units': [{'id':'u1','title':'測試單元'}], 'words': [word('sprechen','de','說話')]},
    {'id': 'fr', 'language': 'fr', 'name': '法文', 'units': [{'id':'u1','title':'測試單元'}], 'words': [word('bonjour','fr','你好')]},
]}
gate = threading.Event()
calls = []
failures = {'エラー': 0}

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/api/catalog':
            return self.reply(catalog)
        if url.path == '/api/sync/status':
            return self.reply({'available': False})
        if url.path != '/api/dictionary':
            return super().do_GET()
        query = parse_qs(url.query)
        term, provider = query['term'][0], query['provider'][0]
        calls.append((provider, term))
        if term == '食べます':
            gate.wait(10)
        if term == 'エラー':
            failures[term] += 1
            if failures[term] == 1:
                return self.reply({'error':'temporary'},502)
        if provider == 'jisho':
            if term == '時':
                return self.reply({'data':[
                    {'japanese':[{'word':'時','reading':'とき'}],'senses':[{'parts_of_speech':['Noun'],'english_definitions':['time']}]},
                    {'japanese':[{'word':'時','reading':'じ'}],'senses':[{'parts_of_speech':['Suffix'],'english_definitions':["o'clock"]}]},
                ]})
            return self.reply({'meta': {'status':200}, 'data': [{'japanese':[{'word':'食べる','reading':'たべる'}], 'senses':[{'parts_of_speech':['Ichidan verb']}]}] if term == '食べます' else []})
        if term in ['食べる','sprechen']:
            return self.reply({'parse':{'title':term,'revid':123,'text':JA if term == '食べる' else DE}})
        return self.reply({'error':{'code':'missingtitle'}})

    def reply(self, data, status=200):
        body = json.dumps(data,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

server = ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'web')))
thread = threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
        page = browser.new_page(viewport={'width':1440,'height':1100})
        errors, external = [], []
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://unexpected.test/**',lambda route:(external.append(route.request.url),route.abort()))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.locator('[data-detail="ja:食べます"]').click()
        page.locator('#note').fill('查詢中輸入的筆記')
        gate.set()
        page.locator('.dictionary-entry').wait_for()
        assert page.locator('#detail [data-reading-word]').inner_text().strip() == 'たべます'
        assert page.locator('#note').input_value() == '查詢中輸入的筆記'
        audio = page.locator('#detail [data-audio]').bounding_box()
        divider = page.locator('#detail .detail-block').first.bounding_box()
        assert divider['y'] - (audio['y'] + audio['height']) >= 16
        assert page.locator('.dictionary-sense h5').first.inner_text() == '吃'
        assert '吃麵包。' in page.locator('.dictionary-example').inner_text()
        assert '不應混入' not in page.locator('#dictionary-content').inner_text()
        assert '其他意思' in page.locator('.other-meanings summary').inner_text()
        page.locator('.other-meanings summary').click()
        assert '維持生計' in page.locator('.other-meanings').inner_text()
        assert '靠某工作維生' in page.locator('.other-meanings').inner_text()
        assert '古語：吃喝' in page.locator('.other-meanings').inner_text()
        assert not page.evaluate('Boolean(window.injected)') and not external
        assert 'ます形（禮貌形）' in page.locator('.dictionary-form-cards').inner_text()
        page.locator('#save-note').click()
        page.locator('#detail').evaluate('(el)=>el.scrollTop=0')
        (ROOT/'artifacts').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT/'artifacts/dictionary-detail-desktop.png'))
        page.locator('.close').click()
        old_count=len(calls)
        assert page.locator('.word-table [data-reading-word="ja:食べます"]').inner_text().strip() == 'たべます'
        page.locator('[data-detail="ja:食べます"]').click()
        page.locator('.dictionary-entry').wait_for()
        assert page.locator('#note').input_value() == '查詢中輸入的筆記'
        assert len(calls)==old_count
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#detail').evaluate('(el)=>el.scrollTop=0')
        page.screenshot(path=str(ROOT/'artifacts/dictionary-detail-mobile.png'))
        assert page.locator('#detail').evaluate('(el)=>el.scrollWidth <= el.clientWidth')
        page.locator('summary').filter(has_text='完整詞形變化').click()
        assert page.locator('#detail').evaluate('(el)=>el.scrollWidth <= el.clientWidth')
        page.locator('.close').click()
        page.locator('[data-detail="ja:エラー"]').click()
        page.locator('[data-dictionary-retry]').wait_for()
        page.locator('#note').fill('重試不清空')
        page.locator('[data-dictionary-retry]').click()
        page.locator('.dictionary-status').filter(has_text='暫時沒有').wait_for()
        assert page.locator('#note').input_value()=='重試不清空'
        page.locator('.close').click()
        # Late response for a closed word must not overwrite another word or About.
        page.reload()
        gate.clear()
        page.locator('[data-detail="ja:食べます"]').click()
        page.locator('.close').click()
        page.locator('[data-lang="de"]').click()
        page.locator('[data-detail="de:sprechen"]').click()
        page.locator('.dictionary-entry').wait_for()
        gate.set()
        page.wait_for_timeout(300)
        assert page.locator('.dictionary-entry-heading h4').inner_text()=='sprechen'
        assert page.locator('.dictionary-sense h5').first.inner_text()=='說話'
        assert page.locator('.example-translation').inner_text()=='我說德語。'
        page.locator('summary').filter(has_text='完整詞形變化').click()
        assert '第三人稱單數' in page.locator('.dictionary-table-scroll').inner_text()
        page.locator('.close').click()
        page.locator('[data-lang="fr"]').click()
        old_count=len(calls)
        page.locator('[data-detail="fr:bonjour"]').click()
        page.locator('.dictionary-status').filter(has_text='此語言').wait_for()
        assert len(calls)==old_count
        # Nested layout tables and synonym lists from source markup must not be flattened.
        nested = ''.join(f'<table><tr><th colspan="2">{label}</th></tr><tr><th>主格</th><td>{form}</td></tr></table>' for label,form in [('原級','hoch'),('比較級','höher'),('最高級','höchste')])
        fixtures = [
            ('hoch','de','<h2>德語</h2><h3>形容詞</h3><ol><li>高</li></ol><h4>變格</h4><table><tr><td>'+nested+'</td></tr></table>'),
            ('ビール','ja','<h2>日語</h2><h3>名詞</h3><ol><li><span class="defdate">（自1724年）</span>啤酒<dl><dd><span lang="ja">日本麦酒</span><dl><dd>日本啤酒</dd></dl></dd><dd><span class="nyms">近義詞：僅用於複合詞 <span lang="ja">ビア</span></span></dd></dl></li></ol>'),
        ]
        protected = page.evaluate('''async () => {
          const {parseDictionaryPage}=await import('/src/services/dictionary-parser.mjs');
          return parseDictionaryPage({parse:{title:'図書館',revid:1,text:'<h2>日語</h2><h3>名词</h3><p><span class="headword-line"><strong class="headword" lang="ja"><ruby>図書館<rt>としょかん</rt></ruby></strong></span></p><ol><li>图书馆<dl><dd><span lang="ja">図書館で本を読む。</span><dl><dd class="e-translation">在图书馆看书。</dd></dl></dd></dl></li></ol>'}},'ja')[0];
        }''')
        assert protected['lemma']=='図書館'
        assert protected['pos']==['名詞']
        assert protected['senses'][0]['glosses']==['圖書館']
        assert protected['senses'][0]['examples'][0]['text']=='図書館で本を読む。'
        assert protected['senses'][0]['examples'][0]['translation']=='在圖書館看書。'
        if '--cached-examples' in sys.argv:
            for title,language in [('hoch','de'),('ビール','ja'),('Gebäude','de'),('Stadtzentrum','de')]:
                payload=json.loads((ROOT/'artifacts'/f'{title}-source.json').read_text(encoding='utf-8'))
                fixtures.append((title,language,payload['parse']['text']))
        for index,(title,language,html) in enumerate(fixtures):
            parsed=page.evaluate('''async ({title,language,html})=>{
                const {parseDictionaryPage}=await import('/src/services/dictionary-parser.mjs');
                const {dictionaryView}=await import('/src/ui/views/dictionary.mjs');
                const {detailView}=await import('/src/ui/views/word-detail.mjs');
                const candidates=parseDictionaryPage({parse:{title,revid:1,text:html}},language);
                const word={id:'fixture',text:title,meanings:[],units:[]};
                document.querySelector('#detail-body').innerHTML=detailView(word,{record:{},language,course:{name:language==='de'?'德文':'日文',units:[]}});
                document.querySelector('#dictionary-content').innerHTML=dictionaryView({status:'ready',candidates},word);
                return candidates;
            }''',{'title':title,'language':language,'html':html})
            if title=='hoch':
                assert len(parsed[0]['formTables'])==3
                assert all(len(t['rows'])>1 for t in parsed[0]['formTables'])
                page.locator('summary').filter(has_text='完整詞形變化').click()
                assert page.locator('.dictionary-table-scroll table').count()==3
            if title=='ビール':
                assert [e['text'] for e in parsed[0]['senses'][0]['examples']]==['日本麦酒']
                assert 'ビア' not in page.locator('.dictionary-example').inner_text()
                assert '用法示例' in page.locator('.dictionary-example').inner_text()
                page.locator('.dictionary-related summary').click()
                assert '複合詞' in page.locator('.dictionary-related').inner_text()
            if title in ['Gebäude','Stadtzentrum']:
                page.locator('.dictionary-grammar summary').click()
                assert '中性名詞（das）' in page.locator('.dictionary-grammar').inner_text()
                page.locator('summary').filter(has_text='完整詞形變化').click()
            assert page.locator('#detail').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            page.set_viewport_size({'width':1440,'height':1100})
            page.locator('#detail').evaluate('(el)=>el.scrollTop=0')
            page.locator('#detail').screenshot(path=str(ROOT/'artifacts'/f'dictionary-content-{index}.png'))
            page.set_viewport_size({'width':390,'height':844})
            assert page.locator('#detail').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        # New cloud words fill readings automatically, then reuse the cache on reload.
        catalog['courses'][0]['words'][0]['readingPending'] = True
        fresh = browser.new_page(viewport={'width':390,'height':844})
        fresh.on('pageerror',lambda e:errors.append(str(e)))
        fresh.goto(f'http://127.0.0.1:{server.server_port}')
        fresh.wait_for_function('document.querySelector(\'[data-reading-word="ja:食べます"]\')?.textContent.includes("たべます")')
        fresh.locator('#romaji').check()
        assert 'tabemasu' in fresh.locator('[data-reading-word="ja:食べます"]').inner_text()
        old_count = len(calls)
        fresh.reload()
        fresh.wait_for_selector('.word-table')
        assert 'たべます' in fresh.locator('[data-reading-word="ja:食べます"]').inner_text()
        assert len(calls) == old_count
        fresh.locator('#search').fill('食べます')
        fresh.locator('[data-mode="flash"]').click()
        fresh.locator('#start').click()
        assert 'たべます' in fresh.locator('#content [data-reading-word]').inner_text()
        # Ambiguous words keep the Duolingo audio control and expose readings only in details.
        catalog['courses'][0]['words'] = [{**word('時','ja','時間'), 'readingPending':True, 'audio':'https://d1vq87e9lcf771.cloudfront.net/test.mp3'}]
        ambiguous = browser.new_page(viewport={'width':390,'height':844})
        ambiguous.on('pageerror',lambda e:errors.append(str(e)))
        ambiguous.goto(f'http://127.0.0.1:{server.server_port}')
        ambiguous.locator('[data-detail="ja:時"]').wait_for()
        assert not ambiguous.locator('.word-table [data-reading-word]').is_visible()
        assert '讀音待補' not in ambiguous.locator('body').inner_text()
        assert ambiguous.locator('.word-table [data-audio]').is_visible()
        ambiguous.locator('[data-detail="ja:時"]').click()
        ambiguous.locator('.dictionary-reading-card').first.wait_for()
        assert ambiguous.locator('.dictionary-reading-card h5').all_text_contents() == ['とき','じ']
        assert '接尾詞' in ambiguous.locator('.dictionary-readings').inner_text()
        assert ambiguous.locator('#detail [data-audio]').is_visible()
        assert not ambiguous.locator('#detail [data-reading-word]').is_visible()
        assert ambiguous.locator('#detail').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        ambiguous.locator('#detail').screenshot(path=str(ROOT/'artifacts/dictionary-readings-mobile.png'))
        assert not errors,errors
        browser.close()
finally:
    gate.set()
    server.shutdown()
    server.server_close()
print('Dictionary browser passed: all senses, inflection lookup, examples, inert HTML, draft preservation, cache, retry, stale responses, notes, unsupported languages and mobile tables.')
