import test from "node:test";
import assert from "node:assert/strict";
import { matchedJapaneseReading } from "../web/src/domain/dictionary.mjs";
import { createDictionaryClient } from "../web/src/services/dictionary-client.mjs";
import { createReadingController } from "../web/src/reading-controller.mjs";
import { createReadingStore, accountStorage } from "../web/src/services/progress-store.mjs";
import { kanaPronunciation } from "../web/src/services/language-tools.mjs";

const jisho = {data:[{japanese:[{word:"食べる",reading:"たべる"}],senses:[{parts_of_speech:["Ichidan verb"]}]}]};
const word = text => ({id:`ja:${text}`,text,meanings:["吃"],units:[],readingPending:true});
const tick = () => new Promise(resolve=>setTimeout(resolve,0));

test("dictionary readings match exact spelling and conjugation, rejecting unrelated and ambiguous readings",()=>{
  assert.equal(matchedJapaneseReading(jisho,"食べます"),"たべます");
  assert.equal(matchedJapaneseReading(jisho,"食べる"),"たべる");
  assert.equal(matchedJapaneseReading(jisho,"食べ物"),null);
  assert.equal(matchedJapaneseReading({data:[{japanese:[{word:"生",reading:"せい"},{word:"生",reading:"なま"}]}]},"生"),null);
  assert.equal(kanaPronunciation("図書館"),null);
  assert.deepEqual(kanaPronunciation("ビール"),{reading:"ビール",romaji:"biiru",readingPending:false});
});

test("inflected Japanese gets its own reading while dictionary senses retain the lemma",async()=>{
  const client=createDictionaryClient({
    parse:payload=>payload.candidates || [],
    fetcher:async url=>Response.json(new URL(url,"https://test").searchParams.get("provider")==="jisho" ? jisho : {candidates:new URL(url,"https://test").searchParams.get("term")==="食べる" ? [{lemma:"食べる",readings:[{text:"たべる"}],senses:[]}] : []}),
  });
  const result=await client.lookup("食べます","ja");
  assert.equal(result.candidates[0].lemma,"食べる");
  assert.equal(result.pronunciation.reading,"たべます");
  assert.equal(result.pronunciation.romaji,"tabemasu");
});

test("optional reading provider failure does not hide available dictionary senses",async()=>{
  const client=createDictionaryClient({parse:p=>p.candidates,fetcher:async url=>url.includes("jisho") ? new Response("",{status:502}) : Response.json({candidates:[{lemma:"生",senses:[{glosses:["生命"]}]}]})});
  const result=await client.lookup("生","ja");
  assert.equal(result.status,"ready");
  assert.equal(result.pronunciation,null);
});

test("reading cache survives reload and is separate from study data and other accounts",()=>{
  const values=new Map(), storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const a=accountStorage(storage,"a"), b=accountStorage(storage,"b");
  createReadingStore(a).put("食べます",kanaPronunciation("たべます"));
  assert.equal(createReadingStore(a).get("食べます").reading,"たべます");
  assert.equal(createReadingStore(b).get("食べます"),null);
  assert.ok([...values.keys()].every(k=>k.endsWith("dictionary-readings-v1")));
  const malformed=createReadingStore({getItem:()=>"broken"});
  assert.equal(malformed.get("食べます"),null);
});

test("automatic reading lookup bounds concurrency and restores readings without new requests",async()=>{
  const pending=[], shown=[], saved=new Map();
  const client={lookup:text=>new Promise(resolve=>pending.push({text,resolve}))};
  const store={get:text=>saved.get(text),put:(text,value)=>saved.set(text,value)};
  const controller=createReadingController({client,store,present:w=>shown.push(w.id)});
  const words=[word("一"),word("二"),word("三")];
  controller.ensure(words,"ja");
  assert.equal(pending.length,2);
  pending[0].resolve({pronunciation:kanaPronunciation("いち")});
  await tick();
  assert.equal(pending.length,3);
  pending[1].resolve({pronunciation:null}); pending[2].resolve({pronunciation:kanaPronunciation("さん")});
  await tick();
  assert.equal(words[0].reading,"いち");
  assert.equal(words[1].readingPending,true);
  const restored=word("一");
  controller.restore([{id:"ja",words:[restored]}]);
  assert.equal(restored.romaji,"ichi");
  assert.equal(restored.readingPending,false);
  controller.ensure([restored],"ja");
  assert.equal(pending.length,3);
  assert.deepEqual(words[0].meanings,["吃"]);
});
