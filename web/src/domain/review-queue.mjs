import { cardPhase, effectiveRecord } from "./cards.mjs";

export const DEFAULT_REVIEW_SETTINGS = {
  newLimit: 10,
  reviewLimit: 100,
  retention: 0.9,
  templates: ["recognition"],
  burySiblings: true,
};

export function localDay(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function nextDay(now) {
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function reviewQueue({
  cards,
  records,
  legacyWords = {},
  logs,
  settings,
  unit = "all",
  now = Date.now(),
}) {
  const today = logs.filter(
    (log) => log.day === localDay(now) && log.language === cards[0]?.language,
  );
  const introduced = new Set(
    today.filter((log) => log.wasNew).map((log) => log.cardId),
  );
  const reviewed = new Set(
    today.filter((log) => log.wasReview).map((log) => log.cardId),
  );
  const scoped = cards.filter(
    (card) =>
      settings.templates.includes(card.type) &&
      (unit === "all" || card.units.includes(unit)),
  );
  const eligible = scoped.filter((card) => {
    const record = effectiveRecord(card, records, legacyWords);
    return !record.suspended && !(record.buriedUntil > now);
  });
  const newCards = [],
    learning = [],
    reviews = [],
    waiting = [];
  for (const card of eligible) {
    const record = effectiveRecord(card, records, legacyWords);
    const phase = cardPhase(record);
    if (phase === "new") newCards.push(card);
    else if ((record.due || 0) > now) waiting.push(card);
    else if (phase === "learning") learning.push(card);
    else reviews.push(card);
  }
  const dueSort = (a, b) =>
    (effectiveRecord(a, records, legacyWords).due || 0) -
    (effectiveRecord(b, records, legacyWords).due || 0);
  learning.sort(dueSort);
  reviews.sort(dueSort);
  let reviewSlots = Math.max(0, settings.reviewLimit - reviewed.size);
  const reviewToday = reviews.filter(
    (card) => reviewed.has(card.id) || reviewSlots-- > 0,
  );
  const newToday = newCards.slice(
    0,
    Math.max(0, settings.newLimit - introduced.size),
  );
  const queue = [...learning, ...reviewToday, ...newToday];
  const futureLearning = waiting
    .filter(
      (card) =>
        cardPhase(effectiveRecord(card, records, legacyWords)) === "learning",
    )
    .sort(dueSort);
  return {
    queue,
    newCount: newToday.length,
    learningCount: learning.length,
    reviewCount: reviewToday.length,
    totalNew: newCards.length,
    limitedReviewCount: reviews.length - reviewToday.length,
    hiddenCount: scoped.length - eligible.length,
    nextLearningDue: futureLearning.length
      ? effectiveRecord(futureLearning[0], records, legacyWords).due
      : null,
    todayCount: today.length,
    introducedCount: introduced.size,
    reviewedCount: reviewed.size,
    againCount: today.filter((log) => log.rating === 1).length,
  };
}
