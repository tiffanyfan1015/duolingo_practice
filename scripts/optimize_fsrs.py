"""Train locally from a website backup, leaving the backup unchanged."""
import argparse
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / '.deps')]
from learning_tools.optimizer import optimize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path)
    parser.add_argument('--language', choices=['de', 'ja'], required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    output = args.output or ROOT / 'artifacts' / f'fsrs-{args.language}.json'
    if output.resolve() == args.backup.resolve():
        parser.error('Output must not overwrite the input backup.')
    try:
        report = optimize(json.loads(args.backup.read_text(encoding='utf-8-sig')), args.language)
    except ImportError:
        parser.exit(1, 'Install: python -m pip install --target .deps fsrs-rs-python==0.9.3\n')
    except (ValueError, OSError) as exc:
        parser.exit(1, str(exc) + '\n')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(report['reason'])
    print(report['counts'])
    print(output)


if __name__ == '__main__':
    main()
