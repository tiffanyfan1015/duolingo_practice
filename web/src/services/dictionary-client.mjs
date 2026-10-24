import { matchedJapaneseLemmas, matchedJapaneseReadings } from "../domain/dictionary.mjs";
import { parseDictionaryPage } from "./dictionary-parser.mjs";
import { kanaPronunciation } from "./language-tools.mjs";

export function createDictionaryClient({ fetcher = fetch, parse = parseDictionaryPage, userId = null } = {}) {
  const cache = new Map();
  async function query(provider, term) {
    const response = await fetcher(`/api/dictionary?${new URLSearchParams({provider,term})}`, {headers:userId ? {"X-Cijian-User":userId} : {}, cache:"no-store",signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw Error([401,409].includes(response.status) ? "登入狀態已變更，請重新整理。" : response.status === 429 ? "字典查詢次數較多，請稍後重試。" : "字典暫時無法查詢，請稍後重試。");
    return response.json();
  }
  async function lookup(text, language) {
    let candidates = parse(await query("wiki",text),language);
    let pronunciation = null;
    let readingEntries = [];
    if (language === "ja") {
      const readings = [...new Set(candidates.filter(c=>c.lemma === text).flatMap(c=>(c.readings || []).map(r=>r.text)))];
      pronunciation = kanaPronunciation(text) || (readings.length === 1 ? kanaPronunciation(readings[0]) : null);
    }
    if (language === "ja") {
      let data;
      try { data = await query("jisho",text); }
      catch (error) { if (!candidates.length) throw error; }
      if (data) {
        readingEntries = matchedJapaneseReadings(data,text).filter(entry => kanaPronunciation(entry.reading));
        const readings = new Set([
          ...candidates.filter(c => c.lemma === text).flatMap(c => (c.readings || []).map(r => r.text)).filter(r => kanaPronunciation(r)),
          ...readingEntries.map(entry => entry.reading),
        ]);
        pronunciation = kanaPronunciation(text) || (readings.size === 1 ? kanaPronunciation([...readings][0]) : null);
      }
      for (const lemma of !candidates.length && data ? matchedJapaneseLemmas(data,text) : []) {
        const found = parse(await query("wiki",lemma),language);
        for (const c of found) c.lookupSource = `https://jisho.org/search/${encodeURIComponent(text)}`;
        candidates.push(...found);
      }
    }
    if (!candidates.length && language === "de" && /^(der|die|das)\s+\S/.test(text)) {
      candidates = parse(await query("wiki",text.replace(/^(der|die|das)\s+/,"")),language);
    }
    return {status:candidates.length || readingEntries.length ? "ready" : "empty",candidates,pronunciation,readingEntries};
  }
  return {
    async lookup(text,language) {
      if (!["de","ja"].includes(language)) return {status:"unsupported",candidates:[]};
      const key = `${language}:${text}`;
      if (!cache.has(key)) {
        if (cache.size >= 50) cache.delete(cache.keys().next().value);
        cache.set(key,lookup(text,language).catch(error=>{cache.delete(key); throw error;}));
      }
      return cache.get(key);
    },
  };
}
