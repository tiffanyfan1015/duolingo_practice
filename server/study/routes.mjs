import { studyRepository } from "./repository.mjs";
import { validateStudyCells } from "../../web/src/domain/study-sync.mjs";
import { accountJson } from "../accounts/routes.mjs";
import { SyncError } from "../sync/duolingo.mjs";
export async function studyRoutes(request,env,user) {
  if (request.headers.get("X-Cijian-User")!==user.id) return accountJson({error:"登入帳號已變更，請重新登入。",code:"account-changed"},409);
  const url=new URL(request.url),repo=studyRepository(env.DB,user.id);
  if (!["GET","PUT"].includes(request.method)) return accountJson({error:"Method not allowed"},405);
  if (request.method==="PUT" && (request.headers.get("Origin")!==url.origin || request.headers.get("X-Study-Sync")!=="1" || !request.headers.get("Content-Type")?.startsWith("application/json"))) throw new SyncError("操作來源不合法。",403);
  await repo.init();
  if (request.method==="GET") {
    const known=url.searchParams.get("revision");
    return accountJson(await repo.read(known!==null && /^\d+$/.test(known) ? Number(known) : -1));
  }
  const reader=request.body?.getReader(),decoder=new TextDecoder();let size=0,text="";
  if (reader) while (true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8000000){await reader.cancel();throw new SyncError("同步資料超過 8 MB，請先匯出備份。",413);}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();let body;
  try {body=JSON.parse(text);if (!Number.isSafeInteger(body.revision) || body.revision<0) throw Error();validateStudyCells(body.cells);}
  catch {throw new SyncError("同步資料格式不正確。",400);}
  if (!await repo.write(body.revision,body.cells)) return accountJson({code:"revision-conflict",error:"其他裝置已有更新。"},409);
  return accountJson({revision:body.revision+1});
}
