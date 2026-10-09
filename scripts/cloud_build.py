"""Build a Git-safe Cloudflare Pages directory; personal vocabulary is optional."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
MODULES = ['basic-auth.mjs', 'sync/duolingo.mjs', 'sync/domain.mjs', 'sync/repository.mjs', 'sync/user-repository.mjs', 'sync/service.mjs', 'accounts/crypto.mjs', 'accounts/repository.mjs', 'accounts/service.mjs', 'accounts/routes.mjs', 'sync/routes.mjs', 'multi-user.mjs', 'worker.mjs']


def build(output=None, include_personal=False):
    output = (output or ROOT / 'dist').resolve()
    if output.parent != ROOT or output.name != 'dist':
        raise ValueError('Build output must be this project/dist.')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    web = ROOT / 'web'
    files = [web / name for name in ['index.html', 'app.js', 'account.html', 'account.js', 'style.css', 'learning.mjs']]
    for folder, pattern in [('src','*.mjs'), ('styles','*.css'), ('vendor','*')]:
        files += [path for path in (web / folder).rglob(pattern) if path.is_file()]
    if include_personal and (web / 'data.json').exists(): files.append(web / 'data.json')
    for source in files:
        target = output / source.relative_to(web)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (output / '.assetsignore').write_text('_worker.js\n_routes.json\n', encoding='utf-8')
    chunks = []
    for name in MODULES:
        source = (ROOT / 'server' / name).read_text(encoding='utf-8-sig')
        source = re.sub(r'(?m)^import\s+\{[^}]+\}\s+from\s+[\'\"][^\'\"]+[\'\"];\s*', '', source)
        if re.search(r'^import ', source, re.MULTILINE): raise ValueError('Unsupported import in worker build')
        chunks.append(source)
    (output / '_worker.js').write_text('\n'.join(chunks), encoding='utf-8')
    (output / '_routes.json').write_text('{"version":1,"include":["/*"],"exclude":[]}', encoding='utf-8')
    print(f'Cloudflare build: {output}; personal vocabulary included: {include_personal}')
    return output


if __name__ == '__main__':
    build()
