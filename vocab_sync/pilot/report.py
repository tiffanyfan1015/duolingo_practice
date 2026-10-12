"""Generate a readable review report without modifying the application catalog."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from .page import render_report
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


def build_report(catalog, paths, limit=20, api=None):
    report = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'purpose': 'manual-validation-only', 'sources': {}, 'words': []}
    for course in catalog['courses']:
        language = course.get('language', course['id'])
        adapter = {'de': german_candidates, 'ja': japanese_candidates}.get(language)
        selected = select_words(course['words'], limit, language)
        print(f'{language}: reading source for {len(selected)} words', flush=True)
        found = adapter(paths[language], {w['text'] for w in selected}) if adapter and api is None else {}
        if api:
            report['sources'][language] = {'mode': 'per-word-api', 'name': '中文維基詞典', 'supported': language in {'ja', 'de'}}
        elif adapter:
            report['sources'][language] = {'file': Path(paths[language]).name, 'sha256': digest(paths[language])}
        for word in selected:
            error = ''
            try:
                candidates = api.lookup(word['text'], language) if api else found.get(word['text'], [])
            except (OSError, ValueError) as exc:
                candidates, error = [], f'API 查詢失敗：{exc}'
            report['words'].append({'id': word['id'], 'language': language, 'text': word['text'],
                'duolingoMeanings': word['meanings'], 'units': word.get('units', []),
                'audio': word.get('audio'), 'reading': word.get('reading', ''), 'courseId': course['id'],
                'status': 'lookup-error' if error else ('needs-review' if candidates else 'not-found'),
                'lookupError': error,
                'decision': None, 'candidates': candidates})
    report['counts'] = {lang: {'total': sum(w['language'] == lang for w in report['words']),
                              'matched': sum(w['language'] == lang and bool(w['candidates']) for w in report['words'])}
                        for lang in sorted({w['language'] for w in report['words']})}
    return report
