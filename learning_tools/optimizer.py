"""Prepare complete histories and train the official FSRS-6 Rust optimizer."""
import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime, timezone

DAY = 86_400_000


def histories(backup, language):
    if backup.get('schemaVersion') != 2:
        raise ValueError('Please export a schemaVersion 2 study backup from the website.')
    grouped, seen = defaultdict(list), {}
    for log in backup.get('review', {}).get('logs', []):
        if log.get('language') != language:
            continue
        if (not isinstance(log.get('cardId'), str) or
                not log['cardId'].startswith(language + ':') or
                type(log.get('rating')) is not int or log['rating'] not in (1, 2, 3, 4) or
                type(log.get('at')) not in (int, float) or
                not math.isfinite(log['at']) or not 0 <= log['at'] <= 8640000000000000 or
                not isinstance(log.get('id'), str)):
            raise ValueError('Invalid review log; no training performed.')
        if log['id'] in seen:
            if seen[log['id']] != log:
                raise ValueError('Conflicting duplicate review ID.')
            continue
        seen[log['id']] = log
        grouped[log['cardId']].append(log)
    result, excluded = {}, 0
    for card_id, logs in grouped.items():
        logs.sort(key=lambda log: log['at'])
        starts = [i for i, log in enumerate(logs) if log.get('wasNew') is True]
        if not starts:
            excluded += 1
            continue
        logs = logs[starts[-1]:]
        if any(a['at'] >= b['at'] for a, b in zip(logs, logs[1:])):
            raise ValueError('Two reviews of a card have the same timestamp.')
        if len(logs) > 1:
            result[card_id] = logs
    return result, excluded


def split_histories(groups):
    # Keep all directions of the same word together to avoid sibling leakage.
    notes = sorted({key.rsplit('::', 1)[0] for key in groups},
                   key=lambda key: hashlib.sha256(key.encode()).hexdigest())
    test_notes = set(notes[:max(1, len(notes) // 5)])
    train, test = {}, {}
    for key, logs in groups.items():
        (test if key.rsplit('::', 1)[0] in test_notes else train)[key] = logs
    return train, test


def samples(groups):
    """All history prefixes ending in an UTC-day advancing review, including short steps."""
    for card_id, logs in groups.items():
        sequence = []
        previous = logs[0]['at']
        for log in logs:
            delta = int(log['at'] // DAY - previous // DAY)
            sequence.append((log['rating'], delta))
            if delta > 0:
                yield card_id, list(sequence)
            previous = log['at']


def optimize(backup, language):
    groups, excluded = histories(backup, language)
    train, test = split_histories(groups)
    train_samples, test_samples = list(samples(train)), list(samples(test))
    report = dict(schemaVersion=1, algorithm='FSRS-6', language=language,
                  trainedAt=datetime.now(timezone.utc).isoformat(), accepted=False,
                  counts=dict(cards=len(groups), excludedIncompleteCards=excluded,
                              training=len(train_samples), validation=len(test_samples)))
    # A conservative product threshold, not an Anki requirement.
    enough = (len(train_samples) >= 100 and len(test_samples) >= 20 and len(groups) >= 20)
    varied = all({seq[-1][0] != 1 for _, seq in part} == {True, False}
                 for part in (train_samples, test_samples))
    if not enough or not varied:
        report['reason'] = 'insufficient-history: need 20 cards, 100 training + 20 validation long-term reviews, successes and failures in both sets'
        return report
    from importlib.metadata import version
    from fsrs_rs_python import FSRS, FSRSItem, FSRSReview
    if version('fsrs-rs-python') != '0.9.3':
        raise ValueError('This adapter requires fsrs-rs-python==0.9.3.')
    import subprocess
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    defaults = json.loads(subprocess.check_output(
        ['node', str(root / 'scripts' / 'fsrs-weights.mjs')], text=True))
    current = backup['review'].get('settings', {}).get(language, {}).get('weights', defaults)
    def items(part):
        return [FSRSItem([FSRSReview(rating, days) for rating, days in seq]) for _, seq in part]
    ids = {key: i for i, key in enumerate(train)}
    candidate = FSRS(defaults).compute_parameters(
        items(train_samples), card_ids=[ids[key] for key, _ in train_samples],
        enable_short_term=True, num_relearning_steps=1)
    if len(candidate) != 21 or not all(math.isfinite(w) for w in candidate):
        raise ValueError('Optimizer returned incompatible parameters; expected FSRS-6 / 21 weights.')
    # Validate against the exact JS scheduler used in the app, not only the trainer.
    evaluation = json.loads(subprocess.check_output(
        ['node', str(root / 'scripts' / 'fsrs-weights.mjs'), '--evaluate'],
        input=json.dumps(dict(groups=test, baseline=current, candidate=candidate)), text=True))
    report.update(weights=candidate, validation=evaluation, optimizer='fsrs-rs-python 0.9.3')
    report['accepted'] = evaluation['candidateLogLoss'] < evaluation['baselineLogLoss'] - 0.001
    report['reason'] = 'validation-improved' if report['accepted'] else 'no-validation-improvement: keep current parameters'
    return report
