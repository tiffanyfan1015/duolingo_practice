import { esc } from "./shared.mjs";
function courseSettingsView(user, disabled) {
  if (!user.connected) return "";
  const courses = (user.courses || []).filter((c) => c.available);
  const counts = new Map();
  return `<section><div class="course-settings-heading"><h2>啟用課程</h2><form data-account="refresh-courses"><button class="secondary" ${disabled}>更新清單</button></form></div>
    <p>勾選要練習的課程。取消勾選會保留原有紀錄。</p>
    ${user.courseError ? `<p role="status">${esc(user.courseError)}</p>` : ""}
    ${courses.length ? `<form data-account="save-courses"><input type="hidden" name="revision" value="${user.courseRevision}"><div class="course-options">${courses.map((c) => {
      const n = (counts.get(c.name) || 0) + 1; counts.set(c.name, n);
      const repeated = courses.filter((item) => item.name === c.name).length > 1;
      return `<label class="course-option"><input type="checkbox" name="courses" value="${esc(c.id)}" ${c.active ? "checked" : ""} ${disabled}><span>${esc(c.name)}${repeated ? ` ${n}` : ""}</span></label>`;
    }).join("")}</div><button ${disabled}>儲存課程</button></form>` : '<p>尚未取得語言課程，請更新清單。</p>'}</section>`;
}
function secretField(name, label, autocomplete, attributes = "") {
  return `<label for="secret-${name}">${label}</label><div class="secret-field"><input id="secret-${name}" name="${name}" type="password" data-secret autocomplete="${autocomplete}" ${attributes}><button type="button" class="secret-toggle" data-toggle-secret="secret-${name}" aria-controls="secret-${name}" aria-label="顯示${label}" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg></button></div>`;
}
export function accountView({ user, message, busy, ready, screen = "login" }) {
  const disabled = busy || !ready ? "disabled" : "";
  const notice = `<p class="notice" role="status" aria-live="polite">${esc(message)}</p>`;
  if (!user) {
    const registering = screen === "register";
    return `<h1>${registering ? "建立帳號" : "登入"}</h1>${notice}<section>
      ${registering ? '<p>帳號使用 3–32 個英數字、底線或連字號，密碼至少 12 字元。</p>' : ""}
      <form data-account="${registering ? "register" : "login"}"><label>帳號<input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_-]+"></label>
      ${secretField("password", "本站密碼", registering ? "new-password" : "current-password", 'required minlength="12" maxlength="128"')}
      ${registering ? secretField("invite", "邀請碼", "off", 'required maxlength="256"') : ""}
      <button type="submit" ${disabled}>${registering ? "建立帳號" : "登入"}</button></form>
      <p><a href="${registering ? "#login" : "#register"}">${registering ? "返回登入" : "第一次使用？建立帳號"}</a></p></section>`;
  }
  return `<h1>帳號與 Duolingo</h1><p>目前登入：<strong>${esc(user.username)}</strong></p>${notice}
    <section><h2>${user.connected ? "已連接 Duolingo" : "連接你的 Duolingo"}</h2>${user.duolingoId ? `<p>綁定的 Duolingo 帳號 ID：${esc(user.duolingoId)}</p>` : ""}
    <p>同步前，請先在 Duolingo 切換到要同步的課程。</p>
    <details><summary>如何取得連接憑證？</summary><ol><li>在電腦瀏覽器登入自己的 Duolingo。</li><li>按 F12，開啟 Application → Storage → Cookies → https://www.duolingo.com。</li><li>找到 jwt_token，複製 Value 並貼入下方。</li></ol><p>這是登入憑證，請只貼在此欄位。本站會在後端加密保存，用來讀取你的字庫；憑證過期後需要更新。這不是 Duolingo 官方授權登入。</p></details>
    <form data-account="connect">${secretField("token", "Duolingo jwt_token", "off", 'spellcheck="false" required maxlength="12000"')}<button type="submit" ${disabled}>${user.connected ? "更新連接憑證" : "連接 Duolingo"}</button></form>
    ${user.connected ? `<details><summary>解除連接</summary><p>解除後將停止使用目前憑證，字庫需重新連接並同步；此瀏覽器的複習紀錄會保留。</p><form data-account="disconnect"><button class="secondary" ${disabled}>確認解除連接</button></form></details>` : ""}</section>
    ${courseSettingsView(user, disabled)}
    <section>${user.connected ? '<a class="primary-link" href="/">前往練習 →</a>' : ""}<p>學習紀錄會同步至帳號；切換裝置前請確認已同步。</p><form data-account="logout"><button class="secondary" ${disabled}>登出</button></form></section>`;
}
