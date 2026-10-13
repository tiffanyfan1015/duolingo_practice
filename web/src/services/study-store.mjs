import { packStudy, unpackStudy, mergeStudy, studyEqual, validateStudyCells } from "../domain/study-sync.mjs";
export const STUDY_KEY = "cijian-study-sync-v1";

// The journal stores both the last cloud base and pending local work in one write.
// Existing store keys/backups remain usable. On restart, the journal repairs a partial apply.
export function createStudyStore(storage,progress,review) {
  const listeners=new Set();let applying=false;
  const snapshot=()=>packStudy(JSON.parse(progress.serialize()),review.validateImport(review.snapshot()));
  let observed=snapshot();
  function read() {
    const raw=storage.getItem(STUDY_KEY);
    if (!raw) return {version:1,revision:0,base:{},local:observed};
    const value=JSON.parse(raw);
    if (value.version!==1 || !Number.isSafeInteger(value.revision) || value.revision<0) throw Error("同步紀錄無法讀取，請先匯出備份。");
    validateStudyCells(value.base);validateStudyCells(value.local);return value;
  }
  function apply(cells) {
    if (studyEqual(observed,cells)) return false;
    const value=unpackStudy(cells);
    applying=true;
    try {progress.replaceSynced(value.progress);review.replaceSynced(value.review);observed=snapshot();}
    finally {applying=false;}
    return true;
  }
  function write(journal) {
    try {storage.setItem(STUDY_KEY,JSON.stringify(journal));}
    catch {throw Error("本機儲存空間不足，尚未完成同步；請先匯出備份。");}
  }
  const initial=read();let observedBase=initial.base;write(initial);apply(initial.local);
  function changed() {
    if (applying) return;
    try {
      const journal=read(),current=snapshot();
      const merged=mergeStudy(observed,current,journal.local,"local").cells;
      write({...journal,local:merged});observed=current;
      observedBase=journal.base;
      const external=apply(merged);
      for (const fn of listeners) fn({local:true,external});
    } catch(error) {for (const fn of listeners) fn({error});}
  }
  progress.subscribe(changed);review.subscribe(changed);
  return {
    read,
    subscribe(fn) {listeners.add(fn);return()=>listeners.delete(fn);},
    refresh() {
      const journal=read();
      // Recover disjoint edits if two tabs wrote the local journal almost simultaneously.
      const local=mergeStudy(observedBase,observed,journal.local,"remote").cells;
      if(!studyEqual(local,journal.local))write({...journal,local});
      observedBase=journal.base;
      const changed=apply(local);if(changed)for(const fn of listeners)fn({external:true});
    },
    accept(sent,remote,revision) {
      const latest=read();
      if(revision<latest.revision){this.refresh();return;}
      // Edits made during the request remain pending after this acknowledgement.
      const local=mergeStudy(sent,latest.local,remote,"local").cells;
      write({version:1,revision,base:remote,local});
      observedBase=remote;
      if (apply(local)) for(const fn of listeners)fn({external:true});
    },
  };
}
