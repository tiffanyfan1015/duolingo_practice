import { createSyncClient } from "./services/sync-client.mjs";
import { syncView } from "./ui/views/sync.mjs";
export function mountSync({
  element,
  language,
  courseName = language,
  hasWords = () => false,
  onComplete,
  userId = null,
  client = createSyncClient(fetch, userId),
}) {
  let busy = false,
    job = null,
    message = "",
    generation = 0,
    expanded = !hasWords();
  const render = () => {
    element.innerHTML = syncView({ courseName: courseName(), busy, job, message, expanded });
  };
  element.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".sync-disclosure") && element.contains(event.target)) expanded = event.target.open;
  }, true);
  async function refresh() {
    if (busy) return;
    const ticket = ++generation;
    job = null;
    message = "";
    expanded = !hasWords();
    render();
    try {
      const result = await client.status(language());
      if (ticket !== generation) return;
      job = result.job;
      message = result.message || "";
      expanded = expanded || !!message || !!(job && job.phase !== "done");
      render();
    } catch (error) {
      if (ticket === generation) {
        message = error.message;
        expanded = true;
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
    expanded = true;
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
