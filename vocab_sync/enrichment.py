"""Local language-library adapter; no network or export-file access."""


class TextEnricher:
    def __init__(self):
        from opencc import OpenCC
        import pykakasi

        self._chinese = OpenCC("s2twp")
        self._japanese = pykakasi.kakasi()

    def traditional(self, text):
        return self._chinese.convert(text)

    def reading(self, text, language):
        parts = self._japanese.convert(text) if language == "ja" else []
        return {
            "reading": "".join(part["hira"] for part in parts),
            "romaji": " ".join(part["hepburn"] for part in parts),
        }
