import { esc } from "./shared.mjs";
export function syncView({ courseName, busy, job, message, expanded = true }) {
  const phase = {
    words: "讀取單字",
    units: "核對單元",
    verify: "確認進度一致",
    commit: "更新雲端字庫",
    done: "同步完成",
  };
  return `<details class="sync-disclosure" ${expanded ? "open" : ""}><summary>同步 Duolingo${busy ? " · 同步中…" : ""}</summary><div class="sync-panel"><div><p>先在 Duolingo 切換到${esc(courseName)}課程；同步時保持此頁開啟。</p></div>
  <div class="sync-actions"><button class="primary" data-sync="continue" ${busy ? "disabled" : ""}>${busy ? "同步中…" : job && job.phase !== "done" ? "繼續同步" : "同步目前語言"}</button>
  ${job ? `<button data-sync="restart" ${busy ? "disabled" : ""}>完整重新同步</button>` : ""}</div>
  <p role="status">${job ? `${phase[job.phase] || ""} · ${job.count} 個字 · 已核對 ${job.mapped}/${job.totalSkills} 個技能${job.reused ? `（沿用 ${job.reused} 個）` : ""}` : ""}${message ? `<br>${esc(message)}` : ""}</p>
  </div></details>`;
}
