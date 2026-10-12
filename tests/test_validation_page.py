import copy
import unittest
from unittest.mock import patch
from vocab_sync.pilot.page import prepare_report, render_report
from vocab_sync.pilot.report import build_report


class ValidationPageTests(unittest.TestCase):
    def test_fingerprints_and_script_injection(self):
        report = {'generatedAt': 'yesterday', 'sources': {}, 'words': [
            {'id': 'ja:x', 'text': '</script><script>alert(1)</script>', 'language': 'ja',
             'duolingoMeanings': [], 'candidates': [{'lemma': 'x', 'senses': []}]}]}
        first = prepare_report(report)
        report['generatedAt'] = 'today'
        self.assertEqual(first['reportId'], prepare_report(report)['reportId'])
        self.assertNotIn('validationId', report['words'][0]['candidates'][0])
        html = render_report(report)
        self.assertNotIn('</script><script>alert', html)
        self.assertNotIn('import {', html)
        changed = copy.deepcopy(report)
        changed['words'][0]['candidates'][0]['lemma'] = 'changed'
        self.assertNotEqual(first['reportId'], prepare_report(changed)['reportId'])

    def test_non_german_japanese_course_does_not_read_a_dictionary(self):
        catalog = {'courses': [{'id': 'course:fr', 'language': 'fr', 'words': [
            {'id': 'course:fr:bonjour', 'text': 'bonjour', 'meanings': ['hello'], 'audio': 'https://example.com/a.mp3'}]}]}
        with patch('vocab_sync.pilot.report.digest', side_effect=AssertionError('No dictionary needed')):
            report = build_report(catalog, {})
        word = report['words'][0]
        self.assertEqual(word['language'], 'fr')
        self.assertEqual(word['audio'], 'https://example.com/a.mp3')
        self.assertEqual(word['candidates'], [])
        self.assertEqual(report['counts']['fr'], {'total': 1, 'matched': 0})
