"""Validated export loading and website dataset transformation."""
import json


def load_snapshots(folder, language):
    exports = sorted(
        path for path in folder.glob(f"{language}-*.json")
        if not path.name.endswith("-unit-probe.json")
    )
    probes = sorted(folder.glob(f"{language}-*-unit-probe.json"))
    if not exports or not probes:
        raise ValueError(f"{language}: missing export or unit probe")
    source = json.loads(exports[-1].read_text(encoding="utf-8"))
    probe = json.loads(probes[-1].read_text(encoding="utf-8"))
    if probe["runStatus"] != "completed" or probe["analysis"]["status"] != "filter_supported":
        raise ValueError(f"{language}: latest unit probe is not validated")
    if source["course"]["id"] != probe["course"]["id"]:
        raise ValueError(f"{language}: course mismatch")
    mapping = {item["text"]: item for item in probe["analysis"]["candidateMappings"]}
    if set(mapping) != {word["text"] for word in source["words"]}:
        raise ValueError(f"{language}: vocabulary changed; run --map-units again")
    return source, mapping


def transform_course(source, mapping, language, name, enricher):
    units = {}
    words = []
    for word in source["words"]:
        unit_ids = []
        for unit in mapping[word["text"]]["candidateUnits"]:
            uid = f"s{unit['sectionPosition']}u{unit['unitPosition']}"
            units[uid] = {
                "id": uid, "section": unit["sectionPosition"],
                "position": unit["unitPosition"],
                "title": enricher.traditional(unit["title"] or "未命名單元"),
            }
            unit_ids.append(uid)
        words.append({
            "id": language + ":" + word["text"], "text": word["text"],
            "meanings": list(dict.fromkeys(enricher.traditional(text) for text in word["translations"])),
            "audio": word.get("audioURL"), "units": unit_ids,
            **enricher.reading(word["text"], language),
        })
    return {
        "id": language, "name": name, "exportedAt": source["exportedAt"],
        "units": sorted(units.values(), key=lambda unit: (unit["section"], unit["position"])),
        "words": words,
    }


def build_dataset(root, enricher):
    courses = []
    for language, name in [("de", "德文"), ("ja", "日文")]:
        source, mapping = load_snapshots(root / "data" / "exports", language)
        courses.append(transform_course(source, mapping, language, name, enricher))
    output = root / "web" / "data.json"
    output.write_text(json.dumps({"courses": courses}, ensure_ascii=False), encoding="utf-8")
    return output, sum(len(course["words"]) for course in courses)
