"""Exercise the daily review feature in an isolated desktop/mobile browser."""
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.deps'))
from playwright.sync_api import sync_playwright

out = ROOT / 'artifacts'
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto('http://127.0.0.1:8765')
    # The module entry waits for the catalog before binding UI actions.
    page.wait_for_selector('.word-table')
    page.locator('[data-mode="review"]').click()
    page.wait_for_selector('.review-counts')
    assert page.locator('.review-counts strong').first.inner_text() == '10'
    assert not page.locator('#search').is_visible()
    page.locator('.review-settings-panel summary').click()
    page.locator('[name="newLimit"]').fill('1')
    page.locator('[name="templates"][value="recall"]').check()
    page.locator('[name="templates"][value="listening"]').check()
    page.locator('.review-settings button[type="submit"]').click()
    page.screenshot(path=str(out / 'daily-desktop.png'), full_page=True)
    action = lambda name: page.locator(f'[data-review-action="{name}"]')
    action('start').click()
    assert page.locator('[data-review-action="rate"]').count() == 0
    page.keyboard.press('Space')
    assert page.locator('[data-review-action="rate"]').count() == 4
    page.keyboard.press('1')
    assert page.locator('.review-empty').count() == 1
    state = lambda: page.evaluate('JSON.parse(localStorage.getItem("cijian-review-v1"))')
    assert len(state()['logs']) == 1
    assert state()['logs'][0]['rating'] == 1
    assert len(state()['cards']) == 3
    action('undo').click()
    assert len(state()['logs']) == 0
    assert page.locator('.review-card').count() == 1
    action('suspend').click()
    action('manage').click()
    assert page.locator('.review-hidden-row').count() == 1
    action('restore').click()
    assert page.locator('.review-hidden-row').count() == 0
    action('overview').click()
    action('start').click()
    action('reveal').click()
    page.locator('[data-review-action="rate"][data-value="3"]').click()
    assert len(state()['logs']) == 1
    with page.expect_download() as event:
        page.locator('#backup').click()
    backup = out / 'daily-backup.json'
    event.value.save_as(str(backup))
    assert json.loads(backup.read_text(encoding='utf-8'))['schemaVersion'] == 2
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_selector('.word-table')
    page.locator('#restore').set_input_files(str(backup))
    page.wait_for_function('localStorage.getItem("cijian-review-v1") !== null')
    page.locator('[data-mode="review"]').click()
    assert page.locator('.review-counts strong').first.inner_text() == '0'
    assert len(state()['logs']) == 1
    # Japanese settings and daily quota are independent.
    page.locator('[data-lang="ja"]').click()
    page.locator('#unit').select_option('s1u1')
    assert page.locator('.review-counts strong').first.inner_text() == '7'
    page.locator('.review-settings-panel summary').click()
    page.locator('[name="templates"][value="recognition"]').uncheck()
    page.locator('[name="templates"][value="listening"]').check()
    page.locator('.review-settings button[type="submit"]').click()
    action('start').click()
    assert page.locator('.review-card h3').count() == 0
    page.evaluate('window.__played=0; HTMLMediaElement.prototype.play=function(){window.__played++;return Promise.resolve()}')
    action('audio').click()
    page.wait_for_function('window.__played > 0')
    action('reveal').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(out / 'daily-mobile.png'), full_page=True)
    page.keyboard.press('4')
    assert state()['logs'][-1]['rating'] == 4
    page.reload()
    page.wait_for_selector('.word-table')
    assert len(state()['logs']) == 2
    assert not errors, errors
    browser.close()
print(json.dumps({'result': 'passed', 'checks': ['four ratings', 'keyboard', 'daily caps', 'undo', 'suspend/restore', 'independent languages', 'listening', 'backup v2', 'mobile layout'], 'consoleErrors': errors}))
