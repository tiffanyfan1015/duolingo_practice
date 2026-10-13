// Pure, versioned synchronization records. Field boundaries keep unrelated edits separate.
import { validWeights } from "./fsrs-model.mjs";
import { validCourseKey } from "./languages.mjs";
const studyDefaults = {newLimit:10,reviewLimit:100,retention:0.9,templates:["recognition"],burySiblings:true};
export const studyEqual = (a,b) => studyStable(a) === studyStable(b);
function studyStable(value) {
  if (value === undefined) return "undefined";
  if (value && typeof value === "object" && !Array.isArray(value)) return JSON.stringify(Object.keys(value).sort().map(k=>[k,studyStable(value[k])]));
  return JSON.stringify(value);
}
export function packStudy(progress, review) {
  const cells = {};
  const put = (path,value) => { if (value !== undefined) cells[JSON.stringify(path)] = value; };
  for (const [id,record] of Object.entries(progress.words)) {
    for (const field of ["star","note","updatedAt"]) put(["word",id,field],record[field]);
    const practice = Object.fromEntries(["reviews","stage","due"].filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));
    // A note/star timestamp alone does not constitute a practice record.
    if (["reviews","stage","due"].some(k=>practice[k]!==undefined)) put(["practice",id],practice);
  }
  if (progress.settings.romaji) put(["romaji"],true);
  for (const [id,record] of Object.entries(review.cards)) put(["card",id],record);
  for (const log of review.logs) put(["log",log.id],log);
  for (const [language,settings] of Object.entries(review.settings)) {
    for (const [key,value] of Object.entries(settings)) {
      if (["weights","modelTrainedAt"].includes(key)) continue;
      if (!studyEqual(value,studyDefaults[key])) put(["setting",language,key],value);
    }
    if (settings.weights) put(["model",language],{weights:settings.weights,modelTrainedAt:settings.modelTrainedAt || ""});
  }
  return cells;
}
export function unpackStudy(cells) {
  const progress = {schemaVersion:1,words:{},settings:{romaji:false}};
  const review = {version:1,cards:{},logs:[],settings:{}};
  for (const [key,value] of Object.entries(cells)) {
    const [kind,id,field] = JSON.parse(key);
    if (kind === "word") (progress.words[id] ||= {})[field]=value;
    if (kind === "practice") Object.assign(progress.words[id] ||= {},value);
    if (kind === "romaji") progress.settings.romaji=value;
    if (kind === "card") review.cards[id]=value;
    if (kind === "log") review.logs.push(value);
    if (kind === "setting") (review.settings[id] ||= {})[field]=value;
    if (kind === "model") Object.assign(review.settings[id] ||= {},value);
  }
  review.logs.sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id));
  return {progress,review};
}
export function mergeStudy(base,local,remote,choice=null) {
  const cells={}, conflicts=[];
  for (const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])) {
    const b=base[key],l=local[key],r=remote[key];
    let value;
    if (JSON.parse(key)[2]==="updatedAt") value=Math.max(b || 0,l || 0,r || 0);
    else if (studyEqual(l,b)) value=r;
    else if (studyEqual(r,b) || studyEqual(l,r)) value=l;
    else { conflicts.push({key,local:l,remote:r}); value=choice === "local" ? l : r; }
    if (value !== undefined) cells[key]=value;
  }
  return {cells,conflicts};
}

// Validate wire data before it can reach a user's stores. No client-supplied owner IDs.
export function validateStudyCells(cells) {
  const obj=v=>v && typeof v === "object" && !Array.isArray(v);
  const finite=v=>Number.isFinite(v) && v>=0 && v<=8640000000000000;
  const safe=s=>typeof s === "string" && s.length>0 && s.length<=2000 && !["__proto__","prototype","constructor"].includes(s);
  const keys=(v,allowed)=>obj(v) && Object.keys(v).every(k=>allowed.includes(k));
  if (!obj(cells) || Object.keys(cells).length>100000) throw Error("學習資料格式不正確。");
  for (const [key,v] of Object.entries(cells)) {
    let p; try { p=JSON.parse(key); } catch { throw Error("學習欄位格式不正確。"); }
    if (!Array.isArray(p) || !p.every(safe) || JSON.stringify(p)!==key) throw Error("學習欄位格式不正確。");
    const [kind,id,field]=p;
    let valid=false;
    if (kind==="romaji") valid=p.length===1 && typeof v==="boolean";
    if (kind==="word") valid=p.length===3 && (field==="note" ? typeof v==="string" && v.length<=10000 : field==="updatedAt" ? finite(v) : field==="star" && typeof v==="boolean");
    if (kind==="practice") valid=p.length===2 && keys(v,["reviews","stage","due","updatedAt"]) && Object.values(v).every(finite);
    if (kind==="card") {
      valid=p.length===2 && keys(v,["due","reviews","buriedUntil","updatedAt","suspended","legacy","memory"]) && Object.entries(v).every(([k,x])=>k==="memory" || (["suspended","legacy"].includes(k) ? typeof x==="boolean" : finite(x)));
      if (v && Object.hasOwn(v,"memory")) {
        const fields=["due","stability","difficulty","elapsed_days","scheduled_days","reps","lapses","state","learning_steps"];
        valid=valid && keys(v.memory,[...fields,"last_review"]) && fields.every(k=>finite(v.memory[k])) && Object.values(v.memory).every(finite) && [0,1,2,3].includes(v.memory.state) && v.memory.difficulty<=10;
      }
    }
    if (kind==="log") valid=p.length===2 && keys(v,["id","cardId","language","day","at","rating","wasNew","wasReview"]) && v.id===id && safe(v.cardId) && validCourseKey(v.language) && typeof v.day==="string" && v.day.length<=20 && finite(v.at) && [1,2,3,4].includes(v.rating) && typeof v.wasNew==="boolean" && typeof v.wasReview==="boolean";
    if (kind==="setting") valid=p.length===3 && (field==="templates" ? Array.isArray(v) && v.length>0 && v.length<=3 && v.every(t=>["recognition","recall","listening"].includes(t)) : field==="burySiblings" ? typeof v==="boolean" : ["newLimit","reviewLimit","retention"].includes(field) && finite(v) && v<=(field==="newLimit" ? 100 : field==="reviewLimit" ? 1000 : 0.97) && (field!=="retention" || v>=0.8));
    if (kind==="model") valid=p.length===2 && keys(v,["weights","modelTrainedAt"]) && validWeights(v.weights) && typeof v.modelTrainedAt==="string" && v.modelTrainedAt.length<=100;
    if (["setting","model"].includes(kind)) valid=valid && validCourseKey(id);
    if (!valid) throw Error("學習資料含有不支援或無效的欄位。");
  }
  return cells;
}
