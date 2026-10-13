// @ts-check
import { validateStudyCells } from '../domain/study-validation.mjs';
/** @typedef {import('../../../shared/study.ts').StudyCells} StudyCells */
/** @param {string} userId @param {typeof fetch} fetcher @returns {import('../../../shared/study.ts').StudyClient} */
export function createStudyClient(userId,fetcher=fetch) {
  /** @param {string} method @param {string} path @param {import('../../../shared/study.ts').StudyWrite} [body] @returns {Promise<Record<string, unknown>>} */
  async function request(method,path,body) {
    const response=await fetcher(`/api/study${path}`,{method,cache:"no-store",headers:{"X-Cijian-User":userId,...(body ? {"Content-Type":"application/json","X-Study-Sync":"1"} : {})},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(20000)});
    const value=await response.json();
    if (!response.ok) throw Object.assign(Error(typeof value?.error === 'string' ? value.error : "學習紀錄暫時無法同步。"), {status:response.status,code:value?.code});
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('同步資料格式不正確。');
    return value;
  }
  return {
    async get(revision) {
      const value = await request('GET', `?revision=${revision}`);
      const remoteRevision = /** @type {number} */ (value.revision);
      return value.unchanged === true ? {revision:remoteRevision,unchanged:true} : {revision:remoteRevision,cells:validateStudyCells(value.cells)};
    },
    async put(revision, cells) {
      const value = await request('PUT', '', {revision,cells});
      return {revision: /** @type {number} */ (value.revision)};
    },
  };
}
