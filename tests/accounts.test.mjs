import test from "node:test";
import assert from "node:assert/strict";
import worker from "../server/worker.mjs";
import { testDatabase } from "./helpers/database.mjs";
import { digestSecret, openCredential } from "../server/accounts/crypto.mjs";
import { userRepository } from "../server/sync/user-repository.mjs";
import { accountStorage, createProgressStore, STORAGE_KEY } from "../web/src/services/progress-store.mjs";
import { createReviewStore, REVIEW_KEY } from "../web/src/services/review-store.mjs";

const site = "https://app.test";
const password = "test-only-password-12345";
function environment(t) {
  const DB = testDatabase(); t.after(() => DB.close());
  return { MULTI_USER: "true", DB, CREDENTIAL_KEY: "ab".repeat(32), REGISTRATION_CODE: "test-invitation-code-long", DUOLINGO_JWT: "legacy-never-used", ASSETS: { fetch: async () => new Response("private static vocabulary") } };
}
async function call(env, path, body, auth = {}, headers = {}) {
  return worker.fetch(new Request(site + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(auth.cookie ? { Cookie: auth.cookie } : {}), ...(auth.user ? { "X-Cijian-User": auth.user.id } : {}), ...(body === undefined ? {} : { Origin: site, "Content-Type": "application/json", "X-Cijian-Account": "1", "X-Cijian-Sync": "1" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}
async function register(env, username) {
  const response = await call(env, "/api/account/register", { username, password, invite: env.REGISTRATION_CODE });
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
  return { cookie: response.headers.get("set-cookie").split(";")[0], user: (await response.json()).user };
}
const tokenFor = (sub) => "a." + btoa(JSON.stringify({ sub, exp: Date.now()/1000+3600 })) + ".synthetic";
const profileFor = (sub) => ({ courses: [{ id: "de-course", learningLanguage: "de", fromLanguage: "zh" }], currentCourse: { id: "de-course", learningLanguage: "de", fromLanguage: "zh", skills: [{ id: "s" + sub, finishedLevels: 1 }], pathSectioned: [] } });

test("accounts fail closed, require invitation, isolate static private data and protect writes", async (t) => {
  const env = environment(t);
  assert.equal((await call({ ...env, CREDENTIAL_KEY: "" }, "/")).status, 503);
  assert.equal((await call(env, "/")).status, 302);
  assert.equal((await call(env, "/account")).status, 200);
  assert.equal((await call(env, "/data.json")).status, 401);
  assert.equal((await call(env, "/api/catalog")).status, 401);
  assert.equal((await call(env, "/api/account/register", { username: "alice", password, invite: "wrong" })).status, 403);
  assert.equal((await call(env, "/api/account/register", { username: "alice", password, invite: env.REGISTRATION_CODE }, {}, { Origin: "https://evil.test" })).status, 403);
  const alice = await register(env, "Alice");
  assert.equal(alice.user.username, "alice");
  assert.equal((await call(env, "/data.json", undefined, alice)).status, 404);
  assert.equal((await call(env, "/%64ata.json", undefined, alice)).status, 404);
  const catalog = await (await call(env, "/api/catalog", undefined, alice)).json();
  assert.equal(catalog.user.id, alice.user.id);
  assert.deepEqual(catalog.courses, []);
  assert.equal((await call(env, "/api/account/register", { username: "ALICE", password, invite: env.REGISTRATION_CODE })).status, 409);
  const row = await env.DB.prepare("SELECT * FROM app_users").first();
  assert.notEqual(row.password_hash, password);
  assert.ok(!JSON.stringify(catalog).includes(row.password_hash));
});

test("login, expired sessions, logout revocation, and account-switch guards", async (t) => {
  const env = environment(t), alice = await register(env, "alice"), bob = await register(env, "bob");
  assert.equal((await call(env, "/api/account/login", { username: "alice", password: "wrong-long-password" })).status, 401);
  const login = await call(env, "/api/account/login", { username: "alice", password });
  assert.equal(login.status, 200);
  const auth = { user: alice.user, cookie: login.headers.get("set-cookie").split(";")[0] };
  assert.equal((await call(env, "/api/sync/start?language=de", {}, { ...bob, user: alice.user })).status, 409);
  assert.equal((await call(env, "/api/catalog", undefined, { ...bob, user: alice.user })).status, 409);
  assert.equal((await call(env, "/api/account/logout", {}, { ...bob, user: alice.user })).status, 409);
  assert.equal((await call(env, "/api/account/logout", {}, auth)).status, 200);
  assert.equal((await call(env, "/api/catalog", undefined, auth)).status, 401);
  await env.DB.prepare("UPDATE app_sessions SET expires=0 WHERE token_hash=?").bind(await digestSecret(alice.cookie.split("=")[1])).run();
  assert.equal((await call(env, "/api/catalog", undefined, alice)).status, 401);
});

test("two users connect and sync their own Duolingo, encrypted at rest, no legacy fallback", async (t) => {
  const env = environment(t), alice = await register(env, "alice"), bob = await register(env, "bob");
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const token = options.headers.Authorization.slice(7);
    const identity = JSON.parse(atob(token.split(".")[1])).sub;
    calls.push(identity);
    assert.ok(url.startsWith(`https://www.duolingo.com/`));
    assert.ok(url.includes(`/users/${identity}`));
    return Response.json(url.includes("learned-lexemes") ? { learnedLexemes: [{ text: "word-" + identity, translations: ["字"] }], pagination: { nextStartIndex: null, totalLexemes: 1 } } : profileFor(identity));
  });
  const token = tokenFor("101");
  assert.equal((await call(env, "/api/account/connect", { token }, alice)).status, 200);
  assert.equal((await call(env, "/api/account/connect", { token: tokenFor("202") }, bob)).status, 200);
  const row = await env.DB.prepare("SELECT * FROM app_users WHERE id=?").bind(alice.user.id).first();
  assert.ok(!row.credential.includes(token));
  assert.equal(await openCredential(row.credential, env.CREDENTIAL_KEY, row.id), token);
  await assert.rejects(openCredential(row.credential, env.CREDENTIAL_KEY, bob.user.id));
  for (const [auth, identity] of [[alice,"101"],[bob,"202"]]) {
    let response = await call(env, "/api/sync/start?language=de", {}, auth);
    assert.equal(response.status, 200, await response.clone().text());
    let { job } = await response.json();
    for (let i = 0; job.phase !== "done" && i < 12; i++) {
      response = await call(env, "/api/sync/step?language=de", { id: job.id }, auth);
      assert.equal(response.status, 200, await response.clone().text());
      job = (await response.json()).job;
    }
    assert.equal(job.phase, "done");
    const catalog = await (await call(env, "/api/catalog", undefined, auth)).json();
    assert.equal(catalog.courses[0].words[0].text, "word-" + identity);
    assert.ok(!JSON.stringify(catalog).includes("synthetic"));
  }
  assert.ok(calls.includes("101") && calls.includes("202"));
  assert.equal((await call(env, "/api/account/connect", { token: tokenFor("202") }, alice)).status, 409);
  const oldRepo = userRepository(env.DB, row);
  const old = await oldRepo.get("de");
  assert.equal((await call(env, "/api/account/disconnect", {}, alice)).status, 200);
  // Even an in-flight write using a captured old connection stays invisible.
  await oldRepo.save(old, { id: "de", words: [{ text: "late-write" }] });
  const catalog = await (await call(env, "/api/catalog", undefined, alice)).json();
  assert.deepEqual(catalog.courses, []);
  assert.equal((await call(env, "/api/sync/start?language=de", {}, alice)).status, 409);
  assert.equal((await call(env, "/api/account/connect", { token }, alice)).status, 200);
  assert.deepEqual((await (await call(env, "/api/catalog", undefined, alice)).json()).courses[0].words, []);
});

test("user repository rejects stale publish and foreign job ids", async (t) => {
  const env = environment(t), a = userRepository(env.DB, { id: "a", connection_id: "one" }), b = userRepository(env.DB, { id: "b", connection_id: "two" });
  await a.init();
  const job = await a.start({ id: "job-a", language: "de" }, null);
  assert.equal(await b.get("de"), null);
  await assert.rejects(b.save(job, { id: "de", words: ["foreign"] }), /另一個/);
  await a.save(job);
  await assert.rejects(a.save(job, { id: "de", words: ["stale"] }), /另一個/);
  assert.deepEqual(await a.courses(), []);
  assert.deepEqual(await b.courses(), []);
});

test("login throttling and malformed request limits", async (t) => {
  const env = environment(t);
  for (let i=0; i<15; i++) assert.equal((await call(env, "/api/account/login", { username: "nobody", password })).status, 401);
  assert.equal((await call(env, "/api/account/login", { username: "nobody", password })).status, 429);
  assert.equal((await call(env, "/api/account/register", { padding: "x".repeat(16001) })).status, 413);
  assert.equal((await call(env, "/api/account/register", [])).status, 400);
});

test("per-account browser storage preserves legacy backups and separates reviews", () => {
  const records = new Map();
  const storage = { getItem: (k) => records.get(k) || null, setItem: (k,v) => records.set(k,v) };
  const legacy = createProgressStore(storage); legacy.setNote("de:Haus", "legacy");
  const a = createProgressStore(accountStorage(storage,"a")), b = createProgressStore(accountStorage(storage,"b"));
  assert.deepEqual(a.get("de:Haus"), {});
  a.import(legacy.serialize(), new Set(["de:Haus"])); a.setNote("de:Haus", "alice"); b.setNote("de:Haus", "bob");
  assert.equal(createProgressStore(accountStorage(storage,"a")).get("de:Haus").note,"alice");
  assert.equal(createProgressStore(storage).get("de:Haus").note,"legacy");
  createReviewStore(accountStorage(storage,"a")).setSettings("de", { newLimit: 7 });
  assert.equal(createReviewStore(accountStorage(storage,"a")).settings("de").newLimit,7);
  assert.notEqual(createReviewStore(accountStorage(storage,"b")).settings("de").newLimit,7);
  assert.ok(records.has(STORAGE_KEY));
  assert.ok(records.has(`cijian-user:a:${REVIEW_KEY}`));
});
