import { mountSync } from "./sync-controller.mjs";
import { loadCatalog } from "./services/catalog.mjs";
import {
  createSession,
  revealAnswer,
  advanceSession,
} from "./domain/session.mjs";
import { filterWords } from "./domain/vocabulary.mjs";
import { downloadBackup, readBackup } from "./services/browser-files.mjs";
import { bindEvents, bindEmptyEvents } from "./ui/events.mjs";
import {
  readControls,
  renderCourse,
  renderWorkspace,
  showDialog,
  renderCourseSwitch,
  showNoCourses,
} from "./ui/shell.mjs";
import { detailView } from "./ui/views/word-detail.mjs";
import { aboutView } from "./ui/views/about.mjs";
import { createReviewController } from "./review-controller.mjs";
import {
  exportCollection,
  importCollection,
} from "./services/collection-backup.mjs";

export function mountApplication({ catalog, progress, review, audio, notify }) {
  const accountLink = document.querySelector("#account-link");
  if (accountLink) accountLink.hidden = !catalog.user;
  renderCourseSwitch(catalog.courses);
  if (!catalog.courses.length) {
    showNoCourses();
    bindEmptyEvents({ backup: () => downloadBackup(exportCollection(progress, review)), about: () => showDialog(aboutView()) });
    return;
  }
  const state = {
    language: catalog.courses[0].id,
    mode: "list",
    page: 0,
    session: null,
    detailId: null,
  };
  const course = () =>
    catalog.courses.find((item) => item.id === state.language);
  const word = (id) => course().words.find((item) => item.id === id);
  const filtered = () =>
    filterWords(course().words, progress.records, readControls());
  const daily = createReviewController({
    store: review,
    progress,
    audio,
    course,
    unit: () => readControls().unit,
    romaji: () => progress.romaji,
    notify,
  });

  const sync = mountSync({
    element: document.querySelector("#sync-area"),
    language: () => state.language,
    courseName: () => course().name,
    userId: catalog.user?.id,
    onComplete: async () => {
      const updated = await loadCatalog(fetch, catalog.user?.id);
      catalog.courses = updated.courses;
      if (!catalog.courses.some((c) => c.id === state.language)) {
        location.reload();
        return;
      }
      renderCourseSwitch(catalog.courses);
      daily.invalidate();
      renderCourse(course(), progress.romaji);
      reset();
    },
  });

  function render() {
    const words = filtered();
    const controls = readControls();
    const size = controls.pageSize || words.length || 1;
    state.page = Math.max(
      0,
      Math.min(state.page, Math.ceil(words.length / size) - 1),
    );
    renderWorkspace(words, {
      ...state,
      language: course().language || course().id,
      course: course(),
      records: progress.records,
      showRomaji: progress.romaji,
      controls,
      reviewHtml: state.mode === "review" ? daily.view() : "",
      reviewSummary: state.mode === "review" ? daily.summary() : null,
      reviewStarted: daily.startedCount(),
    });
  }

  function reset() {
    audio.stop();
    state.session = null;
    daily.reset();
    state.page = 0;
    render();
  }

  bindEvents({
    reviewAction(name, value) {
      daily.action(name, value);
      render();
    },
    reviewSettings(settings) {
      daily.configure(settings);
      render();
    },
    async importModel(file) {
      try {
        if (file.size > 100000) throw new Error("參數檔過大。");
        daily.importModel(await file.text());
        render();
      } catch (error) {
        notify(error.message);
      }
    },
    reviewKey(key) {
      if (state.mode !== "review") return false;
      const handled = daily.key(key);
      if (handled) render();
      return handled;
    },
    render,
    reset,
    resetPage() {
      state.page = 0;
      render();
    },
    changePage(offset) {
      state.page += offset;
      render();
    },
    changeLanguage(language) {
      if (sync.busy) {
        notify("請等目前語言同步完成，再切換語言。");
        return;
      }
      state.language = language;
      sync.refresh();
      renderCourse(course(), progress.romaji);
      reset();
    },
    changeMode(mode) {
      state.mode = mode;
      reset();
    },
    start() {
      state.session = createSession(filtered(), readControls().limit);
      render();
    },
    reveal(answer = "") {
      if (!state.session || state.session.revealed) return;
      state.session = revealAnswer(state.session, answer, course().language || state.language);
      render();
    },
    grade(good) {
      const session = state.session;
      if (!session?.revealed || !session.words[session.index]) return;
      progress.grade(session.words[session.index].id, good);
      state.session = advanceSession(session, good);
      audio.stop();
      render();
    },
    play(id) {
      const selected = word(id);
      if (selected) audio.play(selected, course().language || state.language);
    },
    toggleStar(id) {
      progress.toggleStar(id);
      render();
    },
    setRomaji(value) {
      progress.setRomaji(value);
      render();
    },
    showDetail(id) {
      state.detailId = id;
      showDialog(
        detailView(word(id), {
          record: progress.get(id),
          language: course().language || state.language,
          showRomaji: progress.romaji,
          course: course(),
        }),
      );
    },
    saveNote(note) {
      progress.setNote(state.detailId, note);
      notify("筆記已儲存");
    },
    about() {
      showDialog(aboutView());
    },
    backup() {
      downloadBackup(exportCollection(progress, review));
    },
    async restore(file) {
      try {
        const count = importCollection(
          await readBackup(file),
          catalog,
          progress,
          review,
        );
        renderCourse(course(), progress.romaji);
        reset();
        notify(`已匯入 ${count} 個字的紀錄`);
      } catch {
        notify("無法匯入，請選擇詞間匯出的有效備份 JSON。");
      }
    },
  });
  renderCourse(course(), progress.romaji);
  render();
  sync.refresh();
}
