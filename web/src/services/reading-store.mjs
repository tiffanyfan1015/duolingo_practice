import { kanaPronunciation } from "./language-tools.mjs";
const KEY = "cijian-dictionary-readings-v1";
const MAX = 2000, TTL = 30 * 86400000;
export function createReadingStore(storage) {
  let entries = new Map();
  try {
    const data = JSON.parse(storage?.getItem(KEY));
    if (Array.isArray(data)) entries = new Map(data.filter(row => Array.isArray(row) && typeof row[0] === "string" && row[0].length <= 200 && row[1]?.expires > Date.now() && kanaPronunciation(row[1]?.reading)).slice(-MAX));
  } catch { /* A disposable dictionary cache must never block learning. */ }
  return {
    get(text) {
      const entry = entries.get(text);
      return entry?.expires > Date.now() ? kanaPronunciation(entry.reading) : null;
    },
    put(text, pronunciation) {
      if (!kanaPronunciation(pronunciation?.reading) || typeof text !== "string" || text.length > 200) return;
      entries.delete(text);
      entries.set(text, { reading: pronunciation.reading, expires: Date.now() + TTL });
      while (entries.size > MAX) entries.delete(entries.keys().next().value);
      try { storage?.setItem(KEY, JSON.stringify([...entries])); } catch { /* Still usable in memory. */ }
    },
  };
}
