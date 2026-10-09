"""Serve only the generated website, never credentials or source exports."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--lan', action='store_true', help='Allow phones on your local network')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent / 'web'
    if not (root / 'data.json').exists():
        parser.error('Run python build_web.py first')
    host = '0.0.0.0' if args.lan else '127.0.0.1'
    print(f'Vocabulary site: http://127.0.0.1:{args.port} (LAN enabled: {args.lan})', flush=True)
    ThreadingHTTPServer((host, args.port), partial(SimpleHTTPRequestHandler, directory=str(root))).serve_forever()
