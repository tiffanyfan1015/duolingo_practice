"""Fixed official download locations; cache is local and ignored by Git."""
import gzip
import hashlib
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCES = {
    'de': ('https://kaikki.org/dictionary/downloads/de/de-extract.jsonl.gz', 'de-extract.jsonl.gz'),
    'ja': ('https://www.edrdg.org/pub/Nihongo/JMdict_e_examp.gz', 'JMdict_e_examp.gz'),
}


def download_sources(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    result = {}
    for language, (url, name) in SOURCES.items():
        target = folder / name
        if not valid_gzip(target):
            print('Downloading ' + url, flush=True)
            request = urllib.request.Request(url, headers={'User-Agent': 'CijianVocabularyPilot/1.0'})
            temporary = target.with_suffix(target.suffix + '.part')
            try:
                with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                if not valid_gzip(temporary):
                    raise ValueError('Incomplete gzip download: ' + url + '; please retry.')
                os.replace(temporary, target)
            except Exception:
                temporary.unlink(missing_ok=True)
                raise
            target.with_suffix(target.suffix + '.source.json').write_text(json.dumps({
                'url': url, 'downloadedAt': datetime.now(timezone.utc).isoformat(),
                'sha256': digest(target),
            }, indent=2), encoding='utf-8')
        result[language] = target
    return result


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def valid_gzip(path):
    if not path.exists():
        return False
    try:
        with gzip.open(path, 'rb') as stream:
            while stream.read(1024 * 1024):
                pass
        return True
    except (EOFError, OSError):
        return False
