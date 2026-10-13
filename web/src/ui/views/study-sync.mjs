import { esc } from "./shared.mjs";
function conflictText(key,value) {
  const [kind,,field]=JSON.parse(key);
  if(value===undefined)return "已移除／恢復預設";
  if(kind==="card" || kind==="practice")return `已複習 ${value.reviews || 0} 次；${value.suspended ? "已暫停" : value.due ? "下次複習："+new Date(value.due).toLocaleString("zh-TW") : "尚未安排複習"}`;
  if(kind==="model")return "個人參數，訓練時間："+(value.modelTrainedAt || "未提供");
  if(kind==="log")return `${new Date(value.at).toLocaleString("zh-TW")} · ${["","重來","困難","良好","簡單"][value.rating]}`;
  if(typeof value==="boolean")return value ? "開啟" : "關閉";
  if(field==="templates")return value.map(v=>({recognition:"辨識",recall:"回想",listening:"聽力"})[v]).join("、");
  return String(value);
}
function conflictLabel(key) {
  const [kind,id,field]=JSON.parse(key);
  const label=({word:field==="note" ? "筆記" : "收藏",practice:"自由練習進度",card:"每日複習狀態",log:"評分紀錄",romaji:"羅馬拼音",model:"個人模型",setting:({newLimit:"每日新卡",reviewLimit:"每日複習上限",retention:"目標記憶率",templates:"卡片方向",burySiblings:"同字卡片延後"})[field]})[kind];
  return `${label}${id ? " · "+id : ""}`;
}
export function studySyncView({state,message,conflicts=[]}) {
  const label=({synced:"學習紀錄已同步",syncing:"正在同步學習紀錄…",pending:"學習紀錄待同步",error:"學習紀錄尚未同步",conflict:"兩台裝置有不同修改",auth:"請重新登入以同步"})[state];
  return `<div class="study-sync-status" role="status" data-study-state="${esc(state)}"><span>${esc(label)}</span>${message ? `<p>${esc(message)}</p>` : ""}
    ${state==="conflict" ? `<p>以下衝突尚未覆蓋，請選擇要保留的版本；其他修改會合併。</p><details><summary>查看 ${conflicts.length} 個衝突</summary>${conflicts.map(c=>`<div class="study-conflict"><strong>${esc(conflictLabel(c.key))}</strong><p>此裝置：${esc(conflictText(c.key,c.local))}</p><p>雲端：${esc(conflictText(c.key,c.remote))}</p></div>`).join("")}</details><button class="secondary" data-study-sync="local">衝突保留此裝置版本</button><button class="secondary" data-study-sync="remote">衝突使用雲端版本</button>` : state==="auth" ? '<a href="/account">前往登入</a>' : `<button class="secondary" data-study-sync="" ${state==="syncing" ? "disabled" : ""}>${state==="synced" ? "立即同步" : "重試同步"}</button>`}</div>`;
}
