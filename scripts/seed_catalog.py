"""Prepare an optional private seed for Cloudflare D1; never uploads it."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if __name__ == '__main__':
    data=json.loads((ROOT/'web/data.json').read_text(encoding='utf-8'))
    output=ROOT/'artifacts/catalog-seed.sql'
    output.parent.mkdir(exist_ok=True)
    statements=['CREATE TABLE IF NOT EXISTS catalogs (language TEXT PRIMARY KEY, payload TEXT NOT NULL);']
    for course in data['courses']:
        if course['id'] not in ('de','ja'): raise ValueError('Unknown language')
        payload=json.dumps(course,ensure_ascii=False).replace("'","''")
        statements.append("INSERT OR IGNORE INTO catalogs(language,payload) VALUES ('"+course['id']+"','"+payload+"');")
    output.write_text('\n'.join(statements),encoding='utf-8')
    print(f'Private seed created: {output}; import into D1, do not commit to Git.')
