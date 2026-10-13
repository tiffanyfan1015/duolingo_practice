import { gradeWord } from "../domain/learning.mjs";
export { createValidationStore } from "./validation-store.mjs";
export { createStudyStore } from "./study-store.mjs";

export const STORAGE_KEY = "cijian-progress-v1";

// Keep old keys and backup formats; multi-user data has a separate namespace.
export function accountStorage(storage, userId) {
  if (!userId) return storage;
  const prefix = `cijian-user:${encodeURIComponent(userId)}:`;
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
  };
}

function cleanRecord(record) {
  const clean = {};
  if (!record || typeof record !== "object" || Array.isArray(record))
    return clean;
  for (const key of ["reviews", "stage", "due", "updatedAt"]) {
    if (Number.isFinite(record[key]) && record[key] >= 0)
      clean[key] = record[key];
  }
  if (typeof record.star === "boolean") clean.star = record.star;
  if (typeof record.note === "string") clean.note = record.note.slice(0, 10000);
  return clean;
}

export function createProgressStore(storage, notify = () => {}) {
  const listeners = new Set();
  let data = { words: {}, settings: { romaji: false } };
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (
      saved?.words &&
      typeof saved.words === "object" &&
      !Array.isArray(saved.words)
    ) {
      data.words = Object.fromEntries(
        Object.entries(saved.words).map(([id, record]) => [
          id,
          cleanRecord(record),
        ]),
      );
      data.settings.romaji = saved.settings?.romaji === true;
    }
  } catch {
    /* An empty or damaged local file starts a fresh session. */
  }

  function persist(emit = true) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      notify("瀏覽器無法儲存，請使用備份功能保留紀錄。");
    }
    if (emit) for (const listener of listeners) listener();
  }

  function update(id, changes) {
    data.words[id] = { ...data.words[id], ...changes, updatedAt: Date.now() };
    persist();
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    replaceSynced(snapshot) {
      data = {words:Object.fromEntries(Object.entries(snapshot.words).map(([id,r])=>[id,cleanRecord(r)])),settings:{romaji:snapshot.settings.romaji===true}};
      persist(false);
    },
    get records() {
      return data.words;
    },
    get romaji() {
      return data.settings.romaji;
    },
    get(id) {
      return data.words[id] || {};
    },
    toggleStar(id) {
      update(id, { star: !data.words[id]?.star });
    },
    setNote(id, note) {
      update(id, { note });
    },
    setRomaji(value) {
      data.settings.romaji = value;
      persist();
    },
    grade(id, good) {
      data.words[id] = gradeWord(data.words[id] || {}, good);
      persist();
    },
    serialize() {
      return JSON.stringify({ schemaVersion: 1, ...data }, null, 2);
    },
    import(text, allowedIds) {
      const incoming = JSON.parse(text);
      if (
        incoming.schemaVersion !== 1 ||
        !incoming.words ||
        typeof incoming.words !== "object" ||
        Array.isArray(incoming.words)
      ) {
        throw new Error("Invalid progress backup");
      }
      let count = 0;
      for (const [id, record] of Object.entries(incoming.words)) {
        if (!allowedIds.has(id) || !record || typeof record !== "object")
          continue;
        const clean = cleanRecord(record);
        if ((clean.updatedAt || 0) >= (data.words[id]?.updatedAt || 0)) {
          data.words[id] = { ...data.words[id], ...clean };
          count++;
        }
      }
      if (typeof incoming.settings?.romaji === "boolean")
        data.settings.romaji = incoming.settings.romaji;
      persist();
      return count;
    },
  };
}
