import { esc } from "./shared.mjs";
export function courseSwitchView(courses) {
  const counts = new Map();
  return courses.map((c) => {
    const n = (counts.get(c.name) || 0) + 1; counts.set(c.name,n);
    const repeated = courses.filter((item) => item.name === c.name).length > 1;
    return `<button data-lang="${esc(c.id)}">${esc(c.name)}${repeated ? ` ${n}` : ""}</button>`;
  }).join("");
}
export const noCoursesView = () => '<div class="empty"><p>尚未啟用課程</p><a class="account-link" href="/account">設定啟用課程</a></div>';
