import { cleanReviewData, cleanSettings } from "../domain/review-state.mjs";
import { effectiveRecord, cardPhase } from "../domain/cards.mjs";
import { localDay, nextDay } from "../domain/review-queue.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

export const REVIEW_KEY = "cijian-review-v1";

export function createReviewStore(storage, notify = () => {}) {
  const listeners = new Set();
  let data = { version: 1, cards: {}, logs: [], settings: {} };
  let undo = null;
  try {
    const stored = storage.getItem(REVIEW_KEY);
    if (stored) data = cleanReviewData(JSON.parse(stored));
  } catch {
    notify("每日複習資料無法讀取，請從備份還原。");
  }

  function persist(emit = true) {
    try {
      storage.setItem(REVIEW_KEY, JSON.stringify(data));
    } catch {
      notify("每日複習紀錄無法儲存，請立即備份。");
    }
    if (emit) for (const listener of listeners) listener();
  }
  function checkpoint(cardId) {
    undo = { data: clone(data), cardId };
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    replaceSynced(snapshot) {
      data = cleanReviewData(snapshot);
      undo = null;
      persist(false);
    },
    get records() {
      return data.cards;
    },
    get logs() {
      return data.logs;
    },
    get canUndo() {
      return !!undo;
    },
    get undoCardId() {
      return undo?.cardId;
    },
    settings(language) {
      return cleanSettings(data.settings[language]);
    },
    setSettings(language, settings) {
      data.settings[language] = cleanSettings(settings);
      undo = null;
      persist();
    },
    snapshot() {
      return clone(data);
    },
    rate(card, scheduled, rating, allCards, legacyWords, now = Date.now()) {
      checkpoint(card.id);
      const before = effectiveRecord(card, data.cards, legacyWords);
      const phase = cardPhase(before);
      data.cards[card.id] = {
        ...before,
        memory: scheduled.memory,
        due: scheduled.memory.due,
        reviews: (before.reviews || 0) + 1,
        legacy: false,
        updatedAt: now,
      };
      data.logs.push({
        id: `${now}-${crypto.randomUUID()}`,
        cardId: card.id,
        language: card.language,
        at: now,
        day: localDay(now),
        rating,
        wasNew: phase === "new",
        wasReview: phase === "review",
      });
      if (this.settings(card.language).burySiblings) {
        for (const sibling of allCards.filter(
          (item) => item.noteId === card.noteId && item.id !== card.id,
        )) {
          const record = effectiveRecord(sibling, data.cards, legacyWords);
          if (!record.suspended && cardPhase(record) !== "learning") {
            data.cards[sibling.id] = {
              ...record,
              buriedUntil: nextDay(now),
              updatedAt: now,
            };
          }
        }
      }
      persist();
    },
    hide(card, kind, legacyWords, now = Date.now()) {
      checkpoint(card.id);
      const record = effectiveRecord(card, data.cards, legacyWords);
      data.cards[card.id] = {
        ...record,
        suspended: kind === "suspend",
        buriedUntil: kind === "bury" ? nextDay(now) : 0,
        updatedAt: now,
      };
      persist();
    },
    restoreCard(card, legacyWords, now = Date.now()) {
      checkpoint(card.id);
      data.cards[card.id] = {
        ...effectiveRecord(card, data.cards, legacyWords),
        suspended: false,
        buriedUntil: 0,
        updatedAt: now,
      };
      persist();
    },
    undo() {
      if (!undo) return null;
      const previous = undo;
      data = previous.data;
      undo = null;
      persist();
      return previous.cardId;
    },
    validateImport(value, allowed) {
      return cleanReviewData(value, allowed);
    },
    merge(incoming) {
      for (const [id, record] of Object.entries(incoming.cards)) {
        if ((record.updatedAt || 0) >= (data.cards[id]?.updatedAt || 0))
          data.cards[id] = record;
      }
      const logs = new Map(data.logs.map((log) => [log.id, log]));
      for (const log of incoming.logs) logs.set(log.id, log);
      data.logs = [...logs.values()].sort((a, b) => a.at - b.at);
      data.settings = incoming.settings;
      undo = null;
      persist();
    },
  };
}
