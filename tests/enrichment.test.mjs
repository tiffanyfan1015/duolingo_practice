import test from "node:test";
import assert from "node:assert/strict";
import { enrichCourse } from "../server/sync/enrichment.ts";
import { api } from "../server/sync/routes.ts";
import { repository } from "../server/sync/repository.ts";
import { testDatabase } from "./helpers/database.mjs";

const course = (fromLanguage = "zh") => ({
  id: "ja", language: "ja", fromLanguage, name: "日文",
  words: [{ id: "ja:図書館", text: "図書館", meanings: ["图书馆", "圖書館", "自行车"], units: ["u1"], reading: "としょかん", romaji: "toshokan", audio: "https://audio.test/a" }],
  units: [{ id: "u1", section: 1, position: 1, title: "学习书写" }],
});

test("Chinese meanings use Taiwan phrases without changing Japanese text, IDs, readings or input data", () => {
  const original = course(), snapshot = structuredClone(original);
  const result = enrichCourse(original);
  assert.deepEqual(result.words[0].meanings, ["圖書館", "腳踏車"]);
  assert.deepEqual({ ...result.words[0], meanings: [] }, { ...original.words[0], meanings: [] });
  assert.equal(result.units[0].title, "學習書寫");
  assert.deepEqual(original, snapshot);
  assert.deepEqual(enrichCourse(result), result);
  assert.equal(enrichCourse(course("en")).words[0].meanings[0], "图书馆");
  assert.equal(enrichCourse(course("ja")).words[0].meanings[0], "图书馆");
  for (const code of ["zs", "zt", "zh-CN", "zh-TW"])
    assert.equal(enrichCourse(course(code)).words[0].meanings[0], "圖書館");
  const legacy = course(); delete legacy.fromLanguage;
  assert.equal(enrichCourse(legacy).words[0].meanings[0], "圖書館");
});

test("existing D1 and static catalogs display Traditional Chinese without resync or database mutation", async t => {
  const DB = testDatabase(); t.after(() => DB.close());
  await repository(DB).init();
  const legacy = course(); delete legacy.fromLanguage;
  await DB.prepare("INSERT INTO catalogs VALUES(?,?)").bind("ja", JSON.stringify(legacy)).run();
  const ASSETS = { fetch: async () => Response.json({ courses: [legacy] }) };
  for (const env of [{DB, ASSETS}, {ASSETS}]) {
    const response = await api(new Request("https://app.test/api/catalog"), env);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).courses[0].words[0].meanings, ["圖書館", "腳踏車"]);
  }
  assert.deepEqual((await repository(DB).courses())[0], legacy);
});
