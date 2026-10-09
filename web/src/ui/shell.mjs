import { dueNow } from "../domain/learning.mjs";
import { $, $$ } from "./dom.mjs";
import { esc, unitLabel } from "./views/shared.mjs";
import { listView } from "./views/word-list.mjs";
import { practiceView } from "./views/practice.mjs";
import { courseSwitchView, noCoursesView } from "./views/courses.mjs";

export function renderCourseSwitch(courses) {
  $(".language-switch").innerHTML = courseSwitchView(courses);
}
export function showNoCourses() {
  renderCourseSwitch([]);
  $(".language-switch").hidden = true;
  $(".stats").hidden = true;
  $(".workspace").hidden = true;
  $("#restore").disabled = true;
  $("#sync-area").innerHTML = noCoursesView();
}

export function readControls() {
  return {
    query: $("#search").value,
    unit: $("#unit").value,
    status: $("#filter").value,
    limit: Number($("#limit").value),
    pageSize: Number($("#page-size").value),
    hideMeaning: $("#hide-meaning").checked,
  };
}

export function renderCourse(course, showRomaji) {
  $("#unit").innerHTML =
    '<option value="all">全部單元</option>' +
    course.units
      .map(
        (unit) =>
          `<option value="${esc(unit.id)}">${esc(unitLabel(unit))}</option>`,
      )
      .join("");
  $$("[data-lang]").forEach((button) => {
    const selected = button.dataset.lang === course.id;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected);
  });
  $(".toggle").style.visibility = (course.language || course.id) === "ja" ? "visible" : "hidden";
  $("#romaji").checked = showRomaji;
}

export function renderWorkspace(words, context) {
  const { course, records, mode, controls } = context;
  $("#total").textContent = course.words.length;
  $("#due").textContent = course.words.filter((word) =>
    dueNow(records[word.id] || {}),
  ).length;
  $("#learned").textContent = course.words.filter(
    (word) => records[word.id]?.reviews,
  ).length;
  $("#course-meta").textContent =
    `${course.units.length} 個單元 · ${course.words.length} 個字`;
  $("#result-count").textContent =
    `${words.length} 個單字${controls.unit === "all" ? " · 跨單元已去重" : ""}`;
  $("#list-options").hidden = mode !== "list";
  $("#practice-options").hidden = mode === "list" || mode === "review";
  $(".search").hidden = mode === "review";
  $("#filter").hidden = mode === "review";
  if (mode === "review") {
    $("#learned").textContent = context.reviewStarted;
    $("#result-count").textContent = "每日排程 · 依上方單元篩選";
    $("#due").textContent =
      context.reviewSummary.learningCount + context.reviewSummary.reviewCount;
  }
  $("#due").previousElementSibling.textContent =
    mode === "review" ? "現在待複習卡片" : "今天待複習";
  if ($("#due").nextElementSibling)
    $("#due").nextElementSibling.textContent =
      mode === "review" ? "目前單元與每日上限內" : "已練習且到期的單字";
  $$("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", button.dataset.mode === mode);
  });
  $("#content").innerHTML =
    mode === "review"
      ? context.reviewHtml
      : mode === "list"
        ? listView(words, { ...context, ...controls })
        : practiceView(words, context);
}

export function showDialog(html) {
  $("#detail-body").innerHTML = html;
  $("#detail").showModal();
}

export function showLoadError() {
  $("#content").innerHTML =
    '<p class="error">字庫尚未載入。請先執行 python build_web.py，再使用 python serve_web.py 開啟網站。</p>';
}
