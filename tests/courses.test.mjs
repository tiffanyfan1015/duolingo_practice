import test from "node:test";
import assert from "node:assert/strict";
import worker from "../server/worker.ts";
import { testDatabase } from "./helpers/database.mjs";
import { discoverCourses } from "../server/courses/domain.ts";
import { createProgressStore } from "../web/src/services/progress-store.mjs";
import { createReviewStore } from "../web/src/services/review-store.mjs";
import { exportCollection, importCollection } from "../web/src/services/collection-backup.mjs";
import { courseSwitchView } from "../web/src/ui/views/courses.mjs";
import { speechLanguage } from "../web/src/domain/languages.mjs";
const french = { id: "fr-en", learningLanguage: "fr", fromLanguage: "en" };
const japanese = { id: "ja-en", learningLanguage: "ja", fromLanguage: "en" };
const frenchZh = { id: "fr-zh", learningLanguage: "fr", fromLanguage: "zh" };
const profile = (c) => ({ currentCourse: { ...c, skills: [{ id: "s", finishedLevels: 1 }], pathSectioned: [] } });
const courseToken = "a." + btoa(JSON.stringify({ sub: "345", exp: 4102444800 })) + ".test";
async function courseSetup(t) {
  const DB = testDatabase(); t.after(() => DB.close());
  const env = { MULTI_USER: "true", DB, CREDENTIAL_KEY: "aa".repeat(32), REGISTRATION_CODE: "course-test-invitation", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
  const state = { current: french, courses: [french,japanese,frenchZh], fail: false, pages: [] };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.method, url.includes("learned-lexemes") ? "POST" : "GET");
    if (state.fail) return new Response("", { status: 503 });
    if (url.includes("learned-lexemes")) {
      state.pages.push(url);
      return Response.json({ learnedLexemes: [{ text: "bonjour", translations: [state.current.fromLanguage === "en" ? "hello" : "你好"] }], pagination: { nextStartIndex: null, totalLexemes: 1 } });
    }
    return Response.json(url.includes("fields=courses") ? { courses: state.courses } : profile(state.current));
  });
  const request = async (action, body, auth = {}) => worker.fetch(new Request("https://courses.test" + action, {
    method: body === undefined ? "GET" : "POST", headers: { Origin: "https://courses.test", "Content-Type": "application/json", "X-Cijian-Account": "1", "X-Cijian-Sync": "1", ...auth }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
  const registration = await request("/api/account/register", { username: "student", password: "course-test-password", invite: env.REGISTRATION_CODE });
  assert.equal(registration.status, 200);
  const { user } = await registration.json();
  const auth = { Cookie: registration.headers.get("set-cookie").split(";")[0], "X-Cijian-User": user.id };
  const call = (path, body) => request(path,body,auth);
  const connected = await call("/api/account/connect", { token: courseToken });
  assert.equal(connected.status,200,await connected.clone().text());
  const me = async () => (await (await call("/api/account/me")).json()).user;
  const select = async (ids) => {
    const current = await me();
    const response = await call("/api/account/save-courses", { courses: ids, revision: current.courseRevision });
    assert.equal(response.status,200,await response.clone().text());
    return (await response.json()).user;
  };
  return { state, call, me, select, env, user };
}
async function finishCourse(call, key) {
  const path = (action) => `/api/sync/${action}?language=${encodeURIComponent(key)}`;
  let response = await call(path("start"), {});
  assert.equal(response.status,200,await response.clone().text());
  let { job } = await response.json();
  for (let i=0; job.phase !== "done" && i<15; i++) {
    response = await call(path("step"), { id: job.id });
    assert.equal(response.status,200,await response.clone().text());
    job = (await response.json()).job;
  }
  assert.equal(job.phase,"done");
}

test("discovery ignores non-language courses, retains legacy IDs, and renders language-only labels", () => {
  const de = { id: "german", learningLanguage: "de", fromLanguage: "zh" };
  const courses = discoverCourses({ courses: [de,french,frenchZh,{ id: "math", subject: "math" }] }, profile(french));
  assert.equal(courses.length,3);
  assert.equal(courses[0].id,"de");
  assert.equal(courses[1].active,true);
  assert.equal(courses[2].active,false);
  assert.notEqual(courses[1].id,courses[2].id);
  const html = courseSwitchView(courses);
  assert.match(html,/法文 1/); assert.match(html,/法文 2/);
  assert.ok(!html.includes("英文學") && !html.includes("中文學"));
  assert.throws(() => discoverCourses({},profile(french)),/課程清單/);
});

test("activation survives refresh, no unwanted new courses, stale and unknown selections rejected", async (t) => {
  const { state, call, me, select } = await courseSetup(t);
  const original = await me();
  assert.deepEqual(original.courses.filter((c)=>c.active).map((c)=>c.id),["course:fr-en"]);
  await select(["course:ja-en"]);
  assert.equal((await call("/api/account/save-courses", { courses: [], revision: original.courseRevision })).status,409);
  const latest = await me();
  assert.equal((await call("/api/account/save-courses", { courses: ["someone-elses-course"], revision: latest.courseRevision })).status,409);
  state.courses.push({ id:"es-en", learningLanguage:"es", fromLanguage:"en" });
  assert.equal((await call("/api/account/refresh-courses",{})).status,200);
  const refreshed = await me();
  assert.deepEqual(refreshed.courses.filter((c)=>c.active).map((c)=>c.id),["course:ja-en"]);
  state.fail = true;
  assert.equal((await call("/api/account/refresh-courses",{})).status,502);
  assert.deepEqual((await me()).courses,refreshed.courses);
  state.fail = false;
  await select([]);
  assert.deepEqual((await (await call("/api/catalog")).json()).courses,[]);
  assert.equal((await call("/api/sync/start?language=course%3Afr-en",{})).status,409);
});

test("exact course and source are checked; inactive courses preserve vocabulary when re-enabled", async (t) => {
  const { state, call, select } = await courseSetup(t);
  await select(["course:fr-en","course:fr-zh"]);
  assert.equal((await call("/api/sync/start?language=course%3Afr-zh",{})).status,400);
  assert.equal(state.pages.length,0);
  await finishCourse(call,"course:fr-en");
  state.current = frenchZh;
  await finishCourse(call,"course:fr-zh");
  const catalog = (await (await call("/api/catalog")).json()).courses;
  assert.equal(catalog[0].name,"法文");
  assert.equal(catalog[0].words[0].meanings[0],"hello");
  assert.equal(catalog[1].words[0].meanings[0],"你好");
  assert.notEqual(catalog[0].words[0].id,catalog[1].words[0].id);
  assert.ok(state.pages.some((url)=>url.includes("/courses/fr/en/")));
  assert.ok(state.pages.some((url)=>url.includes("/courses/fr/zh/")));
  await select([]);
  await select(["course:fr-en"]);
  assert.deepEqual((await (await call("/api/catalog")).json()).courses[0].words,catalog[0].words);
});

test("legacy saved course and notes keep their stable IDs during course discovery", async (t) => {
  const { state, call, env, user } = await courseSetup(t);
  const owner = await env.DB.prepare("SELECT * FROM app_users WHERE id=?").bind(user.id).first();
  await env.DB.prepare("DELETE FROM user_course_settings WHERE user_id=?").bind(user.id).run();
  await env.DB.prepare("INSERT INTO user_catalogs VALUES(?,?,?,?)").bind(user.id,owner.connection_id,"ja",JSON.stringify({ id:"ja",name:"日文", words:[{ id:"ja:猫",text:"猫",meanings:["貓"],units:[] }], units:[],sync:{ courseId:"ja-zh" } })).run();
  state.current = { id:"ja-zh", learningLanguage:"ja",fromLanguage:"zh" };
  state.courses = [state.current];
  const response = await call("/api/catalog");
  assert.equal(response.status,200);
  const { courses } = await response.json();
  assert.equal(courses[0].id,"ja");
  assert.equal(courses[0].words[0].id,"ja:猫");
});

test("FSRS settings, logs and backup round-trip support independent arbitrary course keys", () => {
  const memory = () => { const map=new Map(); return { getItem:(k)=>map.get(k)||null, setItem:(k,v)=>map.set(k,v) }; };
  const disk=memory(), progress=createProgressStore(disk), review=createReviewStore(disk);
  const id="course:fr-en", word={ id:id+":bonjour",text:"bonjour",meanings:["hello"],units:[] };
  progress.setNote(word.id,"remember");
  review.merge({ cards:{ [word.id+"::recognition"]:{ reviews:1,due:100,updatedAt:200 } }, logs:[{ id:"review-1",cardId:word.id+"::recognition",language:id,day:"2026-10-10",at:200,rating:3,wasNew:true,wasReview:false }],settings:{ [id]:{ newLimit:3 },"course:fr-zh":{ newLimit:8 } } });
  const restored = createReviewStore(disk);
  assert.equal(restored.logs[0].language,id);
  assert.equal(restored.settings(id).newLimit,3);
  const otherDisk=memory(), other=createReviewStore(otherDisk), otherProgress=createProgressStore(otherDisk);
  importCollection(exportCollection(progress,restored),{ courses:[{id,words:[word]}] },otherProgress,other);
  assert.equal(other.logs.length,1);
  assert.equal(other.settings(id).newLimit,3);
  assert.equal(otherProgress.get(word.id).note,"remember");
  assert.equal(speechLanguage("fr"),"fr");
});
