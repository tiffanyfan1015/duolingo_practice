"""Exercise the real Worker and UI with SQLite and synthetic Duolingo responses."""
import base64
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.deps'))
from playwright.sync_api import sync_playwright

def token(identity):
    payload = base64.b64encode(json.dumps({'sub': identity, 'exp': 4102444800}).encode()).decode()
    return f'a.{payload}.synthetic'

server = subprocess.Popen(['node', str(ROOT / 'tests/helpers/account-server.mjs')], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    port = server.stdout.readline().strip()
    if not port.isdigit():
        raise RuntimeError(server.stderr.read())
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        def forward(route):
            original = urlsplit(route.request.url)
            response = route.fetch(url=f'http://127.0.0.1:{port}{original.path}' + (f'?{original.query}' if original.query else ''), max_redirects=0)
            route.fulfill(response=response)
        context.route('https://cijian.test/**', forward)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Redirect protection is covered by Worker tests. Route interception
        # does not intercept the redirected navigation in this Chrome setup.
        page.goto('https://cijian.test/account')

        def register(name):
            form = page.locator('form[data-account="register"]')
            form.locator('[name="username"]').fill(name)
            form.locator('[name="password"]').fill('browser-test-password-123')
            form.locator('[name="invite"]').fill('browser-test-invitation-code')
            form.locator('button').click()
            page.wait_for_selector('form[data-account="connect"]')

        def connect(identity):
            form = page.locator('form[data-account="connect"]')
            form.locator('input').fill(token(identity))
            form.locator('button').click()
            page.get_by_text('已連接，可前往練習室同步字庫。', exact=True).wait_for()
            assert page.locator('[name="token"]').input_value() == ''

        def sync(identity):
            page.locator('.primary-link').click()
            page.locator('[data-sync="continue"]').click()
            page.wait_for_selector('[data-star]')
            page.locator('#sync-area').filter(has_text='同步完成').wait_for()
            assert f'Haus-{identity}' in page.locator('#content').inner_text()
            assert page.evaluate('() => document.documentElement.scrollWidth<=innerWidth')

        register('alice')
        connect('101')
        (ROOT / 'artifacts').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT / 'artifacts/account-mobile.png'), full_page=True)
        sync('101')
        page.locator('[data-star]').first.click()
        alice_records = page.evaluate('() => JSON.stringify({...localStorage})')
        assert 'cijian-user:' in alice_records
        assert 'jwt_token' not in alice_records and '.synthetic' not in alice_records
        page.locator('#account-link').click()
        def save_courses(selected):
            form = page.locator('form[data-account="save-courses"]')
            form.wait_for()
            for checkbox in form.locator('[name="courses"]').all():
                checkbox.set_checked(checkbox.input_value() in selected)
            form.locator('button').click()
            page.get_by_text('啟用課程已儲存。', exact=True).wait_for()

        page.wait_for_selector('.course-option')
        assert page.locator('.course-option').count() == 5
        assert page.locator('.course-option').all_text_contents() == ['德文', '日文', '法文', '西班牙文', '英文']
        save_courses({'de', 'course:french'})
        page.locator('form[data-account="refresh-courses"] button').click()
        page.get_by_text('課程清單已更新。', exact=True).wait_for()
        page.locator('.primary-link').click()
        page.locator('[data-lang="course:french"]').click()
        assert '法文' in page.locator('#sync-area').inner_text()
        page.locator('[data-sync="continue"]').click()
        page.locator('#sync-area').filter(has_text='請先在 Duolingo 切換').wait_for()
        page.locator('#account-link').click()
        save_courses(set())
        assert page.locator('[name="courses"]:checked').count() == 0
        page.locator('.primary-link').click()
        page.get_by_text('尚未啟用課程', exact=True).wait_for()
        page.get_by_text('設定啟用課程', exact=True).click()
        save_courses({'de'})
        page.locator('.primary-link').click()
        page.wait_for_selector('[data-star]')
        assert 'Haus-101' in page.locator('#content').inner_text()
        assert page.evaluate('() => JSON.stringify({...localStorage})') == alice_records
        page.locator('#account-link').click()
        page.locator('form[data-account="logout"] button').click()
        page.wait_for_selector('form[data-account="register"]')
        register('bob')
        connect('202')
        sync('202')
        assert 'Haus-101' not in page.locator('#content').inner_text()
        assert page.evaluate('() => JSON.stringify({...localStorage})') == alice_records
        page.locator('[data-star]').first.click()
        assert page.evaluate('() => Object.keys(localStorage).filter(k=>k.endsWith("cijian-progress-v1")).length') == 2
        page.locator('#account-link').click()
        page.locator('form[data-account="logout"] button').click()
        page.wait_for_selector('form[data-account="login"]')
        form = page.locator('form[data-account="login"]')
        form.locator('[name="username"]').fill('alice')
        form.locator('[name="password"]').fill('browser-test-password-123')
        form.locator('button').click()
        page.wait_for_selector('.primary-link')
        page.locator('.primary-link').click()
        page.wait_for_selector('[data-star]')
        assert 'Haus-101' in page.locator('#content').inner_text()
        assert 'Haus-202' not in page.locator('#content').inner_text()
        page.locator('#filter').select_option('star')
        assert 'Haus-101' in page.locator('#content').inner_text()
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.locator('#account-link').click()
        page.wait_for_selector('.primary-link')
        page.screenshot(path=str(ROOT / 'artifacts/account-desktop.png'), full_page=True)
        assert page.evaluate('() => document.documentElement.scrollWidth<=innerWidth')
        assert not errors, errors
        browser.close()
    print('Account browser integration passed: registration, connection, real Worker sync, logout/login, two-user storage isolation, mobile/desktop layout.')
finally:
    server.terminate()
    server.wait(timeout=10)
