import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictionaryController } from '../web/src/dictionary-controller.mjs';

function fixture() {
  const pending = [], shown = [];
  const controller = createDictionaryController({
    lookup: () => new Promise((resolve, reject) => pending.push({resolve, reject})),
  }, (word, state) => shown.push({id: word.id, state}));
  const word = id => ({id, text: id, meanings: [], units: []});
  return {controller, pending, shown, word};
}

test('switching words prevents older successes and errors from replacing the current detail', async () => {
  const {controller, pending, shown, word} = fixture();
  const first = controller.load(word('first'), 'de');
  const second = controller.load(word('second'), 'de');
  pending[1].resolve({status:'ready', candidates:[]});
  await second;
  pending[0].reject(Error('late failure'));
  await first;
  assert.deepEqual(shown.map(item => [item.id, item.state.status]), [
    ['first','loading'], ['second','loading'], ['second','ready'],
  ]);
});

test('closing a detail invalidates pending work and reopening the same word starts a new request', async () => {
  const {controller, pending, shown, word} = fixture();
  const closed = controller.load(word('same'), 'ja');
  controller.invalidate();
  const reopened = controller.load(word('same'), 'ja');
  pending[0].resolve({status:'empty'});
  await closed;
  assert.equal(shown.length, 2);
  pending[1].reject(Error('retry later'));
  await reopened;
  assert.deepEqual(shown.at(-1), {id:'same', state:{status:'error', message:'retry later'}});
  const retry = controller.load(word('same'), 'ja');
  pending[2].resolve({status:'ready'});
  await retry;
  assert.equal(shown.at(-1).state.status, 'ready');
});
