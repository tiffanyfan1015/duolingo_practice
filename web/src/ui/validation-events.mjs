export function bindValidationEvents(element, actions) {
  element.addEventListener("submit", (event) => { if (event.target.id === "decision") { event.preventDefault(); actions.save(new FormData(event.target)); } });
  element.addEventListener("input", (event) => { if (event.target.closest("#decision")) actions.dirty(); });
  element.addEventListener("change", (event) => {
    const { id, value, files } = event.target;
    if (["language", "word", "candidate", "query"].includes(id)) actions.navigate(id, value);
    if (id === "import" && files[0]) actions.import(files[0]);
  });
  element.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "export") actions.export();
    if (button.id === "play") actions.play();
  });
}
