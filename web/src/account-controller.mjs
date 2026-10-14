import { createAccountClient } from "./services/account-client.mjs";
import { accountView } from "./ui/views/account.mjs";
import { bindAccountEvents } from "./ui/account-events.mjs";
export function mountAccount(element, client = createAccountClient()) {
  const screen = () => location.hash === "#register" ? "register" : "login";
  const state = { user: null, message: "", busy: false, ready: false, screen: screen() };
  const render = () => { element.innerHTML = accountView(state); };
  window.addEventListener("hashchange", () => {
    state.screen = screen();
    state.message = "";
    render();
  });
  bindAccountEvents(element, async (action, values) => {
    if (state.busy || !state.ready) return;
    state.busy = true;
    state.message = action === "connect" ? "正在確認 Duolingo 連線…" : "正在處理…";
    render();
    try {
      state.user = await client.action(action, values);
      if (action === "login" && state.user?.connected) {
        location.assign("/");
        return;
      }
      if (action === "logout") {
        history.replaceState(null, "", location.pathname);
        state.screen = "login";
      }
      state.message = ({ login: "登入成功。", register: "帳號已建立，請連接 Duolingo。", connect: "已連接，可前往練習室同步字庫。", disconnect: "已解除連接。", logout: "已登出。", "refresh-courses": "課程清單已更新。", "save-courses": "啟用課程已儲存。" })[action];
    } catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  });
  render();
  client.me().then((user) => { state.user = user; state.ready = true; }).catch((error) => { state.message = error.message; }).finally(render);
}
