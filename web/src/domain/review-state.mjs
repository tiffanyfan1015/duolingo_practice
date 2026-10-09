import { CARD_TYPES } from "./cards.mjs";
import { DEFAULT_REVIEW_SETTINGS } from "./review-queue.mjs";
import { validWeights } from "./fsrs-model.mjs";
import { validCourseKey } from "./languages.mjs";

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const finite = (value) => Number.isFinite(value) && value >= 0;

export function cleanSettings(value = {}) {
  if (!object(value)) value = {};
  return {
    newLimit: Math.round(
      Math.min(100, Math.max(0, Number(value.newLimit ?? 10) || 0)),
    ),
    reviewLimit: Math.round(
      Math.min(1000, Math.max(0, Number(value.reviewLimit ?? 100) || 0)),
    ),
    retention: Math.min(0.97, Math.max(0.8, Number(value.retention) || 0.9)),
    templates:
      Array.isArray(value.templates) &&
      value.templates.some((type) => Object.hasOwn(CARD_TYPES, type))
        ? [
            ...new Set(
              value.templates.filter((type) => Object.hasOwn(CARD_TYPES, type)),
            ),
          ]
        : [...DEFAULT_REVIEW_SETTINGS.templates],
    burySiblings: value.burySiblings !== false,
    ...(validWeights(value.weights)
      ? {
          weights: [...value.weights],
          modelTrainedAt: String(value.modelTrainedAt || ""),
        }
      : {}),
  };
}

function cleanMemory(value) {
  if (!object(value)) return null;
  const fields = [
    "due",
    "stability",
    "difficulty",
    "elapsed_days",
    "scheduled_days",
    "reps",
    "lapses",
    "state",
    "learning_steps",
  ];
  const memory = {};
  for (const field of fields) {
    if (!finite(value[field])) return null;
    memory[field] = value[field];
  }
  if (
    ![0, 1, 2, 3].includes(memory.state) ||
    memory.difficulty > 10 ||
    memory.due > 8640000000000000
  )
    return null;
  if (finite(value.last_review)) memory.last_review = value.last_review;
  return memory;
}

export function cleanReviewData(value, allowedIds = null) {
  if (
    !object(value) ||
    value.version !== 1 ||
    !object(value.cards) ||
    !Array.isArray(value.logs)
  ) {
    throw new Error("Invalid review collection");
  }
  const cards = {};
  for (const [id, record] of Object.entries(value.cards)) {
    if ((allowedIds && !allowedIds.has(id)) || !object(record)) continue;
    const clean = {};
    for (const key of ["due", "reviews", "buriedUntil", "updatedAt"])
      if (finite(record[key])) clean[key] = record[key];
    clean.suspended = record.suspended === true;
    clean.legacy = record.legacy === true;
    if (record.memory) {
      clean.memory = cleanMemory(record.memory);
      if (!clean.memory) throw new Error("Invalid FSRS memory");
    }
    cards[id] = clean;
  }
  const logs = value.logs
    .filter(
      (log) =>
        object(log) &&
        (!allowedIds || allowedIds.has(log.cardId)) &&
        typeof log.id === "string" &&
        typeof log.cardId === "string" &&
        validCourseKey(log.language) &&
        typeof log.day === "string" &&
        finite(log.at) &&
        [1, 2, 3, 4].includes(log.rating),
    )
    .map((log) => ({
      id: log.id,
      cardId: log.cardId,
      language: log.language,
      day: log.day,
      at: log.at,
      rating: log.rating,
      wasNew: log.wasNew === true,
      wasReview: log.wasReview === true,
    }));
  const settings = Object.fromEntries(
    [...new Set(["de", "ja", ...Object.keys(object(value.settings) ? value.settings : {})])].filter(validCourseKey).map((lang) => [lang, cleanSettings(value.settings?.[lang])]),
  );
  return { version: 1, cards, logs, settings };
}
