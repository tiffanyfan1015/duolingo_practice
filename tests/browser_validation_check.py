"""Exercise the generated private HTML without a server or real vocabulary."""
import json
from pathlib import Path
import sys
import tempfile
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / '.deps'))
from playwright.sync_api import sync_playwright
from vocab_sync.pilot.page import render_report

candidate = {'lemma': '食べる', 'readings': [{'text': 'たべる'}],
             'source': {'name': 'Synthetic dictionary', 'url': 'https://example.com/word', 'licenseUrl': 'https://example.com/license'},
             'formTables': [{'label': '活用', 'rows': [[{'text': 'ます形（禮貌形）', 'header': True}, {'text': '食べます', 'header': False}]]}],
             'senses': [{'pos': ['Ichidan verb', 'transitive verb'], 'glosses': ['吃、進食'], 'glossLanguage': 'zh',
                         'examples': [{'text': 'パンを食べる。', 'translation': '吃麵包。', 'translationLanguage': 'zh', 'sourceId': 'test'}]},
                        {'pos': ['Ichidan verb'], 'glosses': ['to live on']}]}
report = {'words': [{'id': 'ja:食べます', 'text': '食べます', 'language': 'ja', 'duolingoMeanings': ['吃'], 'candidates': [candidate]},
                    {'id': 'fr:bonjour', 'text': 'bonjour', 'language': 'fr', 'duolingoMeanings': ['hello'], 'candidates': []}], 'sources': {}}
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    path = Path(tmp) / 'report.html'
    path.write_text(render_report(report), encoding='utf-8')
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(path.as_uri())
    page.locator('#decision').wait_for()
    page.locator('[name="status"]').select_option('accepted')
    page.locator('button[type="submit"]').click()
    assert '至少選擇' in page.locator('#notice').inner_text()
    page.locator('[name="s0-selected"]').check()
    assert page.locator('[name="s0-zh"]').count() == 0
    assert '吃、進食' in page.locator('.source-meaning').first.inner_text()
    assert '吃麵包。' in page.locator('.example').first.inner_text()
    page.locator('.sense').first.locator('summary').filter(has_text='詞形變化').click()
    assert 'ます形（禮貌形）' in page.locator('.table-scroll').first.inner_text()
    page.locator('[name="note"]').fill('核對動詞活用')
    page.locator('button[type="submit"]').click()
    page.reload()
    assert page.locator('[name="s0-selected"]').is_checked()
    assert not page.locator('[name="s1-selected"]').is_checked()
    assert page.locator('[name="status"]').input_value() == 'accepted'
    with page.expect_download() as event:
        page.locator('#export').click()
    backup = Path(tmp) / 'review.json'
    event.value.save_as(backup)
    content = json.loads(backup.read_text(encoding='utf-8'))
    assert content['kind'] == 'vocabulary-validation'
    assert len(content['decisions']) == 1
    bad = Path(tmp) / 'bad.json'
    bad.write_text(json.dumps({**content, 'reportId': 'different'}), encoding='utf-8')
    page.locator('#import').set_input_files(str(bad))
    page.locator('#notice').filter(has_text='不是本報告').wait_for()
    assert page.locator('[name="s0-selected"]').is_checked()
    page.evaluate('() => localStorage.clear()')
    page.reload()
    page.locator('#import').set_input_files(str(backup))
    page.locator('#notice').filter(has_text='已匯入').wait_for()
    assert page.locator('[name="s0-selected"]').is_checked()
    assert '吃麵包。' in page.locator('.example').first.inner_text()
    page.locator('[name="note"]').fill('unsaved')
    page.once('dialog', lambda d: d.dismiss())
    page.locator('#language').select_option('fr')
    assert page.locator('[name="note"]').input_value() == 'unsaved'
    page.locator('button[type="submit"]').click()
    (ROOT / 'artifacts').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'artifacts/validation-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.sense').first.locator('summary').filter(has_text='詞形變化').click()
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT / 'artifacts/validation-mobile.png'), full_page=True)
    page.locator('#language').select_option('fr')
    assert page.locator('#decision').count() == 0
    assert 'hello' in page.locator('article').inner_text()
    assert not errors, errors
    browser.close()
print('Validation browser passed: automatic meanings/examples, Chinese forms, persistence, export/import, revision rejection, unsaved draft, language fallback, responsive layout.')
