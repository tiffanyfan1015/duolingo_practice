import test from "node:test";
import assert from "node:assert/strict";
import { orderDictionarySenses, matchedJapaneseLemmas, japaneseLookupForms, dictionaryGrammar } from "../web/src/domain/dictionary.mjs";
import { createDictionaryClient } from "../web/src/services/dictionary-client.mjs";
import { dictionaryView } from "../web/src/ui/views/dictionary.mjs";
import { createDictionaryProxy } from "../server/dictionary/routes.ts";
import worker from "../server/worker.ts";
import { testDatabase } from "./helpers/database.mjs";

test("German noun abbreviations are explained without rewriting adjective grammar",()=>{
  const candidate={language:"de",lemma:"Stadtzentrum",pos:["名詞"],grammar:"Stadtzentrum 中 (強變化，屬格 Stadtzentrums，複數 Stadtzentren)"};
  const result=dictionaryGrammar(candidate);
  assert.equal(result.text,"中性名詞（das） (強變化，單數屬格 Stadtzentrums，複數形式 Stadtzentren)");
  assert(result.explanation.includes("與難度等級無關"));
  assert.equal(dictionaryGrammar({...candidate,pos:["形容詞"]}).text,candidate.grammar);
  const html=dictionaryView({status:"ready",candidates:[{...candidate,senses:[{glosses:["市中心"],examples:[{text:"日本麦酒"}],related:["近義詞：僅用於複合詞 ビア"]}]}]},{meanings:[]});
  assert(html.includes("用法示例"));assert(html.includes("相關詞語"));assert(!html.includes("更多例句"));
});

