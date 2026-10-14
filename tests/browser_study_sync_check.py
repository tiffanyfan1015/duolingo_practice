"""Two independent browser profiles exercise real Worker/D1 sync with synthetic data."""
import base64
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.deps'))
from playwright.sync_api import sync_playwright

server=subprocess.Popen(['node',str(ROOT/'tests/helpers/account-server.mjs')],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    port=server.stdout.readline().strip()
    if not port.isdigit(): raise RuntimeError(server.stderr.read())
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
        errors=[]
        def device(width):
            context=browser.new_context(viewport={'width':width,'height':1000})
            network={'offline':False}
            def forward(route):
                url=urlsplit(route.request.url)
                if network['offline'] and url.path=='/api/study': return route.abort('internetdisconnected')
                response=route.fetch(url=f'http://127.0.0.1:{port}{url.path}'+(f'?{url.query}' if url.query else ''),max_redirects=0)
                route.fulfill(response=response)
            context.route('https://cijian.test/**',forward)
            page=context.new_page()
            page.on('pageerror',lambda e:errors.append(str(e)))
            return page,network
        a,an=device(1440)
        b,bn=device(390)
        def login(page,register=False):
            page.goto('https://cijian.test/account')
            if register: page.get_by_role('link',name='第一次使用？建立帳號').click()
            form=page.locator('form[data-account="register"' + ']' if register else 'form[data-account="login"]')
            form.locator('[name="username"]').fill('alice')
            form.locator('[name="password"]').fill('browser-test-password-123')
            if register: form.locator('[name="invite"]').fill('browser-test-invitation-code')
            form.locator('button[type="submit"]').click()
            page.wait_for_selector('form[data-account="connect"]' if register else '[data-star]')
        def synced(page): page.locator('[data-study-state="synced"]').wait_for(timeout=15000)
        def sync(page):
            page.locator('[data-study-sync=""]').click()
            synced(page)
        def note(page,text):
            page.locator('[data-detail]').first.click()
            page.locator('#note').fill(text)
            page.locator('#save-note').click()
            page.locator('.close').click()
        def state(page,suffix):
            return page.evaluate('suffix=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith(suffix))))',suffix)
        login(a,True)
        payload=base64.b64encode(json.dumps({'sub':'101','exp':4102444800}).encode()).decode()
        a.locator('[name="token"]').fill(f'a.{payload}.synthetic')
        a.locator('form[data-account="connect"] button[type="submit"]').click()
        a.get_by_text('已連接，可前往練習室同步字庫。',exact=True).wait_for()
        a.locator('.primary-link').click()
        a.locator('[data-sync="continue"]').click()
        a.wait_for_selector('[data-star]')
        synced(a)
        login(b)
        b.wait_for_selector('[data-star]')
        synced(b)
        note(a,'電腦筆記')
        a.locator('[data-star]').click()
        synced(a)
        sync(b)
        assert b.locator('[data-star]').get_attribute('aria-pressed')=='true'
        b.locator('[data-detail]').click()
        assert b.locator('#note').input_value()=='電腦筆記'
        # Background updates must preserve an unsaved note draft.
        b.locator('#note').fill('尚未儲存的草稿')
        note(a,'雲端的新筆記')
        synced(a)
        b.evaluate('window.dispatchEvent(new Event("focus"))')
        b.wait_for_timeout(500)
        assert b.locator('#note').input_value()=='尚未儲存的草稿'
        b.locator('.close').click()
        # Offline mutation survives a page reload and automatically flushes on reconnect.
        bn['offline']=True
        note(b,'手機離線筆記')
        b.locator('[data-study-state="error"]').wait_for()
        b.reload()
        b.wait_for_selector('[data-detail]')
        b.locator('[data-detail]').click()
        assert b.locator('#note').input_value()=='手機離線筆記'
        b.locator('.close').click()
        bn['offline']=False
        b.evaluate('window.dispatchEvent(new Event("online"))')
        synced(b)
        sync(a)
        assert next(iter(state(a,'cijian-progress-v1')['words'].values()))['note']=='手機離線筆記'
        # Same-field conflicts preserve both versions until an explicit choice.
        bn['offline']=True
        note(b,'手機衝突版本')
        note(a,'電腦衝突版本')
        synced(a)
        bn['offline']=False
        b.evaluate('window.dispatchEvent(new Event("online"))')
        b.locator('[data-study-state="conflict"]').wait_for()
        b.locator('[data-study-sync="local"]').click()
        synced(b)
        sync(a)
        assert next(iter(state(a,'cijian-progress-v1')['words'].values()))['note']=='手機衝突版本'
        # Settings and an actual FSRS answer transfer without reload; undo also transfers.
        a.locator('[data-mode="review"]').click()
        a.locator('.review-settings-panel summary').click()
        a.locator('[name="newLimit"]').fill('7')
        a.locator('.review-settings button[type="submit"]').click()
        synced(a)
        b.locator('[data-mode="review"]').click()
        b.locator('.review-settings-panel summary').click()
        b.locator('[name="newLimit"]').fill('13')
        b.locator('[name="templates"][value="recognition"]').uncheck()
        b.locator('[name="templates"][value="listening"]').check()
        sync(b)
        # A background redraw updates stored settings, but preserves the whole unsaved form.
        assert state(b,'cijian-review-v1')['settings']['de']['newLimit']==7
        assert b.locator('[name="newLimit"]').input_value()=='13'
        assert not b.locator('[name="templates"][value="recognition"]').is_checked()
        assert b.locator('[name="templates"][value="listening"]').is_checked()
        b.reload()
        synced(b)
        b.locator('[data-mode="review"]').click()
        assert b.locator('[name="newLimit"]').input_value()=='7'
        a.locator('[data-review-action="start"]').click()
        a.locator('[data-review-action="reveal"]').click()
        a.locator('[data-review-action="rate"][data-value="3"]').click()
        synced(a)
        sync(b)
        assert len(state(b,'cijian-review-v1')['logs'])==1
        ac=state(a,'cijian-review-v1')['cards']
        bc=state(b,'cijian-review-v1')['cards']
        assert ac.keys()==bc.keys()
        for card_id in ac:
            for field in ['memory','due','reviews','updatedAt']:
                assert ac[card_id].get(field)==bc[card_id].get(field)
        a.locator('[data-review-action="undo"]').click()
        synced(a)
        sync(b)
        assert len(state(b,'cijian-review-v1')['logs'])==0
        assert b.evaluate('document.documentElement.scrollWidth<=innerWidth')
        (ROOT/'artifacts').mkdir(exist_ok=True)
        b.screenshot(path=str(ROOT/'artifacts/study-sync-mobile.png'),full_page=True)
        a.screenshot(path=str(ROOT/'artifacts/study-sync-desktop.png'),full_page=True)
        assert not errors,errors
        browser.close()
    print('Study sync browser passed: independent profiles, notes/stars, draft preservation, offline reload/reconnect, conflicts, settings, FSRS state and undo.')
finally:
    server.terminate()
    server.wait(timeout=10)
