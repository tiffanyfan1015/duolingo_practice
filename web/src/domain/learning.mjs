export function normalizeAnswer(text) {
  return String(text)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}
export function dueNow(record, now = Date.now()) {
  return !!record.reviews && Number.isFinite(record.due) && record.due <= now;
}
export function gradeWord(record, good, now = Date.now()) {
  const intervals = [1, 3, 7, 14, 30],
    stage = good
      ? Math.min(Math.max(0, record.stage || 0) + 1, intervals.length)
      : 0;
  return {
    ...record,
    reviews: (record.reviews || 0) + 1,
    stage,
    due: now + (good ? intervals[stage - 1] * 86400000 : 600000),
    updatedAt: now,
  };
}
