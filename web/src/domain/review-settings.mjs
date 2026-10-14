// @ts-check
// One source for the defaults used by scheduling, persistence and synchronization.
export const DEFAULT_REVIEW_SETTINGS = Object.freeze({
  newLimit: 10,
  reviewLimit: 100,
  retention: 0.9,
  templates: Object.freeze(['recognition']),
  burySiblings: true,
});
