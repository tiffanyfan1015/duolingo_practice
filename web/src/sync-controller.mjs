import { createSyncClient } from "./services/sync-client.mjs";
import { syncView } from "./ui/views/sync.mjs";
export function mountSync({
  element,
  language,
  onComplete,
  userId = null,
  client = createSyncClient(fetch, userId),
}) {
  let busy = false,
    job = null,
    message = "",
    generation = 0;
  const render = () => {
    element.innerHTML = syncView({ language: language(), busy, job, message });
  };
  async function refresh() {
    if (busy) return;
    const ticket = ++generation;
    job = null;
    message = "";
    render();
    try {
      const result = await client.status(language());
      if (ticket !== generation) return;
      job = result.job;
      message = result.message || "";
      render();
    } catch (error) {
      if (ticket === generation) {
        message = error.message;
        render();
      }
    }
  }
  element.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-sync]");
    if (!button || busy) return;
    const selected = language();
    ++generation;
    busy = true;
    message = "";
    render();
    try {
      job = (await client.start(selected, button.dataset.sync === "restart"))
        .job;
      render();
      while (job.phase !== "done") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        job = (await client.step(selected, job.id)).job;
        render();
      }
      message = "已更新字庫，正在重新載入。";
      render();
      await onComplete();
      message = "同步完成，字庫已更新。";
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
      render();
    }
  });
  render();
  return {
    refresh,
    get busy() {
      return busy;
    },
  };
}
