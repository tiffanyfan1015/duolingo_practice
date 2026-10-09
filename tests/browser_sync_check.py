"""Mobile sync UI checks with mocked cloud endpoints; never uses real credentials."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.deps'))
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    catalog=json.loads((ROOT/'web/data.json').read_text(encoding='utf-8'))
    state={'steps':0,'phase':'words','fail':True,'completed':False}
    def job():
        return {'id':'test-job','language':'de','phase':state['phase'],'count':50,'mapped':0,'totalSkills':27}
    def route(request):
        path=request.request.url
        if '/api/catalog' in path:
            result=json.loads(json.dumps(catalog))
            if state['completed']:
                result['courses'][0]['words'].append({'id':'de:SYNC_TEST','text':'SYNC_TEST','meanings':['test'],'units':[],'reading':'','romaji':''})
            request.fulfill(json=result)
        elif '/status' in path: request.fulfill(json={'available':True,'job':None if state['steps']==0 else job()})
        elif '/start' in path: request.fulfill(json={'job':job()})
        elif '/step' in path:
            assert request.request.headers.get('x-cijian-sync')=='1'
            state['steps']+=1
            if state['fail']:
                state['fail']=False
                request.fulfill(status=502,json={'error':'network interruption'})
            else:
                state['phase']='done';state['completed']=True
                request.fulfill(json={'job':job()})
    page.route('**/api/**',route)
    page.goto('http://127.0.0.1:8765')
    page.wait_for_selector('.word-table')
    page.locator('[data-star]').first.click()
    records=page.evaluate('localStorage.getItem("cijian-progress-v1")')
    page.locator('[data-sync="continue"]').click()
    page.wait_for_function('document.querySelector("#sync-area").textContent.includes("network interruption")')
    assert page.locator('#total').inner_text()=='536'
    page.reload()
    page.wait_for_selector('.word-table')
    page.wait_for_selector('[data-sync="restart"]')
    page.locator('[data-sync="continue"]').click()
    page.wait_for_function('document.querySelector("#total").textContent==="537"')
    assert page.evaluate('localStorage.getItem("cijian-progress-v1")')==records
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(ROOT/'artifacts/mobile-sync.png'),full_page=True)
    assert not errors,errors
    browser.close()
print('Mobile cloud-sync UI passed: resume, failure preserves catalog, successful reload, progress preservation, responsive layout.')
