import { createEmptyCard, fsrs } from "../../vendor/ts-fsrs.mjs";

// The only boundary that knows the vendor's Date objects and parameter format.
export function previewRatings(record, retention, now = Date.now(), weights) {
  const card = record.memory
    ? {
        ...record.memory,
        due: new Date(record.memory.due),
        ...(record.memory.last_review == null
          ? {}
          : { last_review: new Date(record.memory.last_review) }),
      }
    : createEmptyCard(new Date(now));
  const scheduler = fsrs({
    ...(weights ? { w: weights } : {}),
    request_retention: retention,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
  });
  const results = scheduler.repeat(card, new Date(now));
  return Object.fromEntries(
    [1, 2, 3, 4].map((rating) => {
      const result = results[rating].card;
      return [
        rating,
        {
          memory: {
            ...result,
            due: result.due.getTime(),
            last_review: result.last_review.getTime(),
          },
        },
      ];
    }),
  );
}
