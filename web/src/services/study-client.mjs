export function createStudyClient(userId,fetcher=fetch) {
  async function request(method,path,body) {
    const response=await fetcher(`/api/study${path}`,{method,cache:"no-store",headers:{"X-Cijian-User":userId,...(body ? {"Content-Type":"application/json","X-Study-Sync":"1"} : {})},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(20000)});
    const value=await response.json();
    if (!response.ok) {const error=Error(value.error || "學習紀錄暫時無法同步。");error.status=response.status;error.code=value.code;throw error;}
    return value;
  }
  return {get:revision=>request("GET",`?revision=${revision}`),put:(revision,cells)=>request("PUT","",{revision,cells})};
}
