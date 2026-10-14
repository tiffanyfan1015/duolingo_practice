import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../web/src/', import.meta.url);
async function importsIn(folder) {
  const directory = new URL(folder, root);
  const result = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.mjs')) continue;
    const file = new URL(name, directory);
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+[\s\S]*?\bfrom\s*["']([^"']+)["']/g)) {
      result.push({file, target:new URL(match[1],file)});
    }
  }
  return result;
}

test('domain dependencies stay inside the domain, and views depend only on views or domain', async () => {
  const domain = new URL('domain/', root).href;
  const views = new URL('ui/views/', root).href;
  for (const {file,target} of await importsIn('domain/')) {
    assert.ok(target.href.startsWith(domain), `${file.pathname} must not depend on ${target.pathname}`);
  }
  for (const {file,target} of await importsIn('ui/views/')) {
    assert.ok(target.href.startsWith(views) || target.href.startsWith(domain), `${file.pathname} must not depend on ${target.pathname}`);
  }
});
