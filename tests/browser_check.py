"""Integration check against the local server, in a fresh isolated browser."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.deps'))
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'artifacts'
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1100})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto('http://127.0.0.1:8765')
    page.wait_for_selector('.word-table')
    assert page.locator('#total').inner_text() == '536'
    assert page.locator('#unit option').count() == 28
    page.locator('#page-size').select_option('0')
    assert page.locator('.word-table tbody tr').count() == 536
    page.locator('#page-size').select_option('30')
    page.screenshot(path=str(out / 'desktop.png'), full_page=False)
    page.locator('#search').fill('Stadtzentrum')
    assert page.locator('.word-table tbody tr').count() == 1
    page.locator('[data-star]').click()
    page.locator('#filter').select_option('star')
    assert page.locator('.word-title').inner_text() == 'Stadtzentrum'
    page.locator('[data-mode="flash"]').click()
    page.locator('#start').click()
    page.locator('#reveal').click()
    page.locator('[data-grade="true"]').click()
    assert page.locator('#learned').inner_text() == '1'
    page.reload()
    page.wait_for_selector('.word-table')
    assert page.locator('#learned').inner_text() == '1'
    page.locator('#search').fill('Stadtzentrum')
    page.locator('[data-mode="spell"]').click()
    page.locator('#start').click()
    page.locator('#answer').fill('stadtzentrum')
    page.locator('.answer-form button').click()
    assert '答對了' in page.locator('.feedback').inner_text()
    page.locator('[data-grade="true"]').click()
    page.locator('[data-mode="listen"]').click()
    page.locator('#start').click()
    page.evaluate('window.__played=0; HTMLMediaElement.prototype.play=function(){window.__played++; return Promise.resolve()};')
    page.locator('.listen-button').click()
    page.wait_for_function('window.__played >= 1')
    page.locator('#answer').fill('wrong')
    page.locator('.answer-form button').click()
    assert page.locator('.feedback.wrong').count() == 1
    page.locator('[data-grade="false"]').click()
    with page.expect_download() as event:
        page.locator('#backup').click()
    backup = out / 'test-backup.json'
    event.value.save_as(str(backup))
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_selector('.word-table')
    page.locator('#restore').set_input_files(str(backup))
    page.wait_for_function("document.querySelector('#learned').textContent==='1'")
    page.locator('[data-lang="ja"]').click()
    assert page.locator('#total').inner_text() == '488'
    page.locator('#romaji').check()
    assert 'biiru' in page.locator('.reading').first.inner_text()
    page.locator('#unit').select_option('s1u1')
    assert page.locator('.word-table tbody tr').count() == 7
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.evaluate("document.querySelector('#toast').style.display='none'")
    page.screenshot(path=str(out / 'mobile.png'), full_page=True)
    page.locator('.word-title').first.click()
    page.locator('#note').fill('自己的記憶提示')
    page.locator('#save-note').click()
    page.locator('.close').click()
    page.locator('[data-mode="flash"]').click()
    page.locator('#start').click()
    page.screenshot(path=str(out / 'mobile-flash.png'))
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors, errors
    browser.close()
print(json.dumps({'result': 'passed', 'checks': ['desktop', 'mobile', 'unit filter', 'favorites', 'flashcards', 'spelling', 'listening controls', 'persistence', 'backup restore', 'romaji', 'notes'], 'consoleErrors': errors}))
