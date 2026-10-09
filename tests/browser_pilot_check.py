"""Check generated pilot report in an isolated browser."""
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.deps'))
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    page=browser.new_page(viewport={'width':390,'height':844})
    page.goto((ROOT/'artifacts/vocabulary-pilot/report.html').as_uri())
    assert page.locator('article').count()==40
    page.locator('details summary').first.click()
    assert page.locator('pre').first.is_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT/'artifacts/pilot-mobile.png'))
    browser.close()
print('Pilot report: 40 words, expandable evidence and mobile layout passed.')
