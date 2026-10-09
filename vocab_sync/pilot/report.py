"""Generate a readable review report without modifying the application catalog."""
import hashlib
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from .download import digest
from .sources import german_candidates, japanese_candidates


def select_words(words, limit, language=None):
    # Deterministic spread across units; do not cherry-pick only dictionary hits.
    preferred = []
    if language == 'ja':
        preferred = sorted([w for w in words if w.get('text', '').endswith(('\u307e\u3059',))],
                           key=lambda w: hashlib.sha256(w['id'].encode()).hexdigest())[:min(6, limit)]
    preferred_ids = {w['id'] for w in preferred}
    groups = {}
    for word in words:
        if word['id'] in preferred_ids:
            continue
        unit = (word.get('units') or ['unmapped'])[0]
        groups.setdefault(unit, []).append(word)
    for group in groups.values():
        group.sort(key=lambda w: hashlib.sha256(w['id'].encode()).hexdigest())
    selected = list(preferred)
    while groups and len(selected) < limit:
        for unit in sorted(list(groups)):
            selected.append(groups[unit].pop(0))
            if not groups[unit]:
                del groups[unit]
            if len(selected) == limit:
                break
    return selected


def build_report(catalog, paths, limit=20):
    report = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'purpose': 'manual-validation-only', 'sources': {}, 'words': []}
    for language, adapter in [('de', german_candidates), ('ja', japanese_candidates)]:
        course = next(c for c in catalog['courses'] if c['id'] == language)
        selected = select_words(course['words'], limit, language)
        print(f'{language}: reading source for {len(selected)} words', flush=True)
        found = adapter(paths[language], {w['text'] for w in selected})
        report['sources'][language] = {'file': Path(paths[language]).name, 'sha256': digest(paths[language])}
        for word in selected:
            candidates = found[word['text']]
            report['words'].append({'id': word['id'], 'language': language, 'text': word['text'],
                'duolingoMeanings': word['meanings'], 'units': word.get('units', []),
                'status': 'needs-review' if candidates else 'not-found',
                'decision': None, 'candidates': candidates})
    report['counts'] = {lang: {'total': sum(w['language'] == lang for w in report['words']),
                              'matched': sum(w['language'] == lang and bool(w['candidates']) for w in report['words'])}
                        for lang in ('de', 'ja')}
    return report


def render_report(report):
    esc = html.escape
    blocks = []
    for word in report['words']:
        candidates = []
        for index, candidate in enumerate(word['candidates']):
            source = candidate['source']
            candidates.append(f'<details><summary>候選 {index + 1}：{esc(candidate["lemma"])} · {esc(candidate.get("pos", ""))}</summary>'
                              f'<p><a href="{esc(source["url"], quote=True)}">{esc(source["name"])}</a> · '
                              f'<a href="{esc(source["licenseUrl"], quote=True)}">授權</a></p>'
                              f'<pre>{esc(json.dumps(candidate, ensure_ascii=False, indent=2))}</pre></details>')
        blocks.append(f'<article><h2>{esc(word["text"])} <small>{esc(word["language"])}</small></h2>'
                      f'<p>ID: {esc(word.get("id", ""))}</p><p>Duolingo：{esc("、".join(word["duolingoMeanings"]))}</p>'
                      f'<p>單元：{esc(", ".join(word["units"]))} · 候選數：{len(candidates)}</p>'
                      + ''.join(candidates) + ('<p>查無候選，保持空白，需人工查詞。</p>' if not candidates else '') +
                      '<p>檢查：□ 同一詞義 □ 讀音／冠詞 □ 變化 □ 例句符合程度 □ 出處</p></article>')
    return '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>德日單字補充驗證</title><style>body{max-width:960px;margin:30px auto;padding:0 18px;font-family:system-ui;line-height:1.7;background:#f6f5f0;color:#18352b}article{background:white;padding:20px;margin:18px 0;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer}small{font-size:14px}a{color:#136b61}</style>
<h1>德日單字補充驗證</h1><p>這是待確認候選報告，未修改正式字庫。找到詞條不代表詞義正確。範例與釋義保留來源語言，沒有自動翻成繁中。</p>
<p>展開候選，對照 Duolingo 的意思。記下單字 ID、候選編號與需要更正之處。日文讀音與詞義限制須一併確認；rule 標記表示依詞性規則產生，仍需檢查。無資料的欄位不補猜測。</p>''' + ''.join(blocks) + '</html>'
