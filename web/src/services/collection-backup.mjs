import { cardsForCourse } from "../domain/cards.mjs";

export function exportCollection(progress, review) {
  return JSON.stringify(
    {
      ...JSON.parse(progress.serialize()),
      schemaVersion: 2,
      review: review.snapshot(),
    },
    null,
    2,
  );
}

export function importCollection(text, catalog, progress, review) {
  const data = JSON.parse(text);
  if (![1, 2].includes(data.schemaVersion))
    throw new Error("Unknown backup version");
  const allowedWords = new Set(
    catalog.courses.flatMap((course) => course.words.map((word) => word.id)),
  );
  const allowedCards = new Set(
    catalog.courses.flatMap(cardsForCourse).map((card) => card.id),
  );
  // Validate both formats before either store is changed.
  const incoming =
    data.schemaVersion === 2
      ? review.validateImport(data.review, allowedCards)
      : null;
  const count = progress.import(
    JSON.stringify({ ...data, schemaVersion: 1 }),
    allowedWords,
  );
  if (incoming) review.merge(incoming);
  return count;
}
