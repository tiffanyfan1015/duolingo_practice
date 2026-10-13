import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import worker from '../../dist/_worker.js';
import { testDatabase } from '../helpers/database.mjs';

test('bundled Worker authenticates and round-trips study data through D1', async t => {
  const DB = testDatabase();
  t.after(() => DB.close());
  const env = {DB, MULTI_USER:'true', CREDENTIAL_KEY:'ab'.repeat(32), REGISTRATION_CODE:'build-test-invitation-code', ASSETS:{fetch:async () => new Response('asset')}};
  const origin = 'https://build.test';
  assert.equal((await worker.fetch(new Request(origin + '/api/study'), env)).status, 401);
  const register = await worker.fetch(new Request(origin + '/api/account/register', {
    method:'POST', headers:{Origin:origin, 'Content-Type':'application/json','X-Cijian-Account':'1'},
    body:JSON.stringify({username:'build-test',password:'synthetic-password-123',invite:env.REGISTRATION_CODE}),
  }), env);
  assert.equal(register.status, 200);
  const {user} = await register.json();
  const headers = {Cookie:register.headers.get('Set-Cookie').split(';')[0],'X-Cijian-User':user.id};
  const cells = {'["word","de:Haus","note"]':'build preserves notes'};
  const write = await worker.fetch(new Request(origin + '/api/study', {
    method:'PUT',headers:{...headers,Origin:origin,'Content-Type':'application/json','X-Study-Sync':'1'},body:JSON.stringify({revision:0,cells}),
  }),env);
  assert.equal(write.status,200);
  const read = await worker.fetch(new Request(origin + '/api/study',{headers}),env);
  assert.deepEqual(await read.json(),{revision:1,cells});
  assert.equal((await worker.fetch(new Request(origin + '/data.json',{headers}),env)).status,404);
});

test('deployment output contains public assets and a self-contained Worker only', async () => {
  const names = await readdir(new URL('../../dist/',import.meta.url),{recursive:true});
  assert.ok(names.includes('_worker.js'));
  assert.ok(names.some(name => name.replaceAll('\\','/') === 'src/domain/study-validation.mjs'));
  assert.ok(!names.some(name => /(^|[/\\])(data\.json|\.env|\.dev\.vars|node_modules|server|shared)([/\\]|$)|\.(ts|py)$/.test(name)));
  const source = await readFile(new URL('../../dist/_worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfrom\s+["'][^"']+\.(ts|mjs)["']/);
  assert.match(await readFile(new URL('../../dist/.assetsignore',import.meta.url),'utf8'),/_worker\.js/);
});
