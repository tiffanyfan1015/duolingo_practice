export function bindAccountEvents(element, action) {
  element.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-account]");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const values = Object.fromEntries(data);
    if (form.dataset.account === "save-courses") {
      values.courses = data.getAll("courses");
      values.revision = Number(data.get("revision"));
    }
    for (const input of form.querySelectorAll('input[type="password"]')) input.value = "";
    action(form.dataset.account, values);
  });
}
