import json
import tempfile
import unittest
from pathlib import Path
from learning_tools.optimizer import histories, split_histories, samples, optimize, DAY
from vocab_sync.pilot.sources import german_candidates, japanese_candidates, japanese_forms
from vocab_sync.pilot.report import select_words, render_report


def backup_for(cards=40, reviews=8):
    logs = []
    for card in range(cards):
        for n in range(reviews):
            logs.append({'id': f'{card}-{n}', 'cardId': f'de:word{card}::recognition',
                         'language': 'de', 'at': DAY * (20000 + n * 3),
                         'rating': 1 if n > 0 and (n + card) % 4 == 0 else 3,
                         'wasNew': n == 0})
    return {'schemaVersion': 2, 'review': {'logs': logs, 'settings': {}}}


class OptimizerTests(unittest.TestCase):
    def test_complete_histories_duplicates_and_language(self):
        backup = backup_for(2, 3)
        backup['review']['logs'] += [dict(backup['review']['logs'][0])]
        groups, excluded = histories(backup, 'de')
        self.assertEqual(len(groups), 2)
        self.assertEqual(len(list(samples(groups))), 4)
        self.assertEqual(histories(backup, 'ja'), ({}, 0))
        backup['review']['logs'][0]['wasNew'] = False
        with self.assertRaises(ValueError):
            histories(backup, 'de')
        incomplete = backup_for(1, 3)
        incomplete['review']['logs'][0]['wasNew'] = False
        self.assertEqual(histories(incomplete, 'de'), ({}, 1))

    def test_split_keeps_siblings_together_and_uses_utc_day(self):
        groups, _ = histories(backup_for(), 'de')
        groups.update({k.replace('recognition', 'recall'): v for k, v in list(groups.items())})
        train, test = split_histories(groups)
        self.assertFalse({k.split('::')[0] for k in train} & {k.split('::')[0] for k in test})
        row = [{'at': DAY - 1, 'rating': 3}, {'at': DAY + 1, 'rating': 1}]
        self.assertEqual(list(samples({'a': row}))[0][1], [(3, 0), (1, 1)])

    def test_insufficient_history_never_produces_model(self):
        report = optimize(backup_for(1, 2), 'de')
        self.assertFalse(report['accepted'])
        self.assertNotIn('weights', report)

    def test_real_optimizer_and_runtime_evaluation(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.deps'))
        try:
            import fsrs_rs_python
        except ImportError:
            self.skipTest('Optional fsrs-rs-python dependency not installed')
        report = optimize(backup_for(), 'de')
        self.assertEqual(len(report['weights']), 21)
        self.assertGreater(report['validation']['baselineLogLoss'], 0)
        self.assertEqual(report['accepted'], report['validation']['candidateLogLoss'] <
                         report['validation']['baselineLogLoss'] - 0.001)


class PilotTests(unittest.TestCase):
    def test_german_inflections_case_and_escaping(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'de.jsonl'
            rows = [{'word':'Restaurant', 'lang_code':'de', 'pos':'noun', 'forms':[], 'senses':[]}, {'word': 'essen', 'lang_code': 'de', 'pos': 'verb',
                     'forms': [{'form': 'isst', 'tags': ['present', 'singular']}],
                     'senses': [{'glosses': ['Nahrung aufnehmen']}]}]
            path.write_text('\n'.join(json.dumps(r) for r in rows), encoding='utf-8')
            matches = german_candidates(path, {'isst', 'Isst', 'essen', 'das Restaurant'})
            self.assertEqual(matches['isst'][0]['lemma'], 'essen')
            self.assertEqual(matches['Isst'], [])
            self.assertEqual(matches['das Restaurant'][0]['match'], 'article-stripped')
            report = {'words': [{'text': '<script>', 'language': 'de', 'duolingoMeanings': [],
                                 'units': [], 'candidates': matches['isst']}]}
            self.assertNotIn('<script>', render_report(report))

    def test_jmdict_dtd_restrictions_and_rules(self):
        xml = '''<?xml version="1.0"?><!DOCTYPE JMdict [<!ENTITY v1 "Ichidan verb">]><JMdict>
<entry><ent_seq>1</ent_seq><k_ele><keb>食べる</keb></k_ele><r_ele><reb>たべる</reb></r_ele>
<sense><pos>&v1;</pos><gloss>to eat</gloss><example><ex_srce>10</ex_srce><ex_sent xml:lang="jpn">パンを食べる。</ex_sent></example></sense></entry>
<entry><ent_seq>2</ent_seq><k_ele><keb>生</keb></k_ele><k_ele><keb>生まれ</keb></k_ele>
<r_ele><reb>なま</reb><re_restr>生</re_restr></r_ele><r_ele><reb>うまれ</reb><re_restr>生まれ</re_restr></r_ele>
<sense><gloss>birth</gloss></sense></entry></JMdict>'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ja.xml'
            path.write_text(xml, encoding='utf-8')
            matches = japanese_candidates(path, {'食べる', '食べます', '生', 'unknown'})
            self.assertEqual(matches['食べる'][0]['forms'][0]['form'], '食べます')
            self.assertEqual(matches['生'][0]['readings'][0]['text'], 'なま')
            self.assertEqual(len(matches['生'][0]['readings']), 1)
            self.assertEqual(matches['食べます'][0]['lemma'], '食べる')
            self.assertEqual(matches['unknown'], [])
            self.assertEqual(japanese_forms('帰る', ['Godan verb']), [])

    def test_truncated_dictionary_cache_is_rejected(self):
        import gzip
        from vocab_sync.pilot.download import valid_gzip
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data.gz'
            content = gzip.compress(b'complete dictionary')
            path.write_bytes(content)
            self.assertTrue(valid_gzip(path))
            path.write_bytes(content[:-5])
            self.assertFalse(valid_gzip(path))

    def test_sampling_is_deterministic_and_does_not_drop_misses(self):
        words = [{'id': str(i), 'units': [str(i % 5)]} for i in range(100)]
        result = select_words(words, 20)
        self.assertEqual(len(result), 20)
        self.assertEqual(result, select_words(list(reversed(words)), 20))
        self.assertEqual(len({w['units'][0] for w in result}), 5)


if __name__ == '__main__':
    unittest.main()
