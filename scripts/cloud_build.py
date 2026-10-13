"""Compatibility CLI for the TypeScript/esbuild cloud build."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def build(output=None, include_personal=False):
    output = (output or ROOT / 'dist').resolve()
    if output.parent != ROOT or output.name != 'dist':
        raise ValueError('Build output must be this project/dist.')
    command = ['node', str(ROOT / 'scripts' / 'cloud-build.mjs')]
    if include_personal:
        command.append('--include-personal')
    subprocess.run(command, cwd=ROOT, check=True)
    return output


if __name__ == '__main__':
    build()
