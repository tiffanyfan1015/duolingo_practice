export function bindAccountEvents(element, action) {
  element.addEventListener("click", (event) => {
    const button = event.target.closest("[data-toggle-secret]");
    if (!button) return;
    const input = element.querySelector(`#${button.dataset.toggleSecret}`);
    if (!input) return;
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", button.getAttribute("aria-label").replace(visible ? "顯示" : "隱藏", visible ? "隱藏" : "顯示"));
  });
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
    for (const input of form.querySelectorAll('[data-secret], input[type="password"]')) input.value = "";
    action(form.dataset.account, values);
  });
}
