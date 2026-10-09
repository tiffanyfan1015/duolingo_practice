import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from vocab_sync.errors import SyncError
from vocab_sync.mapping import analyze, probe_units


class MappingTests(unittest.TestCase):
    def setUp(self):
        self.words = [{'text': w} for w in ('a', 'b', 'c')]
        self.units = [{'sectionPosition': 1, 'unitPosition': 1, 'skillIds': ['s1']},
                      {'sectionPosition': 1, 'unitPosition': 2, 'skillIds': ['s1', 's2']}]

    def test_ignored_filter_does_not_assign_every_word_everywhere(self):
        probes = [{'skillId': str(i), 'wordTexts': ['a', 'b', 'c']} for i in range(3)]
        result = analyze(self.words, probes, self.units, False)
        self.assertEqual(result['status'], 'filter_not_demonstrated')
        self.assertEqual(result['candidateMappings'], [])

    def test_overlap_retains_all_candidates_and_unmapped_words(self):
        result = analyze(self.words, [{'skillId': 's1', 'wordTexts': ['a']},
                                     {'skillId': 's2', 'wordTexts': ['a', 'b']}], self.units, True)
        self.assertEqual(result['status'], 'filter_supported')
        self.assertEqual(len(result['candidateMappings'][0]['candidateUnits']), 2)
        self.assertEqual(result['candidateMappings'][2]['status'], 'unmapped')
        self.assertEqual(result['uncoveredWords'], ['c'])

    def test_words_outside_baseline_invalidate_mapping(self):
        result = analyze(self.words, [{'skillId': 's1', 'wordTexts': ['unexpected']}], self.units, True)
        self.assertEqual(result['status'], 'inconsistent_results')
        self.assertEqual(result['candidateMappings'], [])

    def test_empty_response_is_not_filter_proof(self):
        self.assertEqual(analyze(self.words, [{'skillId': 's1', 'wordTexts': []}], self.units, True)['status'], 'inconclusive')

    @patch('vocab_sync.mapping.time.sleep')
    @patch('vocab_sync.mapping.fetch_words')
    def test_failure_preserves_checkpoint_without_usable_mapping(self, fetch, sleep):
        fetch.side_effect = [[{'text': 'a'}], SyncError('HTTP 403')]
        skills = [{'skillId': {'id': s}, 'finishedLevels': 1, 'finishedSessions': 0} for s in ('s1', 's2')]
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(SyncError):
                probe_units(None, '123', {'learningLanguage': 'de', 'fromLanguage': 'zh'}, skills, self.words, Path(directory))
            report = json.loads(next(Path(directory).glob('*.json')).read_text(encoding='utf-8'))
            self.assertEqual(len(report['probes']), 1)
            self.assertEqual(report['runStatus'], 'failed')
            self.assertEqual(report['analysis']['status'], 'incomplete_run')
            self.assertEqual(report['analysis']['candidateMappings'], [])


if __name__ == '__main__':
    unittest.main()
