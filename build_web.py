"""Build entry point; pipeline implementation lives in vocab_sync."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.deps'))

from vocab_sync.dataset import build_dataset
from vocab_sync.enrichment import TextEnricher


def build():
    output, count = build_dataset(ROOT, TextEnricher())
    print(f'Built {count} words: {output}')


if __name__ == '__main__':
    build()