test("all senses survive ranking and rendering, uncommon senses stay marked",()=>{
  const candidate={lemma:"食べる",senses:[{glosses:["維持生計"]},{glosses:["吃"],examples:[{text:"<script>bad()</script>",translation:"吃飯"}]},{glosses:["古語：吃喝"]}]};
  const senses=orderDictionarySenses(candidate,["吃"]);
  assert.deepEqual(senses.map(s=>s.index),[1,0,2]);
  const html=dictionaryView({status:"ready",candidates:[candidate]},{meanings:["吃"]});
  for (const text of ["維持生計","吃喝","其他意思","較少用"]) assert(html.includes(text));
  assert(!html.includes("<script>"));
  assert.equal(candidate.senses[0].glosses[0],"維持生計");
  assert(!orderDictionarySenses({senses:[{glosses:["食べる"]}]},["食"])[0].overlap);
});
test("Japanese base lookup confirms inflection and rejects unrelated search results",()=>{
  const data={data:[{japanese:[{word:"食べるラー油"}],senses:[{parts_of_speech:["Noun"]}]},{japanese:[{word:"食べる",reading:"たべる"}],senses:[{parts_of_speech:["Ichidan verb"]}]}]};
  assert.deepEqual(matchedJapaneseLemmas(data,"食べます"),["食べる"]);
  assert.deepEqual(matchedJapaneseLemmas(data,"たべます"),["食べる"]);
  assert.deepEqual(matchedJapaneseLemmas(data,"知らない"),[]);
  assert(japaneseLookupForms("行く",["Godan verb - Iku/Yuku special class"]).includes("行った"));
  assert(japaneseLookupForms("する",["Suru verb - irregular"]).includes("します"));
});
test("client coalesces lookup, preserves account context, retries errors and skips unsupported languages",async()=>{
  let calls=0,fail=true;
  const client=createDictionaryClient({userId:"alice",parse:p=>p.candidates,fetcher:async(url,options)=>{
    calls++; assert.equal(options.headers["X-Cijian-User"],"alice");
    if (fail) return new Response("",{status:502});
    return Response.json({candidates:[{lemma:"sprechen",senses:[{glosses:["說"]},{glosses:["談話"]}]}]});
  }});
  await assert.rejects(client.lookup("sprechen","de"));
  fail=false;
  const [a,b]=await Promise.all([client.lookup("sprechen","de"),client.lookup("sprechen","de")]);
  assert.deepEqual(a,b); assert.equal(calls,2);
  assert.equal((await client.lookup("bonjour","fr")).status,"unsupported"); assert.equal(calls,2);
});
const dictionaryRequest=(term="test",provider="wiki",options={})=>new Request(`https://app.test/api/dictionary?${new URLSearchParams({term,provider})}`,options);
test("proxy fixes provider URLs, strips secrets, bounds responses and caches successful requests",async()=>{
  let calls=0;
  const proxy=createDictionaryProxy(async(url,options)=>{
    calls++; assert.equal(new URL(url).hostname,"zh.wiktionary.org");
    assert.equal(options.headers.Cookie,undefined); assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.redirect,"error");
    return Response.json({parse:{title:"test",text:"<h2>德語</h2>",revid:1}});
  });
  const a=await proxy(dictionaryRequest("https://evil.test", "wiki",{headers:{Cookie:"secret",Authorization:"secret"}}));
  assert.equal(a.status,200); assert.equal(a.headers.get("Cache-Control"),"private, no-store");
  assert.equal((await proxy(dictionaryRequest("https://evil.test"))).status,200); assert.equal(calls,1);
  assert.equal((await proxy(dictionaryRequest("x","evil"))).status,400);
  assert.equal((await proxy(dictionaryRequest("x".repeat(121)))).status,400);
  assert.equal((await proxy(dictionaryRequest("x","wiki",{method:"POST"}))).status,405);
  assert.equal((await createDictionaryProxy(async()=>new Response("x".repeat(2_000_001)))(dictionaryRequest())).status,502);
});
test("transient upstream errors are not cached as empty results",async()=>{
  let calls=0;
  const proxy=createDictionaryProxy(async()=>++calls===1 ? Response.json({error:{code:"ratelimited"}}) : Response.json({error:{code:"missingtitle"}}));
  assert.equal((await proxy(dictionaryRequest())).status,502);
  assert.equal((await proxy(dictionaryRequest())).status,200);
  assert.equal(calls,2);
});
test("upstream rate limit pauses new requests without discarding cached words",async()=>{
  let calls=0;
  const proxy=createDictionaryProxy(async()=>++calls===1 ? Response.json({error:{code:"missingtitle"}}) : new Response("",{status:429,headers:{"Retry-After":"60"}}));
  assert.equal((await proxy(dictionaryRequest("cached"))).status,200);
  assert.equal((await proxy(dictionaryRequest("limited"))).status,429);
  assert.equal((await proxy(dictionaryRequest("another"))).status,429);
  assert.equal((await proxy(dictionaryRequest("cached"))).status,200);
  assert.equal(calls,2);
});
test("dictionary API requires the existing account and rejects account-switch requests",async(t)=>{
  const DB=testDatabase();t.after(()=>DB.close());
  const env={MULTI_USER:"true",DB,CREDENTIAL_KEY:"ab".repeat(32),REGISTRATION_CODE:"dictionary-test-invitation-code"};
  assert.equal((await worker.fetch(dictionaryRequest(),env)).status,401);
  const registered=await worker.fetch(new Request("https://app.test/api/account/register",{method:"POST",headers:{Origin:"https://app.test","Content-Type":"application/json","X-Cijian-Account":"1"},body:JSON.stringify({username:"alice",password:"dictionary-test-password",invite:env.REGISTRATION_CODE})}),env);
  assert.equal(registered.status,200);
  const cookie=registered.headers.get("set-cookie").split(";")[0],user=(await registered.json()).user;
  t.mock.method(globalThis,"fetch",async()=>Response.json({error:{code:"missingtitle"}}));
  assert.equal((await worker.fetch(dictionaryRequest("unique-auth-check","wiki",{headers:{Cookie:cookie,"X-Cijian-User":user.id}}),env)).status,200);
  assert.equal((await worker.fetch(dictionaryRequest("unique-auth-check","wiki",{headers:{Cookie:cookie,"X-Cijian-User":"other-user"}}),env)).status,409);
});
