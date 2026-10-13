import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { repository } from "../server/sync/repository.ts";
import { syncService } from "../server/sync/service.ts";
import { appendPage, emptyPage, courseState } from "../server/sync/domain.ts";
import {
  userId,
  createDuolingoClient,
  SyncError,
} from "../server/sync/duolingo.ts";
import worker from "../server/worker.ts";

function database() {
  const sql = new DatabaseSync(":memory:");
  const adapter = {
    prepare(query) {
      const statement = sql.prepare(query);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => ({
          meta: { changes: Number(statement.run(...args).changes) },
        }),
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter;
}
const profile = {
  currentCourse: {
    id: "course-de",
    learningLanguage: "de",
    fromLanguage: "zh",
    skills: [
      { id: "a", finishedLevels: 1 },
      { id: "b", finishedSessions: 2 },
      { id: "unlearned", finishedLevels: 0 },
    ],
    pathSectioned: [
      {
        units: [
          { title: "unit1", levels: [{ pathLevelMetadata: { skillId: "a" } }] },
          { title: "unit2", levels: [{ pathLevelMetadata: { skillId: "b" } }] },
        ],
      },
    ],
  },
};
const words = [
  { text: "Haus", translations: ["房子"] },
  { text: "Buch", translations: ["书"] },
];
const page = (items, next = null, total = items.length) => ({
  learnedLexemes: items,
  pagination: { nextStartIndex: next, totalLexemes: total },
});
function client() {
  return {
    profile: async () => structuredClone(profile),
    page: async (course, skills, start) =>
      skills.length === 2
        ? page([words[start]], start === 0 ? 1 : null, 2)
        : page([words[skills[0].skillId.id === "a" ? 0 : 1]]),
  };
}
async function setup() {
  const db = database(),
    repo = repository(db);
  await repo.init();
  return { db, repo, service: syncService(repo, client()) };
}

test("mobile sync resumes, validates units and atomically publishes only the selected language", async () => {
  const { db, repo, service } = await setup();
  await db
    .prepare("INSERT INTO catalogs VALUES(?,?)")
    .bind("ja", JSON.stringify({ id: "ja", words: [{ text: "old" }] }))
    .run();
  let job = await service.start("de");
  job = await service.step("de", job.id);
  assert.equal(job.count, 1);
  assert.equal((await repo.courses()).length, 1);
  const resumed = await syncService(repo, client()).start("de");
  assert.equal(resumed.id, job.id);
  for (let i = 0; job.phase !== "done" && i < 10; i++)
    job = await service.step("de", job.id);
  assert.equal(job.phase, "done");
  const courses = await repo.courses(),
    de = courses.find((c) => c.id === "de");
  assert.equal(de.words.length, 2);
  assert.deepEqual(
    de.words.map((w) => w.id),
    ["de:Haus", "de:Buch"],
  );
  assert.deepEqual(de.words[0].units, ["s1u1"]);
  assert.equal(courses.find((c) => c.id === "ja").words[0].text, "old");
  assert.deepEqual(await service.step("de", job.id), job);
});

test("a failed fetch or changed course never replaces the existing catalog", async () => {
  const { db, repo, service } = await setup();
  await db
    .prepare("INSERT INTO catalogs VALUES(?,?)")
    .bind("de", '{"id":"de","words":[{"text":"old"}]}')
    .run();
  let job = await service.start("de");
  const failing = syncService(repo, {
    ...client(),
    page: async () => {
      throw new SyncError("network", 502);
    },
  });
  await assert.rejects(failing.step("de", job.id));
  assert.equal((await repo.get("de")).page.next, 0);
  while (job.phase !== "verify") job = await service.step("de", job.id);
  const changed = structuredClone(profile);
  changed.currentCourse.skills[0].finishedLevels = 2;
  await assert.rejects(
    syncService(repo, { ...client(), profile: async () => changed }).step(
      "de",
      job.id,
    ),
    /進度/,
  );
  assert.equal((await repo.courses())[0].words[0].text, "old");
});

test("stale concurrent requests cannot publish or overwrite newer state", async () => {
  const { repo, service } = await setup();
  const job = await service.start("de");
  const stale = await repo.get("de");
  await service.step("de", job.id);
  await assert.rejects(
    repo.save(stale, { id: "de", words: [{ text: "stale" }] }),
    /另一個/,
  );
  assert.equal((await repo.courses()).length, 0);
  assert.equal((await repo.get("de")).words.length, 1);
});

test("malformed pagination, duplicate words and wrong language stop safely", () => {
  assert.throws(() => appendPage(emptyPage(), page(words, 0)), /分頁/);
  assert.throws(
    () => appendPage(emptyPage(), page([words[0], words[0]])),
    /重複/,
  );
  assert.throws(() => appendPage(emptyPage(), page(words, null, 3)), /不完整/);
  assert.throws(() => courseState(profile, "ja"), /切換/);
  assert.equal(courseState(profile, "de").skills.length, 2);
});

test("API requires login, rejects cross-site sync, and never returns credentials", async () => {
  const { db } = await setup();
  const secret = "test-password-1234567890123456";
  const env = {
    SITE_PASSWORD: secret,
    DB: db,
    DUOLINGO_JWT: "secret-value",
    ASSETS: { fetch: async () => new Response("", { status: 404 }) },
  };
  assert.equal(
    (
      await worker.fetch(
        new Request("https://app.test/api/sync/status?language=de"),
        env,
      )
    ).status,
    401,
  );
  const headers = {
    Authorization: "Basic " + btoa("owner:" + secret),
    "Content-Type": "application/json",
    "X-Cijian-Sync": "1",
    Origin: "https://evil.test",
  };
  const denied = await worker.fetch(
    new Request("https://app.test/api/sync/start?language=de", {
      method: "POST",
      headers,
      body: "{}",
    }),
    env,
  );
  assert.equal(denied.status, 403);
  const result = await worker.fetch(
    new Request("https://app.test/api/sync/status?language=de", { headers }),
    env,
  );
  assert.equal(result.status, 200);
  assert.ok(!(await result.text()).includes("secret-value"));
});

test("Duolingo client confines credentials to its API and reports expired or refused login", async () => {
  const token =
    "a." +
    btoa(JSON.stringify({ sub: "123", exp: Date.now() / 1000 + 60 })) +
    ".z";
  assert.equal(userId(token), "123");
  assert.throws(
    () => userId("a." + btoa(JSON.stringify({ sub: "123", exp: 1 })) + ".z"),
    /過期/,
  );
  const api = createDuolingoClient(token, async (url, options) => {
    assert.match(url, /^https:\/\/www.duolingo.com\//);
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer " + token);
    return new Response("", { status: 403 });
  });
  await assert.rejects(api.profile(), /拒絕/);
});

test("JWT without exp is validated by Duolingo; malformed expiry is rejected", () => {
  const encode = (payload) => "a." + btoa(JSON.stringify(payload)) + ".z";
  assert.equal(userId(encode({ sub: "123" })), "123");
  for (const exp of [null, "tomorrow", false, 0]) {
    assert.throws(() => userId(encode({ sub: "123", exp })));
  }
});
