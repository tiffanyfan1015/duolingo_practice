import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from vocab_sync.errors import SyncError
from vocab_sync.export import export
from vocab_sync.api import fetch_words
from vocab_sync.course import progressed_skills
from vocab_sync.auth import user_id_from_token


class FakeClient:
    def __init__(self, pages):
        self.pages = iter(pages)
        self.calls = []

    def request(self, path, body=None):
        self.calls.append((path, body))
        return next(self.pages)


def page(words, next_index=None, total=2):
    return {"learnedLexemes": words, "pagination": {"nextStartIndex": next_index, "totalLexemes": total}}


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.course = {"learningLanguage": "ja", "fromLanguage": "zh", "skills": [[
            {"id": "learned", "finishedLevels": 1, "finishedLessons": 2},
            {"id": "locked", "finishedLevels": 0, "finishedLessons": 0},
        ]]}
        self.skills = progressed_skills(self.course)

    def test_only_actual_learned_progress(self):
        self.assertEqual(self.skills, [{"skillId": {"id": "learned"}, "finishedLevels": 1, "finishedSessions": 2}])

    @patch("vocab_sync.api.time.sleep")
    def test_source_language_and_pagination(self, _):
        client = FakeClient([page([{"text": "猫"}], 50), page([{"text": "犬"}])])
        self.assertEqual(len(fetch_words(client, "123", self.course, self.skills)), 2)
        self.assertIn("/ja/zh/learned-lexemes", client.calls[0][0])
        self.assertIn("startIndex=50", client.calls[1][0])
        self.assertEqual(client.calls[0][1]["progressedSkills"], self.skills)

    def test_repeated_page_is_rejected(self):
        with self.assertRaises(SyncError):
            fetch_words(FakeClient([page([{"text": "猫"}], 0)]), "123", self.course, self.skills)

    def test_incomplete_export_is_rejected(self):
        with self.assertRaises(SyncError):
            fetch_words(FakeClient([page([{"text": "猫"}], total=2)]), "123", self.course, self.skills)

    def test_empty_skills_make_no_request(self):
        client = FakeClient([])
        with self.assertRaises(SyncError):
            fetch_words(client, "123", self.course, [])
        self.assertEqual(client.calls, [])

    def test_expired_token_and_malformed_token(self):
        payload = base64.urlsafe_b64encode(json.dumps({"sub": 123, "exp": 1}).encode()).decode().rstrip("=")
        for token in ("invalid", f"header.{payload}.signature"):
            with self.assertRaises(SyncError):
                user_id_from_token(token)

    def test_export_preserves_unicode_and_does_not_invent_units(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = export(Path(folder), self.course, [{"text": "猫", "translations": ["貓"], "audioURL": "https://example.com/cat.mp3"}], self.skills)
            doc = json.loads(paths[0].read_text(encoding="utf-8"))
            self.assertEqual(doc["words"][0]["text"], "猫")
            self.assertEqual(doc["wordUnitMapping"], "unverified")
            self.assertNotIn("token", doc)
            self.assertIn("貓", paths[1].read_text(encoding="utf-8-sig"))


if __name__ == "__main__":
    unittest.main()
