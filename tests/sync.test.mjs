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
import { reusableProbes } from "../server/sync/incremental.ts";
import { syncView } from "../web/src/ui/views/sync.mjs";

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

async function complete(service, job) {
  for (let i = 0; job.phase !== "done" && i < 30; i++) job = await service.step("de", job.id);
  assert.equal(job.phase, "done");
  return job;
}
async function readyForNext(repo) {
  const old = await repo.get("de");
  old.startedAt -= 16000;
  await repo.save(old);
}

test("incremental sync persists reused probes, skips unchanged skills and refreshes meanings", async () => {
  const {repo, service} = await setup();
  await complete(service, await service.start("de"));
  await readyForNext(repo);
  const calls = [];
  const api = {...client(), page: async (course, skills, start) => {
    calls.push(skills.map(s=>s.skillId.id));
    const result = await client().page(course,skills,start);
    result.learnedLexemes = result.learnedLexemes.map(w=>({...w,translations:["新版釋義"]}));
    return result;
  }};
  let job = await syncService(repo,api).start("de");
  assert.equal(job.reused,2);
  job = await syncService(repo,api).step("de",job.id);
  assert.equal((await syncService(repo,api).start("de")).id,job.id);
  await complete(syncService(repo,api),job);
  assert.deepEqual(calls,[["a","b"],["a","b"]]);
  assert.deepEqual((await repo.courses())[0].words[0].meanings,["新版釋義"]);
  assert.deepEqual((await repo.courses())[0].words[0].units,["s1u1"]);
});

test("changed skills are queried by ID even when reused probes are not a prefix", async () => {
  const {repo, service} = await setup();
  await complete(service,await service.start("de"));
  await readyForNext(repo);
  const changed=structuredClone(profile), calls=[];
  changed.currentCourse.skills[0].finishedLevels++;
  const api={...client(),profile:async()=>changed,page:async(c,s,n)=>{
    calls.push(s.map(x=>x.skillId.id)); return client().page(c,s,n);
  }};
  const next=syncService(repo,api), job=await next.start("de");
  assert.equal(job.reused,1);
  await complete(next,job);
  assert.deepEqual(calls,[["a","b"],["a","b"],["a"]]);
});

test("new skills are queried while unchanged skill mappings are retained", async () => {
  const {repo,service}=await setup();
  await complete(service,await service.start("de"));
  await readyForNext(repo);
  const changed=structuredClone(profile), calls=[];
  changed.currentCourse.skills.push({id:"c",finishedLevels:1});
  const extra={text:"Neu",translations:["新"]};
  const api={profile:async()=>changed,page:async(c,s,n)=>{
    calls.push(s.map(x=>x.skillId.id));
    return s.length===3?page([...words,extra]):page([extra]);
  }};
  const next=syncService(repo,api), job=await next.start("de");
  assert.equal(job.reused,2);
  await complete(next,job);
  assert.deepEqual(calls,[["a","b","c"],["c"]]);
  assert.equal((await repo.courses())[0].words.length,3);
});

test("forced sync, changed structure and incomplete snapshots fall back to full probes", async () => {
  const {repo,service}=await setup();
  await complete(service,await service.start("de"));
  const old=await repo.get("de"), snapshot=courseState(profile,"de");
  for (const modify of [
    p=>{p.probes.pop();}, p=>{p.phase="units";},
    p=>{p.course.id="other";}, p=>{p.units[0].title="changed";},
    p=>{p.probes[0].words=["missing"];},
    p=>{p.skills.push({skillId:{id:"removed"},finishedLevels:1,finishedSessions:0});p.probes.push({id:"removed",words:[]});},
  ]) {
    const previous=structuredClone(old);modify(previous);
    assert.deepEqual(reusableProbes(snapshot,previous),[]);
  }
  const ignoredFilter=structuredClone(old);
  ignoredFilter.probes.forEach(p=>{p.words=words.map(w=>w.text);});
  assert.deepEqual(reusableProbes(snapshot,ignoredFilter),[]);
  await readyForNext(repo);
  const job=await service.start("de",true);
  assert.equal(job.reused,0);
  await complete(service,job);
  assert.match(syncView({courseName:"德文",job:{...job,phase:"done",reused:1}}),/完整重新同步/);
  assert.match(syncView({courseName:"德文",job:{...job,reused:1}}),/沿用 1 個/);
});

test("removed words and unexplained new words invalidate reused probes without endless retries", async () => {
  for (const remove of [true,false]) {
    const {repo,service}=await setup();
    await complete(service,await service.start("de"));
    await readyForNext(repo);
    const extra={text:"Neu",translations:["新"]}, calls=[];
    const api={...client(),page:async(c,s,n)=>{
      calls.push(s.map(x=>x.skillId.id));
      if(s.length===2)return page(remove?[words[0]]:[...words,extra]);
      return page(s[0].skillId.id==="a"?[words[0]]:remove?[]:[words[1],extra]);
    }};
    const next=syncService(repo,api);
    await complete(next,await next.start("de"));
    assert.deepEqual(calls,remove?[["a","b"],["b"]]:[["a","b"],["a"],["b"]]);
    assert.equal((await repo.courses())[0].words.length,remove?1:3);
  }
});

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
  assert.deepEqual(de.words.find(w => w.text === "Buch").meanings, ["書"]);
  assert.equal(de.sync.rawMeanings, false);
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
    assert.equal(options.redirect, "manual");
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

test("Duolingo redirects are rejected without forwarding credentials", async () => {
  const token = "a." + btoa(JSON.stringify({ sub: "123" })) + ".z";
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const api = createDuolingoClient(token, async (_url, options) => {
      calls++;
      assert.equal(options.redirect, "manual");
      return new Response(null, { status, headers: { Location: "https://other.test/" } });
    });
    await assert.rejects(api.profile(), /重新導向/);
    assert.equal(calls, 1);
  }
});

test("Duolingo distinguishes timeout from transport failure without exposing error details", async () => {
  const token = "a." + btoa(JSON.stringify({ sub: "123" })) + ".z";
  for (const name of ["TimeoutError", "AbortError", "TypeError"]) {
    const api = createDuolingoClient(token, async () => {
      const error = new Error("sensitive details " + token);
      error.name = name;
      throw error;
    });
    await assert.rejects(api.courses(), (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, name === "TypeError" ? /無法連線/ : /逾時/);
      assert.ok(!error.message.includes(token));
      return true;
    });
  }
});
