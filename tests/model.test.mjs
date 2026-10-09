import { test } from "node:test";
import assert from "node:assert/strict";
import { default_w } from "../web/vendor/ts-fsrs.mjs";
import { parseModel } from "../web/src/domain/fsrs-model.mjs";
import { previewRatings } from "../web/src/services/fsrs-scheduler.mjs";
import { createReviewStore } from "../web/src/services/review-store.mjs";
import { createReviewController } from "../web/src/review-controller.mjs";
const weights = [...default_w];
weights[2] = 10;
weights[8] = 3;
const model = {
  schemaVersion: 1,
  algorithm: "FSRS-6",
  language: "de",
  weights,
  accepted: true,
  trainedAt: "2026-09-26",
  validation: { baselineLogLoss: 0.4, candidateLogLoss: 0.3 },
};
test("only compatible, improved models for selected language are accepted", () => {
  assert.deepEqual(parseModel(JSON.stringify(model), "de").weights, weights);
  for (const patch of [
    { language: "ja" },
    { accepted: false },
    { weights: [] },
    { weights: weights.map(() => null) },
    { algorithm: "FSRS-5" },
    { validation: { baselineLogLoss: 0.2, candidateLogLoss: 0.3 } },
  ])
    assert.throws(() =>
      parseModel(JSON.stringify({ ...model, ...patch }), "de"),
    );
});
test("personal model persists, changes scheduling and reset preserves card due dates", () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  const store = createReviewStore(storage);
  const course = { id: "de", words: [] };
  const controller = createReviewController({
    store,
    progress: { records: {} },
    audio: { stop() {} },
    course: () => course,
    unit: () => "",
    romaji: () => false,
    notify: () => {},
  });
  controller.importModel(JSON.stringify(model));
  controller.configure({ newLimit: 7 });
  assert.deepEqual(store.settings("de").weights, weights);
  assert.equal(store.settings("ja").weights, undefined);
  assert.deepEqual(createReviewStore(storage).settings("de").weights, weights);
  const now = Date.UTC(2026, 8, 1);
  const card = {
    memory: {
      ...previewRatings({}, 0.9, now)[3].memory,
      state: 2,
      learning_steps: 0,
    },
  };
  assert.notDeepEqual(
    previewRatings(card, 0.9, now + 86400000, weights),
    previewRatings(card, 0.9, now + 86400000),
  );
  store.rate(
    { id: "de:Test::recognition", language: "de", noteId: "de:Test" },
    previewRatings({}, 0.9, now)[3],
    3,
    [],
    {},
    now,
  );
  const before = JSON.stringify(store.records);
  controller.action("reset-model");
  assert.equal(store.settings("de").weights, undefined);
  assert.equal(JSON.stringify(store.records), before);
});
