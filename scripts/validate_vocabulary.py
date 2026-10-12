"""Query dictionary APIs and produce a private vocabulary validation report."""
import argparse
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / '.deps'))
from vocab_sync.pilot.dictionary_api import DictionaryAPI
from vocab_sync.pilot.download import download_sources
from vocab_sync.pilot.report import build_report, render_report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--download', action='store_true', help='Download/cache about 300 MB of public dictionary data')
    p.add_argument('--source', choices=['api', 'local'], default='api', help='Default: per-word API; local uses existing dictionary files')
    p.add_argument('--catalog', type=Path, default=ROOT / 'web/data.json')
    p.add_argument('--german', type=Path, default=ROOT / 'data/dictionaries/de-extract.jsonl.gz')
    p.add_argument('--jmdict', type=Path, default=ROOT / 'data/dictionaries/JMdict_e_examp.gz')
    p.add_argument('--limit', type=int, default=20)
    p.add_argument('--output', type=Path, default=ROOT / 'artifacts/vocabulary-pilot')
    a = p.parse_args()
    if not 1 <= a.limit <= 100:
        p.error('--limit must be between 1 and 100')
    paths = {'de': a.german, 'ja': a.jmdict}
    try:
        if a.download:
            paths = download_sources(ROOT / 'data/dictionaries')
        convert = lambda text: text
        try:
            from opencc import OpenCC
            convert = OpenCC('s2twp').convert
        except ImportError:
            pass
        api = DictionaryAPI(ROOT / 'data/dictionaries/api-cache', convert=convert) if a.source == 'api' and not a.download else None
        report = build_report(json.loads(a.catalog.read_text(encoding='utf-8-sig')), paths, a.limit, api=api)
    except (OSError, ValueError, EOFError) as exc:
        p.exit(1, str(exc) + '\n')
    a.output.mkdir(parents=True, exist_ok=True)
    (a.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (a.output / 'report.html').write_text(render_report(report), encoding='utf-8')
    print(json.dumps(report['counts']))
    print(a.output / 'report.html')


if __name__ == '__main__':
    main()
