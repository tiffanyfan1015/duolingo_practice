"""Package a private, standalone review page from the shared UI modules."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULES = [
    'domain/languages.mjs', 'services/audio.mjs', 'domain/validation.mjs', 'domain/morphology-labels.mjs',
    'services/validation-store.mjs', 'ui/views/shared.mjs', 'ui/views/validation.mjs',
    'ui/validation-events.mjs', 'validation-controller.mjs',
]


def prepare_report(report):
    # Preserve raw candidates; IDs change if candidate contents change.
    prepared = json.loads(json.dumps(report, ensure_ascii=False))
    for word in prepared['words']:
        word.setdefault('id', word['language'] + ':' + word['text'])
        word.setdefault('audio', None)
        for candidate in word['candidates']:
            candidate.pop('validationId', None)
            candidate.setdefault('senses', [])
            canonical = json.dumps(candidate, ensure_ascii=False, sort_keys=True)
            candidate['validationId'] = hashlib.sha256(canonical.encode()).hexdigest()
    identity = {'words': prepared['words'], 'sources': prepared.get('sources', {})}
    prepared['reportId'] = hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return prepared


def render_report(report):
    prepared = prepare_report(report)
    scripts = []
    for module in MODULES:
        source = (ROOT / 'web/src' / module).read_text(encoding='utf-8')
        source = re.sub(r'^import .*?;\s*', '', source, flags=re.MULTILINE)
        scripts.append(source)
    code = '\n'.join(scripts)
    if re.search(r'^import\s', code, re.MULTILINE):
        raise ValueError('Unbundled import in standalone validation page')
    # Never allow dictionary text to terminate a script element.
    data = json.dumps(prepared, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    css = (ROOT / 'web/styles/validation.css').read_text(encoding='utf-8')
    return ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta name="referrer" content="no-referrer"><title>單字資料驗證 · Duolingo 單字庫</title>'
            f'<style>{css}</style></head><body><main id="validation-root"></main>'
            '<p id="notice" role="status" aria-live="polite"></p>'
            '<noscript>請啟用 JavaScript 以查看詞條及保存審核結果。</noscript>'
            f'<script type="application/json" id="report-data">{data}</script>'
            f'<script type="module">{code}\n'
            'mountValidation(JSON.parse(document.querySelector("#report-data").textContent), document.querySelector("#validation-root"));'
            '</script></body></html>')
