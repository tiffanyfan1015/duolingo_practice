export function bindAccountEvents(element, action) {
  element.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-account]");
    if (!form) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const input of form.querySelectorAll('input[type="password"]')) input.value = "";
    action(form.dataset.account, values);
  });
}
