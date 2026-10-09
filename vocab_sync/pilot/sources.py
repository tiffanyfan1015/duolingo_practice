"""Read dictionary sources as candidates; never assert a semantic match."""
import gzip
import json
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote
from .japanese import conjugate


def open_text(path):
    return gzip.open(path, 'rt', encoding='utf-8') if str(path).endswith('.gz') else open(path, encoding='utf-8-sig')


def german_candidates(path, targets):
    found = {text: [] for text in targets}
    article_queries = {}
    for text in targets:
        match = re.fullmatch(r'(der|die|das) (.+)', text)
        if match:
            article_queries.setdefault(match.group(2), set()).add(text)
    with open_text(path) as stream:
        for line in stream:
            if not line.strip():
                continue
            entry = json.loads(line)
            if entry.get('lang_code') != 'de':
                continue
            forms = entry.get('forms', [])
            hits = targets.intersection({entry.get('word', '')} | {f.get('form', '') for f in forms})
            if entry.get('pos') == 'noun':
                hits |= article_queries.get(entry.get('word', ''), set())
            if not hits:
                continue
            senses = entry.get('senses', [])
            candidate = {
                'lemma': entry['word'], 'pos': entry.get('pos', ''),
                'tags': entry.get('tags', []), 'rawTags': entry.get('raw_tags', []),
                'forms': forms,
                'senses': [{'glosses': s.get('glosses', []), 'tags': s.get('tags', []),
                            'formOf': s.get('form_of', []), 'examples': s.get('examples', [])}
                           for s in senses],
                'source': {'name': 'German Wiktionary / Kaikki',
                           'url': 'https://de.wiktionary.org/wiki/' + quote(entry['word']),
                           'licenseUrl': 'https://de.wiktionary.org/wiki/Wiktionary:Lizenzbestimmungen'},
            }
            for text in hits:
                found[text].append({**candidate, 'match': 'exact' if text == entry['word'] else ('article-stripped' if text in article_queries.get(entry['word'], set()) else 'inflected-form')})
    return found


def japanese_forms(lemma, pos):
    return conjugate(lemma, pos)


def japanese_candidates(path, targets):
    found = {text: [] for text in targets}
    with open_text(path) as stream:
        context = ET.iterparse(stream, events=('start', 'end'))
        _, root = next(context)
        for event, entry in context:
            if event != 'end' or entry.tag != 'entry':
                continue
            spellings = [el.text for el in entry.findall('k_ele/keb')]
            readings = [{'text': el.findtext('reb'),
                         'restrictedTo': [e.text for e in el.findall('re_restr')],
                         'kanaOnly': el.find('re_nokanji') is not None}
                        for el in entry.findall('r_ele')]
            senses, last_pos = [], []
            for sense in entry.findall('sense'):
                pos = [el.text for el in sense.findall('pos')] or last_pos
                last_pos = pos
                examples = []
                for ex in sense.findall('example'):
                    examples.append({'sourceId': ex.findtext('ex_srce'),
                                     'sentences': [{'language': e.get('{http://www.w3.org/XML/1998/namespace}lang'),
                                                    'text': e.text} for e in ex.findall('ex_sent')]})
                senses.append({'pos': pos, 'glosses': [el.text for el in sense.findall('gloss')],
                               'restrictedSpellings': [el.text for el in sense.findall('stagk')],
                               'restrictedReadings': [el.text for el in sense.findall('stagr')],
                               'examples': examples})
            lemmas = set(spellings) | {r['text'] for r in readings}
            for lemma in lemmas:
                valid_readings = [r for r in readings if
                    (lemma not in spellings and r['text'] == lemma) or
                    (lemma in spellings and not r['kanaOnly'] and
                     (not r['restrictedTo'] or lemma in r['restrictedTo']))]
                reading_texts = {r['text'] for r in valid_readings}
                matching_senses = [sense for sense in senses if
                    (not sense['restrictedSpellings'] or lemma not in spellings or
                     lemma in sense['restrictedSpellings']) and
                    (not sense['restrictedReadings'] or reading_texts.intersection(sense['restrictedReadings']))]
                # Keep conjugations attached to their sense/POS; never combine incompatible classes.
                analyses = [{**sense, 'forms': japanese_forms(lemma, sense['pos'])} for sense in matching_senses]
                forms = list({json.dumps(form, ensure_ascii=False): form
                              for sense in analyses for form in sense['forms']}.values())
                hits = targets.intersection({lemma} | {form['form'] for form in forms})
                for text in hits:
                    relevant = analyses if text == lemma else [sense for sense in analyses if
                                any(form['form'] == text for form in sense['forms'])]
                    found[text].append({'lemma': lemma, 'spellings': spellings, 'readings': valid_readings,
                        'senses': relevant, 'match': 'exact' if text == lemma else 'rule-inflected-form',
                        'forms': list({json.dumps(form, ensure_ascii=False): form
                                       for sense in relevant for form in sense['forms']}.values()),
                        'source': {'name': 'JMdict', 'id': entry.findtext('ent_seq'),
                                   'url': 'https://www.edrdg.org/jmdict/j_jmdict.html',
                                   'licenseUrl': 'https://www.edrdg.org/edrdg/licence.html'}})
            root.clear()
    return found
