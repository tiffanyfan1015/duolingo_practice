import { esc } from "./shared.mjs";
export function syncView({ language, busy, job, message }) {
  const phase = {
    words: "讀取單字",
    units: "核對單元",
    verify: "確認進度一致",
    commit: "更新雲端字庫",
    done: "同步完成",
  };
  return `<div class="sync-panel"><div><strong>同步 Duolingo</strong><p>先在 Duolingo 選擇${language === "de" ? "德文" : "日文"}課程，再同步。同步時請保持此頁開啟；中斷後可繼續。</p></div>
  <div class="sync-actions"><button class="primary" data-sync="continue" ${busy ? "disabled" : ""}>${busy ? "同步中…" : job && job.phase !== "done" ? "繼續同步" : "同步目前語言"}</button>
  ${job && job.phase !== "done" ? `<button data-sync="restart" ${busy ? "disabled" : ""}>重新開始</button>` : ""}</div>
  <p role="status">${job ? `${phase[job.phase] || ""} · ${job.count} 個字 · 已核對 ${job.mapped}/${job.totalSkills} 個技能` : ""}${message ? `<br>${esc(message)}` : ""}</p>
  <small>完整成功後才替換字庫。收藏、筆記與複習紀錄保留。新字使用 API 原始釋義；日文讀音尚未補齊時不猜測。</small></div>`;
}
