import test from "node:test";
import assert from "node:assert/strict";
import { cardsForCourse, effectiveRecord } from "../web/src/domain/cards.mjs";
import { reviewQueue, nextDay } from "../web/src/domain/review-queue.mjs";
import { createReviewStore } from "../web/src/services/review-store.mjs";
import { previewRatings } from "../web/src/services/fsrs-scheduler.mjs";
import { createProgressStore } from "../web/src/services/progress-store.mjs";
import {
  exportCollection,
  importCollection,
} from "../web/src/services/collection-backup.mjs";

const now = new Date(2026, 8, 22, 10).getTime();
const course = {
  id: "de",
  words: [
    { id: "de:a", text: "Haus", meanings: ["house"], units: ["u1", "u2"] },
    { id: "de:b", text: "Buch", meanings: ["book"], units: ["u2"] },
  ],
};
const cards = cardsForCourse(course);
const storage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key),
    setItem: (key, value) => map.set(key, value),
  };
};
const queue = (store, time = now, extra = {}) =>
  reviewQueue({
    cards,
    records: store.records,
    logs: store.logs,
    settings: store.settings("de"),
    now: time,
    ...extra,
  });

test("FSRS previews survive serialization and Again follows learning steps", () => {
  const previews = previewRatings({}, 0.9, now);
  assert.equal(previews[1].memory.due, now + 60000);
  assert.equal(previews[3].memory.due, now + 600000);
  assert.equal(previews[4].memory.state, 2);
  assert.ok(previews[4].memory.due > previews[3].memory.due);
  const record = JSON.parse(JSON.stringify({ memory: previews[1].memory }));
  const next = previewRatings(record, 0.9, now + 60000);
  assert.equal(next[3].memory.reps, 2);
  const lapse = previewRatings(
    { memory: previews[4].memory },
    0.9,
    previews[4].memory.due,
  )[1].memory;
  assert.equal(lapse.state, 3);
  assert.equal(lapse.lapses, 1);
});

test("independent card directions, sibling burying, persistence and undo restore quotas", () => {
  const disk = storage(),
    store = createReviewStore(disk);
  store.setSettings("de", {
    newLimit: 1,
    templates: ["recognition", "recall", "listening"],
  });
  const card = cards[0];
  store.rate(card, previewRatings({}, 0.9, now)[3], 3, cards, {}, now);
  assert.equal(store.records[cards[1].id].memory, undefined);
  assert.equal(store.records[cards[1].id].buriedUntil, nextDay(now));
  assert.equal(queue(store).newCount, 0);
  assert.equal(queue(store, now + 600000).learningCount, 1);
  assert.equal(createReviewStore(disk).records[card.id].memory.reps, 1);
  assert.equal(queue(store, nextDay(now)).newCount, 1);
  assert.equal(store.undo(), card.id);
  assert.equal(store.logs.length, 0);
  assert.equal(Object.keys(store.records).length, 0);
  assert.equal(queue(store).newCount, 1);
});

test("new quota is shared across unit decks and review caps never suppress learning", () => {
  const store = createReviewStore(storage());
  store.setSettings("de", { newLimit: 1, reviewLimit: 0 });
  store.rate(cards[0], previewRatings({}, 0.9, now)[1], 1, cards, {}, now);
  assert.equal(queue(store, now, { unit: "u2" }).newCount, 0);
  assert.equal(queue(store, now + 60000, { unit: "u2" }).learningCount, 1);
  assert.equal(queue(store, now + 60000, { unit: "u1" }).queue.length, 1);
});

test("suspend is indefinite, bury expires tomorrow and learning siblings remain active", () => {
  const store = createReviewStore(storage());
  store.setSettings("de", { templates: ["recognition", "recall"] });
  store.rate(cards[1], previewRatings({}, 0.9, now)[1], 1, cards, {}, now);
  store.restoreCard(cards[0], {}, now);
  store.rate(cards[0], previewRatings({}, 0.9, now)[1], 1, cards, {}, now);
  assert.ok(!(store.records[cards[1].id].buriedUntil > now));
  store.hide(cards[0], "suspend", {}, now);
  assert.ok(
    !queue(store, nextDay(now)).queue.some((card) => card.id === cards[0].id),
  );
  store.restoreCard(cards[0], {}, now);
  assert.ok(
    queue(store, now + 60000).queue.some((card) => card.id === cards[0].id),
  );
  store.hide(cards[0], "bury", {}, now);
  assert.ok(
    !queue(store, now + 60000).queue.some((card) => card.id === cards[0].id),
  );
  assert.ok(
    queue(store, nextDay(now)).queue.some((card) => card.id === cards[0].id),
  );
});

test("legacy due dates are respected without inventing FSRS memory", () => {
  const legacyWords = { "de:a": { reviews: 3, due: now + 86400000 } };
  const record = effectiveRecord(cards[0], {}, legacyWords);
  assert.equal(record.memory, undefined);
  assert.equal(effectiveRecord(cards[1], {}, legacyWords).reviews, undefined);
  const store = createReviewStore(storage());
  assert.ok(
    !queue(store, now, { legacyWords }).queue.some(
      (card) => card.id === cards[0].id,
    ),
  );
  assert.equal(queue(store, now + 86400000, { legacyWords }).reviewCount, 1);
});

test("collection backup imports both versions, retains newer memory and rejects malformed memory atomically", () => {
  const progress = createProgressStore(storage()),
    store = createReviewStore(storage());
  const catalog = { courses: [course] };
  progress.setNote("de:a", "my note");
  store.rate(cards[0], previewRatings({}, 0.9, now)[3], 3, cards, {}, now);
  const backup = exportCollection(progress, store);
  const restored = createReviewStore(storage()),
    restoredProgress = createProgressStore(storage());
  importCollection(backup, catalog, restoredProgress, restored);
  assert.equal(restoredProgress.get("de:a").note, "my note");
  assert.deepEqual(
    restored.records[cards[0].id].memory,
    store.records[cards[0].id].memory,
  );
  restored.hide(cards[0], "suspend", {}, now + 1000);
  importCollection(backup, catalog, restoredProgress, restored);
  assert.equal(restored.records[cards[0].id].suspended, true);
  importCollection(progress.serialize(), catalog, restoredProgress, restored);
  assert.equal(restored.logs.length, 1);
  const corrupt = JSON.parse(backup);
  corrupt.review.cards[cards[0].id].memory.stability = -1;
  const before = restored.snapshot();
  assert.throws(() =>
    importCollection(
      JSON.stringify(corrupt),
      catalog,
      restoredProgress,
      restored,
    ),
  );
  assert.deepEqual(restored.snapshot(), before);
});
