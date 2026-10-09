import { esc } from "./shared.mjs";
export function accountView({ user, message, busy, ready }) {
  const disabled = busy || !ready ? "disabled" : "";
  const notice = `<p class="notice" role="status" aria-live="polite">${esc(message)}</p>`;
  if (!user) return `<h1>你的字庫，你的練習節奏。</h1><p>登入詞間，再連接自己的 Duolingo 帳號。</p>${notice}
    <section><h2>登入</h2><form data-account="login"><label>帳號<input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_-]+"></label><label>詞間密碼<input name="password" type="password" autocomplete="current-password" required minlength="12" maxlength="128"></label><button ${disabled}>登入</button></form></section>
    <section><h2>第一次使用？建立帳號</h2><p>帳號使用 3–32 個英數字、底線或連字號，密碼至少 12 字元。請使用詞間專用密碼。</p><form data-account="register"><label>帳號<input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_-]+"></label><label>詞間密碼<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label><label>邀請碼<input name="invite" type="password" autocomplete="off" required maxlength="256"></label><button ${disabled}>建立帳號</button></form></section>`;
  return `<h1>帳號與 Duolingo</h1><p>目前登入：<strong>${esc(user.username)}</strong></p>${notice}
    <section><h2>${user.connected ? "已連接 Duolingo" : "連接你的 Duolingo"}</h2>${user.duolingoId ? `<p>綁定的 Duolingo 帳號 ID：${esc(user.duolingoId)}</p>` : ""}
    <p>每個詞間帳號綁定一個 Duolingo 帳號。先在 Duolingo 選擇中文教學的德文或日文課程，再回到練習室同步。</p>
    <details><summary>如何取得連接憑證？</summary><ol><li>在電腦瀏覽器登入自己的 Duolingo。</li><li>按 F12，開啟 Application → Storage → Cookies → https://www.duolingo.com。</li><li>找到 jwt_token，複製 Value 並貼入下方。</li></ol><p>這是登入憑證，請只貼在此欄位。詞間會在後端加密保存，用來讀取你的字庫；憑證過期後需要更新。這不是 Duolingo 官方授權登入。</p></details>
    <form data-account="connect"><label>Duolingo jwt_token<input name="token" type="password" autocomplete="off" spellcheck="false" required maxlength="12000"></label><button ${disabled}>${user.connected ? "更新連接憑證" : "連接 Duolingo"}</button></form>
    ${user.connected ? `<details><summary>解除連接</summary><p>解除後將停止使用目前憑證，字庫需重新連接並同步；此瀏覽器的複習紀錄會保留。</p><form data-account="disconnect"><button class="secondary" ${disabled}>確認解除連接</button></form></details>` : ""}</section>
    <section><a class="primary-link" href="/">前往我的練習室 →</a><p>複習紀錄按詞間帳號保存在此瀏覽器，換裝置請使用備份與匯入。既有單人版紀錄可透過原備份匯入。</p><form data-account="logout"><button class="secondary" ${disabled}>登出</button></form></section>`;
}
