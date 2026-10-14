import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  revealAnswer,
  advanceSession,
} from "../web/src/domain/session.mjs";
import { filterWords } from "../web/src/domain/vocabulary.mjs";
import { cleanSettings } from "../web/src/domain/review-state.mjs";
import { packStudy, unpackStudy } from "../web/src/domain/study-sync.mjs";
import {
  createProgressStore,
  STORAGE_KEY,
} from "../web/src/services/progress-store.mjs";

const word = {
  id: "ja:test",
  text: "猫",
  reading: "ねこ",
  meanings: ["貓"],
  romaji: "neko",
  units: ["s1u1", "s1u2"],
};
test("default review settings stay omitted on the wire and are restored independently", () => {
  const settings = cleanSettings();
  const cells = packStudy({words:{},settings:{}}, {cards:{},logs:[],settings:{de:settings}});
  assert.deepEqual(cells, {});
  assert.deepEqual(cleanSettings(unpackStudy(cells).review.settings.de), settings);
  settings.templates.push('listening');
  assert.deepEqual(cleanSettings().templates, ['recognition']);
});
function storage(initial = null) {
  let text = initial;
  return {
    getItem() {
      return text;
    },
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      text = value;
    },
  };
}

test("session transitions cannot grade unrevealed cards or advance twice", () => {
  const session = createSession([word], 10, () => 0);
  assert.equal(advanceSession(session, true), session);
  const revealed = revealAnswer(session, "ねこ", "ja");
  assert.equal(revealed.correct, true);
  assert.equal(session.revealed, false);
  const next = advanceSession(revealed, true);
  assert.equal(next.index, 1);
  assert.equal(next.good, 1);
  assert.equal(advanceSession(next, true), next);
});

test("same word shares progress across units; unreviewed words are not due", () => {
  const records = { [word.id]: { reviews: 1, due: 10 } };
  for (const unit of word.units) {
    assert.equal(
      filterWords([word], records, { unit, status: "due" }, 20).length,
      1,
    );
  }
  assert.equal(filterWords([word], {}, { status: "due" }, 20).length, 0);
});

test("old localStorage schema survives refactor; backup cannot overwrite newer progress", () => {
  const disk = storage(
    JSON.stringify({
      words: { [word.id]: { reviews: 3, updatedAt: 100, note: "keep" } },
      settings: { romaji: true },
    }),
  );
  const store = createProgressStore(disk);
  assert.equal(store.romaji, true);
  const count = store.import(
    JSON.stringify({
      schemaVersion: 1,
      words: {
        [word.id]: { reviews: 1, updatedAt: 50 },
        unknown: { updatedAt: 900 },
      },
    }),
    new Set([word.id]),
  );
  assert.equal(count, 0);
  assert.equal(store.get(word.id).reviews, 3);
  store.grade(word.id, true);
  assert.equal(store.get(word.id).note, "keep");
  assert.equal(createProgressStore(disk).get(word.id).reviews, 4);
});

test("invalid backup leaves data intact and storage failures are reported", () => {
  let message = "";
  const store = createProgressStore(
    {
      getItem() {
        return "invalid";
      },
      setItem() {
        throw Error();
      },
    },
    (text) => {
      message = text;
    },
  );
  assert.throws(() =>
    store.import('{"schemaVersion":2,"words":{}}', new Set()),
  );
  store.setRomaji(true);
  assert.ok(message);
  assert.equal(store.romaji, true);
});
