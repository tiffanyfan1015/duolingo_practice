import { $, $$ } from "./dom.mjs";

// Bind once. Rendering replaces content, not event handlers.
export function bindEvents(actions) {
  const markDraft=event=>{const form=event.target.closest(".review-settings");if(form)form.dataset.dirty="true";};
  document.addEventListener("input",markDraft);
  document.addEventListener("change",markDraft);
  document.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-model-import]")) return;
    try {
      const file = event.target.files[0];
      if (file) await actions.importModel(file);
    } finally {
      event.target.value = "";
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    const courseButton = target.closest("[data-lang]");
    if (courseButton) {
      $("#search").value = "";
      actions.changeLanguage(courseButton.dataset.lang);
      return;
    }
    const review = target.closest("[data-review-action]");
    if (review) {
      actions.reviewAction(review.dataset.reviewAction, review.dataset.value);
      return;
    }
    const audio = target.closest("[data-audio]");
    const star = target.closest("[data-star]");
    const detail = target.closest("[data-detail]");
    const grade = target.closest("[data-grade]");
    if (target.closest("[data-dictionary-retry]")) actions.retryDictionary();
    else if (audio) actions.play(audio.dataset.audio);
    else if (star) actions.toggleStar(star.dataset.star);
    else if (detail) actions.showDetail(detail.dataset.detail);
    else if (grade) actions.grade(grade.dataset.grade === "true");
    else if (target.closest("#start")) actions.start();
    else if (target.closest("#restart")) actions.reset();
    else if (target.closest("#reveal, #skip")) actions.reveal();
    else if (target.closest("#prev")) actions.changePage(-1);
    else if (target.closest("#next")) actions.changePage(1);
    else if (target.closest("#save-note")) actions.saveNote($("#note").value);
    if (target.classList.contains("concealed"))
      target.classList.remove("concealed");
  });
  document.addEventListener("submit", (event) => {
    if (event.target.matches(".review-settings")) {
      event.preventDefault();
      delete event.target.dataset.dirty;
      const data = new FormData(event.target);
      actions.reviewSettings({
        newLimit: Number(data.get("newLimit")),
        reviewLimit: Number(data.get("reviewLimit")),
        retention: Number(data.get("retention")),
        templates: data.getAll("templates"),
        burySiblings: data.has("burySiblings"),
      });
      return;
    }
    if (!event.target.matches(".answer-form")) return;
    event.preventDefault();
    const answer = $("#answer").value.trim();
    if (answer) actions.reveal(answer);
  });
  document.addEventListener("keydown", (event) => {
    if (
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.target.closest(
        'input, textarea, select, [contenteditable="true"]',
      ) &&
      !document.querySelector("dialog[open]") &&
      actions.reviewKey(event.key)
    ) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && event.target.classList.contains("concealed")) {
      event.target.classList.remove("concealed");
    }
  });
  $$("[data-mode]").forEach((button) => {
    button.onclick = () => actions.changeMode(button.dataset.mode);
  });
  ["unit", "filter", "limit"].forEach((id) => {
    $("#" + id).onchange = actions.reset;
  });
  $("#search").oninput = actions.reset;
  $("#hide-meaning").onchange = actions.render;
  $("#page-size").onchange = actions.resetPage;
  $("#romaji").onchange = () => actions.setRomaji($("#romaji").checked);
  $("#home").onclick = () => actions.changeMode("list");
  $(".close").onclick = () => $("#detail").close();
  $("#detail").addEventListener("click", (event) => {
    if (event.target === $("#detail")) $("#detail").close();
  });
  $("#about").onclick = actions.about;
  $("#backup").onclick = actions.backup;
  $("#restore").onchange = async (event) => {
    try {
      if (event.target.files[0]) await actions.restore(event.target.files[0]);
    } finally {
      event.target.value = "";
    }
  };
}
export function bindEmptyEvents(actions) {
  $("#backup").onclick = actions.backup;
  $("#about").onclick = actions.about;
  $(".close").onclick = () => $("#detail").close();
}
