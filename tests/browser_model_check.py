"""Exercise model import/reset on a phone-sized isolated browser; no personal history."""
import json
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.deps'))
from playwright.sync_api import sync_playwright
weights = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/fsrs-weights.mjs')], text=True))
weights[8] = 3
model = {'schemaVersion': 1, 'algorithm': 'FSRS-6', 'language': 'de', 'weights': weights,
         'accepted': True, 'trainedAt': '2026-09-26',
         'validation': {'baselineLogLoss': .4, 'candidateLogLoss': .3}}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    page = browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8765')
    page.locator('[data-mode="review"]').click()
    page.locator('.review-model-panel summary').click()
    upload=lambda value: page.locator('[data-model-import]').set_input_files({
        'name':'model.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
    upload(model)
    page.wait_for_function('JSON.parse(localStorage.getItem("cijian-review-v1"))?.settings.de.weights?.length === 21')
    page.reload()
    page.locator('[data-mode="review"]').click()
    page.locator('.review-model-panel summary').click()
    assert page.locator('[data-review-action="reset-model"]').is_enabled()
    page.locator('[data-lang="ja"]').click()
    page.locator('.review-model-panel summary').click()
    upload(model)
    page.wait_for_timeout(200)
    assert page.evaluate('JSON.parse(localStorage.getItem("cijian-review-v1")).settings.ja?.weights || null') is None
    page.locator('[data-lang="de"]').click()
    page.locator('.review-model-panel summary').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    out=ROOT/'artifacts'
    out.mkdir(exist_ok=True)
    page.screenshot(path=str(out/'model-mobile.png'),full_page=True)
    page.locator('[data-review-action="reset-model"]').click()
    assert page.evaluate('JSON.parse(localStorage.getItem("cijian-review-v1")).settings.de.weights || null') is None
    assert not errors, errors
    browser.close()
print('Model mobile import, persistence, language isolation, reset and layout passed.')
