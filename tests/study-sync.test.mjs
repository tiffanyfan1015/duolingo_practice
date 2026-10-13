import test from "node:test";
import assert from "node:assert/strict";
import {createProgressStore,createStudyStore} from "../web/src/services/progress-store.mjs";
import {createReviewStore} from "../web/src/services/review-store.mjs";
import {createStudySync} from "../web/src/study-sync-controller.mjs";
import {packStudy,unpackStudy,mergeStudy,validateStudyCells} from "../web/src/domain/study-sync.mjs";
import {previewRatings} from "../web/src/services/fsrs-scheduler.mjs";
import {studyRepository} from "../server/study/repository.ts";
import {testDatabase} from "./helpers/database.mjs";
import worker from "../server/worker.ts";
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const k=(...parts)=>JSON.stringify(parts);
function device(client,storage=memory()) {
  const progress=createProgressStore(storage),review=createReviewStore(storage),store=createStudyStore(storage,progress,review),statuses=[];
  const engine=createStudySync({store,client,onStatus:s=>statuses.push(s)});
  return {progress,review,store,engine,statuses,storage};
}
function cloud() {
  let cells={},revision=0,online=true,failAfterCommit=false;
  return {
    set online(value){online=value;},set failAfterCommit(value){failAfterCommit=value;},
    async get(known){if(!online)throw Error("offline");return known===revision ? {revision,unchanged:true} : {revision,cells:structuredClone(cells)};},
    async put(expected,value){if(!online)throw Error("offline");if(expected!==revision){const e=Error("stale");e.code="revision-conflict";throw e;}validateStudyCells(value);cells=structuredClone(value);revision++;if(failAfterCommit){failAfterCommit=false;throw Error("response lost");}return {revision};},
  };
}
test("two devices merge notes, stars, settings, models and review history; retries are idempotent",async()=>{
  const remote=cloud(),a=device(remote),b=device(remote);
  a.progress.setNote("de:1","我的筆記");a.progress.toggleStar("de:1");
  a.review.setSettings("de",{newLimit:25,templates:["recognition","listening"]});
  await a.engine.sync();await b.engine.sync();
  assert.equal(b.progress.get("de:1").note,"我的筆記");assert.equal(b.progress.get("de:1").star,true);
  assert.equal(b.review.settings("de").newLimit,25);
  remote.online=false;
  a.progress.setNote("de:1","離線修改");b.progress.toggleStar("de:1");
  await a.engine.sync();assert.equal(a.statuses.at(-1).state,"error");
  const reopened=device(remote,a.storage);remote.online=true;
  await b.engine.sync();await reopened.engine.sync();await b.engine.sync();
  assert.equal(b.progress.get("de:1").note,"離線修改");assert.equal(b.progress.get("de:1").star,false);
  const card={id:"de:1::recognition",noteId:"de:1",language:"de"};
  const scheduled=previewRatings({},0.9,100000)[3];
  b.review.rate(card,scheduled,3,[card],{},100000);
  remote.failAfterCommit=true;await b.engine.sync();await b.engine.sync();await reopened.engine.sync();
  assert.equal(reopened.review.logs.length,1);assert.deepEqual(reopened.review.records[card.id].memory,scheduled.memory);
  b.review.undo();await b.engine.sync();await reopened.engine.sync();
  assert.equal(reopened.review.logs.length,0);assert.equal(reopened.review.records[card.id],undefined);
});
test("same-field conflicts require a choice and never overwrite cloud silently",async()=>{
  const remote=cloud(),a=device(remote),b=device(remote);
  a.progress.setNote("de:1","base");await a.engine.sync();await b.engine.sync();
  a.progress.setNote("de:1","computer");b.progress.setNote("de:1","phone");
  await a.engine.sync();await b.engine.sync();
  assert.equal(b.statuses.at(-1).state,"conflict");assert.equal(b.progress.get("de:1").note,"phone");
  await b.engine.sync("remote");assert.equal(b.progress.get("de:1").note,"computer");
  a.progress.setNote("de:1","third");b.progress.setNote("de:1","fourth");await a.engine.sync();await b.engine.sync();await b.engine.sync("local");await a.engine.sync();
  assert.equal(a.progress.get("de:1").note,"fourth");
});
test("edits during upload stay pending and changed remote conflicts need a new choice",async()=>{
  const remote=cloud(),a=device(remote),b=device(remote);
  const put=remote.put;let once=true;
  remote.put=async(...args)=>{const result=await put(...args);if(once){once=false;a.progress.setNote("de:2","during upload");}return result;};
  a.progress.setNote("de:1","first");await a.engine.sync();await b.engine.sync();assert.equal(b.progress.get("de:2").note,"during upload");
  a.progress.setNote("de:1","a");b.progress.setNote("de:1","b");await a.engine.sync();await b.engine.sync();
  a.progress.setNote("de:1","a newer");await a.engine.sync();await b.engine.sync("local");assert.equal(b.statuses.at(-1).state,"conflict");
});
test("same-browser tabs merge journal deltas and preserve legacy backup compatibility",async()=>{
  const remote=cloud(),storage=memory(),a=device(remote,storage),b=device(remote,storage);
  a.progress.setNote("de:1","a");b.progress.toggleStar("de:2");
  await a.engine.sync();b.store.refresh();assert.equal(b.progress.get("de:1").note,"a");assert.equal(a.progress.get("de:2").star,true);
  assert.equal(JSON.parse(a.progress.serialize()).schemaVersion,1);
  assert.equal(a.review.snapshot().version,1);
});
test("models and reset to defaults sync; prototype and malformed data are rejected",async()=>{
  const weights=[0.4,0.6,2.4,5.8,4.9,0.9,0.8,0.1,1.4,0.1,1,2,0.1,0.3,1,0.1,2,0.5,0.5,0.1,0.2];
  const remote=cloud(),a=device(remote),b=device(remote);a.review.setSettings("de",{weights,modelTrainedAt:"2026-01-01",newLimit:20});
  const original=a.store.read().local;validateStudyCells(original);
  assert.deepEqual(unpackStudy(original).review.settings.de.weights,weights);
  await a.engine.sync();await b.engine.sync();assert.deepEqual(b.review.settings("de").weights,weights);
  a.review.setSettings("de",{});const cleared=a.store.read().local;
  const merged=mergeStudy(original,cleared,original).cells;assert(!unpackStudy(merged).review.settings.de?.weights);
  await a.engine.sync();await b.engine.sync();assert.equal(b.review.settings("de").weights,undefined);
  assert.throws(()=>validateStudyCells({[k("word","__proto__","note")]:"bad"}));
  assert.throws(()=>validateStudyCells({[k("word","de:1","star")]:"yes"}));
  assert.throws(()=>validateStudyCells({[k("card","de:1::recognition")]:{memory:null}}));
  assert.throws(()=>validateStudyCells({[k("setting","","newLimit")]:20}));
});
test("a lost tab journal write can recover independent pending edits",()=>{
  const remote=cloud(),storage=memory(),a=device(remote,storage);
  a.progress.setNote("de:a","pending a");
  storage.setItem("cijian-study-sync-v1",JSON.stringify({version:1,revision:0,base:{},local:{[k("word","de:b","note")]:"pending b"}}));
  a.store.refresh();assert.equal(a.progress.get("de:a").note,"pending a");assert.equal(a.progress.get("de:b").note,"pending b");
});
test("expired login blocks uploads and preserves pending records for the original account",async()=>{
  let calls=0;const a=device({get:async()=>{calls++;const e=Error("expired");e.status=401;throw e;}});
  a.progress.setNote("de:1","unsent");await a.engine.sync();assert.equal(a.statuses.at(-1).state,"auth");
  await a.engine.sync();assert.equal(calls,1);assert.equal(a.store.read().local[k("word","de:1","note")],"unsent");
});
test("D1 compare-and-swap is atomic, chunks round-trip and accounts remain isolated",async t=>{
  const db=testDatabase();t.after(()=>db.close());
  const a=studyRepository(db,"alice"),b=studyRepository(db,"bob");await a.init();
  const cells=Object.fromEntries(Array.from({length:90},(_,i)=>[k("word",`de:${i}`,"note"),"字".repeat(8000)]));
  assert(await a.write(0,cells));assert.equal(await a.write(0,{[k("romaji")]:true}),false);
  assert.deepEqual((await a.read()).cells,cells);assert.deepEqual((await b.read()).cells,{});
  assert.deepEqual(await a.read(1),{revision:1,unchanged:true});
  assert(await a.write(1,{}));assert.deepEqual((await a.read()).cells,{});
});
test("study endpoint requires account identity, protects writes, validates data and isolates users",async t=>{
  const DB=testDatabase();t.after(()=>DB.close());const env={MULTI_USER:"true",DB,CREDENTIAL_KEY:"ab".repeat(32),REGISTRATION_CODE:"study-test-invitation-code"};
  const register=async username=>{const r=await worker.fetch(new Request("https://app.test/api/account/register",{method:"POST",headers:{Origin:"https://app.test","Content-Type":"application/json","X-Cijian-Account":"1"},body:JSON.stringify({username,password:"study-test-password",invite:env.REGISTRATION_CODE})}),env);assert.equal(r.status,200);return {Cookie:r.headers.get("set-cookie").split(";")[0],"X-Cijian-User":(await r.json()).user.id};};
  const a=await register("alice"),b=await register("bob");
  const call=(headers={},body,extra={})=>worker.fetch(new Request("https://app.test/api/study",{method:body ? "PUT" : "GET",headers:{...headers,...(body ? {Origin:"https://app.test","Content-Type":"application/json","X-Study-Sync":"1"} : {}),...extra},...(body ? {body:JSON.stringify(body)} : {})}),env);
  assert.equal((await call()).status,401);
  assert.equal((await call({...a,"X-Cijian-User":b["X-Cijian-User"]})).status,409);
  const body={revision:0,cells:{[k("word","de:1","note")]:"private"}};
  assert.equal((await call(a,body,{Origin:"https://evil.test"})).status,403);
  assert.equal((await call(a,{revision:0,cells:{evil:true}})).status,400);
  assert.equal((await call(a,body)).status,200);assert.equal((await call(a,body)).status,409);
  assert.deepEqual((await (await call(b)).json()).cells,{});
  assert.equal((await (await call(a)).json()).cells[k("word","de:1","note")],"private");
});
