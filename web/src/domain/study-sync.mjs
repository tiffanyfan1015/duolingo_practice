// Pure, versioned synchronization records. Field boundaries keep unrelated edits separate.
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

export { validateStudyCells } from "./study-validation.mjs";
