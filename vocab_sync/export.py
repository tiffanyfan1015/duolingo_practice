"""Local vocabulary snapshot serialization."""
import csv
import json
from datetime import datetime, timezone
from .course import course_summary, unit_index

def safe_cell(value):
    text = str(value or "")
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text



def export(directory, course, words, skills):
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    prefix = f"{course['learningLanguage']}-from-{course['fromLanguage']}-{stamp}"
    document = {
        "schemaVersion": 1, "exportedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Duolingo unofficial learned-lexemes API",
        "course": course_summary(course), "wordCount": len(words),
        "wordUnitMapping": "unverified", "units": unit_index(course),
        "progressedSkills": skills, "words": words,
    }
    json_path = directory / (prefix + ".json")
    json_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    csv_path = directory / (prefix + ".csv")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(["單字", "原始翻譯", "發音連結", "來源單元"])
        for word in words:
            translations = word.get("translations", [])
            meaning = " / ".join(map(str, translations)) if isinstance(translations, list) else str(translations)
            writer.writerow([safe_cell(word["text"]), safe_cell(meaning), safe_cell(word.get("audioURL")), "尚未確認"])
    return json_path, csv_path

