import { mergeStudy, studyEqual, validateStudyCells } from "./domain/study-sync.mjs";
import { createStudyClient } from "./services/study-client.mjs";
import { studySyncView } from "./ui/views/study-sync.mjs";
import { bindStudySyncEvents } from "./ui/study-sync-events.mjs";

// Purely orchestrates a single GET/compare-and-swap loop; no cloud writes on a stale account.
export function createStudySync({store,client,onStatus=()=>{},onRemote=()=>{},lock=fn=>fn()}) {
  let busy=null,blocked=false,conflict=null;
  const status=value=>onStatus(value);
  store.subscribe(event=>{if(event.error){blocked=true;status({state:"error",message:event.error.message});}else if(event.local && !blocked)status({state:"pending"});if(event.external)onRemote();});
  async function run(choice) {
    if (blocked) return;
    for(let attempt=0;attempt<4;attempt++) {
      store.refresh();const start=store.read();
      const response=await client.get(start.revision);
      const remote=response.unchanged ? start.base : validateStudyCells(response.cells);
      const current=store.read();
      // Another tab might have completed a sync while this request was in flight.
      if(current.revision!==start.revision) continue;
      const merged=mergeStudy(current.base,current.local,remote);
      if(merged.conflicts.length) {
        if (!choice || !conflict || conflict.revision!==response.revision || !studyEqual(conflict.local,current.local)) {
          conflict={revision:response.revision,local:current.local};
          status({state:"conflict",conflicts:merged.conflicts});return;
        }
        Object.assign(merged,mergeStudy(current.base,current.local,remote,choice));
      }
      try {
        const changed=!studyEqual(merged.cells,remote);
        const result=changed ? await client.put(response.revision,merged.cells) : response;
        store.accept(current.local,merged.cells,result.revision);
        conflict=null;
        const pending=store.read();
        if (!studyEqual(pending.base,pending.local)) {choice=null;continue;}
        status({state:"synced"});return;
      } catch(error) {if(error.code==="revision-conflict"){choice=null;continue;}throw error;}
    }
    status({state:"pending",message:"其他裝置正在更新，稍後會再同步。"});
  }
  return {
    sync(choice=null) {
      if(busy || blocked)return busy || Promise.resolve();
      status({state:"syncing"});
      busy=Promise.resolve().then(()=>lock(()=>run(choice))).catch(error=>{
        if([401,403,409].includes(error.status)) {blocked=true;status({state:"auth",message:"登入狀態已變更，請重新登入後同步。本機紀錄仍保留。"});}
        else status({state:"error",message:error.status ? error.message : "連線中斷或回應無效，變更仍保存在此裝置，稍後會重試。"});
      }).finally(()=>{busy=null;});return busy;
    },
  };
}

export function mountStudySync({store,userId,onRemote}) {
  const element=document.querySelector("#study-sync-area");
  const engine=createStudySync({store,client:createStudyClient(userId),onRemote,
    lock:fn=>navigator.locks ? navigator.locks.request(`study-sync:${userId}`,fn) : fn(),
    onStatus:state=>{element.innerHTML=studySyncView(state);},
  });
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>engine.sync(),1500);};
  store.subscribe(event=>{if(event.local && !event.error)schedule();});
  bindStudySyncEvents({sync:choice=>engine.sync(choice),refresh:()=>engine.sync()});
  setInterval(()=>{if(document.visibilityState==="visible")engine.sync();},30000);
  engine.sync();return engine;
}
