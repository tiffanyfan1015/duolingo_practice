import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswer, gradeWord, dueNow } from "../web/learning.mjs";
test("normalization accepts case/fullwidth without erasing German diacritics", () => {
  assert.equal(normalizeAnswer("  Ｈallo  "), "hallo");
  assert.notEqual(normalizeAnswer("schön"), normalizeAnswer("schon"));
  assert.notEqual(normalizeAnswer("ß"), "ss");
});
test("shared progress keeps notes and favorite, grows intervals and resets on lapse", () => {
  let r = { note: "note", star: true };
  r = gradeWord(r, true, 100);
  assert.equal(r.due, 86400100);
  r = gradeWord(r, true, 200);
  assert.equal(r.due, 259200200);
  r = gradeWord(r, false, 300);
  assert.equal(r.stage, 0);
  assert.equal(r.reviews, 3);
  assert.equal(r.due, 600300);
  assert.equal(r.star, true);
  assert.equal(r.note, "note");
  assert.equal(dueNow(r, 600299), false);
  assert.equal(dueNow(r, 600300), true);
  assert.equal(dueNow({}, 900000), false);
});
