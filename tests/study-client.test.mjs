import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyClient } from '../web/src/services/study-client.mjs';

test('study client validates snapshots and retains identity and conflict metadata', async () => {
  let payload = {revision:1,cells:{'["word","de:Haus","note"]':'home'}}, status = 200;
  const calls = [];
  const client = createStudyClient('alice',async (url,options) => {
    calls.push({url,...options});
    return Response.json(payload,{status});
  });
  assert.deepEqual(await client.get(0),payload);
  assert.equal(calls[0].headers['X-Cijian-User'],'alice');
  payload = {revision:1,unchanged:true};
  assert.deepEqual(await client.get(1),payload);
  payload = {revision:2};
  assert.deepEqual(await client.put(1,{}),payload);
  assert.equal(calls.at(-1).headers['X-Study-Sync'],'1');
  assert.deepEqual(JSON.parse(calls.at(-1).body),{revision:1,cells:{}});
  for (const invalid of [{revision:'2',cells:{}},{revision:-1,cells:{}},{revision:2,cells:{'["card","de:Haus"]':{memory:null}}}]) {
    payload = invalid;
    await assert.rejects(client.get(1),/格式|欄位/);
  }
  status=409;payload={error:'其他裝置已有更新。',code:'revision-conflict'};
  await assert.rejects(client.put(1,{}),error => error.status===409 && error.code==='revision-conflict');
});
