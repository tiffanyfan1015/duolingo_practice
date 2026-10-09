import { normalizeAnswer, dueNow } from "./learning.mjs";

export function filterWords(
  words,
  records,
  { query = "", unit = "all", status = "all" },
  now = Date.now(),
) {
  const search = normalizeAnswer(query);
  return words.filter((word) => {
    const record = records[word.id] || {};
    const matchesUnit = unit === "all" || word.units.includes(unit);
    const haystack = [
      word.text,
      ...word.meanings,
      word.reading,
      word.romaji,
    ].join(" ");
    const matchesSearch = !search || normalizeAnswer(haystack).includes(search);
    const matchesStatus =
      status === "all" ||
      (status === "star" && record.star) ||
      (status === "new" && !record.reviews) ||
      (status === "due" && dueNow(record, now));
    return matchesUnit && matchesSearch && matchesStatus;
  });
}
