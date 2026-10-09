"""Experimental skill filtering probe; no official word/unit assignments claimed."""
from datetime import datetime, timezone
import json
import time

from .errors import SyncError
from .course import course_summary, unit_index, progressed_skills
from .api import fetch_words


def analyze(baseline, probes, units, complete):
    baseline_set = {w['text'] for w in baseline}
    sets = [set(p['wordTexts']) for p in probes]
    union = set().union(*sets) if sets else set()
    outside = union - baseline_set
    distinct = {frozenset(s) for s in sets if s}
    proper = [s for s in sets if s and s < baseline_set]
    # Two differing, non-empty strict subsets are evidence of filtering, not proof
    # of first teaching location. Any out-of-baseline result invalidates mapping.
    if outside or len(baseline_set) != len(baseline):
        status = 'inconsistent_results'
    elif len(sets) >= 3 and all(s == baseline_set for s in sets):
        status = 'filter_not_demonstrated'
    elif len(distinct) >= 2 and len(proper) >= 2:
        status = 'filter_supported' if complete else 'partial_filter_evidence'
    else:
        status = 'inconclusive'
    candidates = []
    if status in ('filter_supported', 'partial_filter_evidence'):
        for word in baseline:
            skill_ids = [p['skillId'] for p in probes if word['text'] in p['wordTexts']]
            matching = [u for u in units if set(u['skillIds']) & set(skill_ids)]
            candidates.append({
                'text': word['text'], 'candidateSkillIds': skill_ids,
                'candidateUnits': matching,
                'status': 'inferred' if matching else 'unmapped',
            })
    return {
        'status': status, 'allSkillsQueried': complete,
        'baselineUniqueCount': len(baseline_set), 'queriedSkillCount': len(probes),
        'coveredBaselineCount': len(union & baseline_set),
        'uncoveredWords': sorted(baseline_set - union),
        'outsideBaselineWords': sorted(outside),
        'candidateMappings': candidates,
        'limitation': 'Skill-filter results and course skill/unit links imply candidate units only. They do not establish the first unit that taught a word or prove the learner has completed those units.',
    }


def probe_units(client, user_id, course, skills, baseline, directory):
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    path = directory / f"{course['learningLanguage']}-from-{course['fromLanguage']}-{stamp}-unit-probe.json"
    units = unit_index(course)
    report = {
        'schemaVersion': 1, 'kind': 'unit-filter-probe',
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'course': course_summary(course), 'baselineWordCount': len(baseline),
        'totalLearnedSkills': len(skills), 'units': units, 'probes': [],
        'runStatus': 'running',
    }

    def save():
        report['analysis'] = analyze(baseline, report['probes'], units,
                                     len(report['probes']) == len(skills))
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(path)

    save()
    print(f'驗證紀錄：{path}', flush=True)
    try:
        for index, skill in enumerate(skills, 1):
            print(f'查詢已學技能 {index}/{len(skills)}', flush=True)
            time.sleep(1)
            words = fetch_words(client, user_id, course, [skill], allow_empty=True)
            report['probes'].append({
                'skillId': skill['skillId']['id'], 'submittedProgress': skill,
                'wordCount': len(words), 'wordTexts': sorted({w['text'] for w in words}),
            })
            save()
            if report['analysis']['status'] in ('filter_not_demonstrated', 'inconsistent_results'):
                report['runStatus'] = 'stopped_early'
                save()
                print('目前回應無法支持可靠的技能篩選，已停止其餘請求；請查看報告。')
                return path
        # Detect progress/course drift before treating this as a completed run.
        profile = client.request(f'/2023-05-23/users/{user_id}?fields=currentCourse')
        latest = profile.get('currentCourse', {}) if isinstance(profile, dict) else {}
        if (course_summary(latest) != course_summary(course)
                or progressed_skills(latest) != skills):
            raise SyncError('驗證期間課程或進度改變，結果只保留供診斷，請課程穩定後重試。')
        report['runStatus'] = 'completed'
        save()
        print(f"驗證結果：{report['analysis']['status']}；涵蓋 {report['analysis']['coveredBaselineCount']}/{report['analysis']['baselineUniqueCount']} 個單字。")
        return path
    except (SyncError, KeyboardInterrupt) as exc:
        report['runStatus'] = 'interrupted' if isinstance(exc, KeyboardInterrupt) else 'failed'
        report['error'] = 'Cancelled by user' if isinstance(exc, KeyboardInterrupt) else str(exc)
        save()
        # Failed runs retain observations but do not advertise usable mappings.
        report['analysis']['status'] = 'incomplete_run'
        report['analysis']['candidateMappings'] = []
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
