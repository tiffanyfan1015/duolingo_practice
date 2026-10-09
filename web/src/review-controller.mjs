import { cardsForCourse, effectiveRecord } from "./domain/cards.mjs";
import { reviewQueue } from "./domain/review-queue.mjs";
import { previewRatings } from "./services/fsrs-scheduler.mjs";
import { reviewView } from "./ui/views/review.mjs";
import { parseModel } from "./domain/fsrs-model.mjs";

export function createReviewController({
  store,
  progress,
  audio,
  course,
  unit,
  romaji,
  notify,
}) {
  const cache = new Map();
  let screen = "overview",
    currentId = null,
    revealed = false,
    previews = null,
    answeredAt = 0;
  const cards = () => {
    if (!cache.has(course().id))
      cache.set(course().id, cardsForCourse(course()));
    return cache.get(course().id);
  };
  const current = () => cards().find((card) => card.id === currentId);
  const queue = () =>
    reviewQueue({
      cards: cards(),
      records: store.records,
      legacyWords: progress.records,
      logs: store.logs,
      settings: store.settings(course().id),
      unit: unit(),
    });
  function next() {
    audio.stop();
    currentId = queue().queue[0]?.id || null;
    revealed = false;
    previews = null;
  }
  return {
    invalidate() {
      cache.clear();
      this.reset();
    },
    reset() {
      screen = "overview";
      currentId = null;
      revealed = false;
      previews = null;
    },
    view() {
      return reviewView({
        screen,
        card: current(),
        revealed,
        previews,
        answeredAt,
        queue: queue(),
        cards: cards(),
        records: store.records,
        legacyWords: progress.records,
        settings: store.settings(course().id),
        canUndo:
          store.canUndo && cards().some((card) => card.id === store.undoCardId),
        language: course().id,
        showRomaji: romaji(),
        now: Date.now(),
      });
    },
    summary: queue,
    startedCount() {
      return new Set(
        cards()
          .filter(
            (card) =>
              effectiveRecord(card, store.records, progress.records).reviews,
          )
          .map((card) => card.noteId),
      ).size;
    },
    action(name, value) {
      const card = current();
      if (name === "start" || name === "refresh") {
        screen = "study";
        next();
      } else if (name === "overview" || name === "manage") {
        screen = name;
        audio.stop();
      } else if (name === "audio" && card) audio.play(card.word, card.language);
      else if (name === "reveal" && card && !revealed) {
        answeredAt = Date.now();
        previews = previewRatings(
          effectiveRecord(card, store.records, progress.records),
          store.settings(card.language).retention,
          answeredAt,
          store.settings(card.language).weights,
        );
        revealed = true;
      } else if (
        name === "rate" &&
        card &&
        revealed &&
        previews?.[Number(value)]
      ) {
        store.rate(
          card,
          previews[Number(value)],
          Number(value),
          cards(),
          progress.records,
          answeredAt,
        );
        next();
      } else if ((name === "bury" || name === "suspend") && card) {
        store.hide(card, name, progress.records);
        next();
      } else if (
        name === "undo" &&
        cards().some((card) => card.id === store.undoCardId)
      ) {
        const id = store.undo();
        if (id && cards().some((item) => item.id === id)) {
          screen = "study";
          currentId = id;
          revealed = false;
          previews = null;
          audio.stop();
        }
      } else if (name === "reset-model") {
        const { weights, modelTrainedAt, ...settings } = store.settings(
          course().id,
        );
        store.setSettings(course().id, settings);
        this.reset();
        notify("已恢復預設 FSRS 參數；既有到期時間保留。");
      } else if (name === "restore") {
        const target = cards().find((item) => item.id === value);
        if (target) store.restoreCard(target, progress.records);
      }
    },
    key(key) {
      if (screen !== "study" || !current()) return false;
      if (key === " ") {
        this.action(revealed ? "rate" : "reveal", "3");
        return true;
      }
      if (revealed && ["1", "2", "3", "4"].includes(key)) {
        this.action("rate", key);
        return true;
      }
      return false;
    },
    configure(settings) {
      store.setSettings(course().id, {
        ...store.settings(course().id),
        ...settings,
      });
      this.reset();
      notify("每日複習設定已儲存。");
    },
    importModel(text) {
      const model = parseModel(text, course().id);
      store.setSettings(course().id, {
        ...store.settings(course().id),
        weights: model.weights,
        modelTrainedAt: model.trainedAt,
      });
      this.reset();
      notify("已套用個人參數，從下次評分開始使用；既有到期時間保留。");
    },
  };
}
