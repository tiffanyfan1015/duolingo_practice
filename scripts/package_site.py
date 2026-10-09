"""Build a static-site ZIP without including exports or browser backups."""
from pathlib import Path
import argparse
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
ROOT_ASSETS = ('index.html', 'app.js', 'style.css', 'learning.mjs', 'data.json')
VENDOR_ASSETS = ('ts-fsrs.mjs', 'ts-fsrs.LICENSE', 'index.mjs.map')


def collect_assets(web_root):
    web_root = Path(web_root).resolve()
    paths = [web_root / name for name in ROOT_ASSETS]
    paths += [web_root / 'vendor' / name for name in VENDOR_ASSETS]
    for directory, extension in [('src', '*.mjs'), ('styles', '*.css')]:
        paths.extend(sorted((web_root / directory).rglob(extension)))
    for path in paths:
        if not path.is_file():
            raise ValueError(f'Missing website asset: {path.name}; run python build_web.py first.')
        if not path.resolve().is_relative_to(web_root):
            raise ValueError('Website assets must stay inside web/.')
    return paths


def package_site(web_root, output):
    web_root = Path(web_root).resolve()
    paths = collect_assets(web_root)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for path in paths:
            archive.write(path, path.relative_to(web_root).as_posix())
    return len(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts' / 'cijian-site.zip')
    args = parser.parse_args()
    count = package_site(ROOT / 'web', args.output)
    print(f'Packed {count} website files: {args.output}')
    print('Includes your vocabulary. No account token or browser progress is packaged. Not uploaded.')


if __name__ == '__main__':
    main()
