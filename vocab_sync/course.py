"""Pure course-progress and unit-index transformations."""

def progressed_skills(course):
    """Use actual progress, never fabricated completion counts."""
    found = {}

    def add(skill_id, levels, sessions):
        if isinstance(skill_id, dict):
            skill_id = skill_id.get("id")
        levels = levels if isinstance(levels, int) and not isinstance(levels, bool) else 0
        sessions = sessions if isinstance(sessions, int) and not isinstance(sessions, bool) else 0
        if not isinstance(skill_id, str) or not skill_id or max(levels, sessions) <= 0:
            return
        prior = found.get(skill_id, {})
        found[skill_id] = {
            "skillId": {"id": skill_id},
            "finishedLevels": max(0, levels, prior.get("finishedLevels", 0)),
            "finishedSessions": max(0, sessions, prior.get("finishedSessions", 0)),
        }

    def walk_skills(value):
        if isinstance(value, list):
            for item in value:
                walk_skills(item)
        elif isinstance(value, dict):
            add(value.get("id"), value.get("finishedLevels"),
                value.get("finishedSessions", value.get("finishedLessons")))

    walk_skills(course.get("skills", []))
    sections = course.get("pathSectioned", [])
    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            for unit in section.get("units", []):
                for level in unit.get("levels", []):
                    info = level.get("pathLevelClientData", {})
                    add(info.get("skillId"), info.get("finishedLevels"), info.get("finishedSessions"))
    return list(found.values())



def course_summary(course):
    return {key: course.get(key) for key in ("id", "title", "learningLanguage", "fromLanguage")}



def unit_index(course):
    """Keep observed unit/skill links, without claiming a word-to-unit mapping."""
    result = []
    for section_number, section in enumerate(course.get("pathSectioned", []), 1):
        for unit_number, unit in enumerate(section.get("units", []), 1):
            skill_ids = set()
            for level in unit.get("levels", []):
                for field in ("pathLevelClientData", "pathLevelMetadata"):
                    skill = level.get(field, {}).get("skillId")
                    if isinstance(skill, dict):
                        skill = skill.get("id")
                    if isinstance(skill, str):
                        skill_ids.add(skill)
            result.append({
                "sectionPosition": section_number,
                "unitPosition": unit_number,
                "unitIndex": unit.get("unitIndex"),
                "title": unit.get("teachingObjective") or unit.get("title"),
                "skillIds": sorted(skill_ids),
            })
    return result

