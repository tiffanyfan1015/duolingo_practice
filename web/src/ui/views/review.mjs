import { esc, reading } from "./shared.mjs";
import { CARD_TYPES, effectiveRecord } from "../../domain/cards.mjs";

const button = (action, text, extra = "") =>
  `<button data-review-action="${action}" ${extra}>${text}</button>`;
const dateLabel = (timestamp) =>
  new Date(timestamp).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function interval(due, now) {
  const minutes = Math.max(1, Math.round((due - now) / 60000));
  if (minutes < 60) return `${minutes} 分鐘`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小時`;
  return `${Math.round(minutes / 1440)} 天`;
}

function settingsView(settings) {
  return `<details class="review-settings-panel"><summary>調整卡片與每日份量</summary>
  <form class="review-settings"><div class="review-fields">
    <label>每日新卡<input name="newLimit" type="number" min="0" max="100" value="${settings.newLimit}" required></label>
    <label>每日複習卡上限<input name="reviewLimit" type="number" min="0" max="1000" value="${settings.reviewLimit}" required></label>
    <label>目標記憶率<select name="retention">${[0.8, 0.85, 0.9, 0.95, 0.97].map((n) => `<option value="${n}" ${n === settings.retention ? "selected" : ""}>${Math.round(n * 100)}%</option>`).join("")}</select></label>
  </div><fieldset><legend>啟用的卡片方向</legend>${Object.entries(CARD_TYPES)
    .map(
      ([type, info]) =>
        `<label><input name="templates" type="checkbox" value="${type}" ${settings.templates.includes(type) ? "checked" : ""}> ${esc(info.short)}</label>`,
    )
    .join("")}</fieldset>
  <label class="review-check"><input type="checkbox" name="burySiblings" ${settings.burySiblings ? "checked" : ""}> 同一個字的其他卡片延至明天，避免答案互相提示</label>
  <p class="hint">份量以目前語言計算，所有單元共用。學習中的短間隔卡不受複習上限限制。目標記憶率越高，通常需要越頻繁複習。</p>
  <button class="primary" type="submit">儲存設定</button></form></details>
  <details class="review-model-panel"><summary>個人 FSRS 模型</summary>
  <p>${settings.weights ? "使用個人最佳化參數" : "使用預設參數"}</p>
  <p class="hint">先匯出學習備份，在電腦執行最佳化工具，再匯入通過驗證的參數檔。德文與日文分開訓練；此操作不會清除紀錄或立刻重排卡片。</p>
  <label>匯入目前語言的參數檔<input type="file" data-model-import accept=".json,application/json"></label>
  ${button("reset-model", "恢復預設參數", settings.weights ? "" : "disabled")}</details>`;
}

function overview(context) {
  const { queue: q, settings } = context;
  return `<div class="review-intro"><div class="eyebrow">A DAILY RHYTHM</div><h3>今天，讓記憶再深一點。</h3><p>先回想，再翻面。每張卡片都有自己的複習時間。</p></div>
  <div class="review-counts"><div><strong>${q.newCount}</strong><span>新卡</span></div><div><strong>${q.learningCount}</strong><span>學習中到期</span></div><div><strong>${q.reviewCount}</strong><span>待複習</span></div></div>
  <div class="review-start">${button("start", q.queue.length ? "開始今日複習 →" : "檢查待複習卡片", 'class="primary"')}
  <p class="hint">今天已回答 ${q.todayCount} 次 · 新學 ${q.introducedCount} 張 · 按過「重來」${q.againCount} 次</p>
  ${waiting(q)}</div>${settingsView(settings)}
  <p class="hint">可在上方選擇單元牌組。辨識、回想、聽力三種卡片分開排程；單元重疊的同一張卡只計一次。</p>`;
}

function waiting(q) {
  return `${q.nextLearningDue ? `<p class="review-wait">下一張學習卡：${esc(dateLabel(q.nextLearningDue))}。到時間後按「重新檢查」。</p>` : ""}
  ${q.limitedReviewCount ? `<p class="hint">另有 ${q.limitedReviewCount} 張到期卡受每日上限限制。</p>` : ""}
  ${q.totalNew > q.newCount ? `<p class="hint">還有 ${q.totalNew - q.newCount} 張新卡留待之後學習。</p>` : ""}`;
}

function study(context) {
  const {
    card,
    revealed,
    queue: q,
    previews,
    answeredAt,
    showRomaji,
    legacyWords,
  } = context;
  if (!card)
    return `<div class="review-empty"><h3>目前沒有可複習的卡片。</h3><p>這個單元現在的份量完成了，可以休息一下。</p>${waiting(q)}${button("refresh", "重新檢查", 'class="primary"')}</div>`;
  const word = card.word;
  const meanings = esc(word.meanings.join("、"));
  let front =
    card.type === "recognition"
      ? `<h3>${esc(word.text)}</h3>${reading(word, card.language, showRomaji)}`
      : card.type === "recall"
        ? `<h3 class="translation">${meanings}</h3><p class="hint">在心裡說出單字，或寫在紙上。</p>`
        : `${button("audio", "♫", 'class="listen-button" aria-label="播放聽力題目"')}<p class="hint">聽音，回想單字與意思。</p>`;
  const labels = [
    ["重來", "忘記了"],
    ["困難", "想起來，但費力"],
    ["良好", "正常想起來"],
    ["簡單", "立刻想起來"],
  ];
  return `<div class="review-session-meta"><span>${esc(CARD_TYPES[card.type].name)} · ${esc(CARD_TYPES[card.type].short)}</span><span>新 ${q.newCount} / 學 ${q.learningCount} / 複 ${q.reviewCount}</span></div>
  <article class="review-card">${front}
  ${
    revealed
      ? `<div class="review-answer"><h4>${esc(word.text)}</h4>${reading(word, card.language, showRomaji)}<p>${meanings}</p>${button("audio", "♫ 播放發音")}${legacyWords[word.id]?.note ? `<p class="review-note">${esc(legacyWords[word.id].note)}</p>` : ""}</div>
    <div class="review-ratings">${labels.map(([title, hint], index) => `<button data-review-action="rate" data-value="${index + 1}" class="rating-${index + 1}" title="${esc(dateLabel(previews[index + 1].memory.due))}"><span>${index + 1} · ${title}</span><strong>${interval(previews[index + 1].memory.due, answeredAt)}</strong><small>${hint}</small></button>`).join("")}</div>
    <p class="hint">忘記答案請選「重來」；「困難」表示仍然答對。依實際回想感受評分。</p>`
      : `${button("reveal", "顯示答案", 'class="primary"')}<p class="hint">空白鍵翻面 · 翻面後用 1–4 評分，空白鍵選「良好」</p>`
  }
  </article><div class="review-card-actions">${button("bury", "延至明天")}${button("suspend", "暫停此卡")}</div>`;
}

function manage(context) {
  const now = context.now;
  const hidden = context.cards.filter((card) => {
    const r = effectiveRecord(card, context.records, context.legacyWords);
    return r.suspended || r.buriedUntil > now;
  });
  return `<div class="review-manage"><h3>暫停與延後的卡片</h3><p class="hint">暫停的卡片需手動恢復；延後的卡片會在明天自動回到排程。這裡列出目前語言的所有卡片方向。</p>
  ${
    hidden.length
      ? hidden
          .map((card) => {
            const r = effectiveRecord(
              card,
              context.records,
              context.legacyWords,
            );
            return `<div class="review-hidden-row"><div><strong>${esc(card.word.text)}</strong><small>${esc(CARD_TYPES[card.type].short)} · ${r.suspended ? "已暫停" : "明天恢復"}</small></div>${button("restore", "恢復", `data-value="${esc(card.id)}"`)}</div>`;
          })
          .join("")
      : '<p class="empty">目前沒有暫停或延後的卡片。</p>'
  }</div>`;
}

export function reviewView(context) {
  return `<section class="daily-review"><div class="review-nav">${button("overview", "每日總覽")}${button("manage", "管理卡片")}${button("undo", "↶ 撤銷上一步", context.canUndo ? "" : "disabled")}</div>
  ${context.screen === "overview" ? overview(context) : context.screen === "manage" ? manage(context) : study(context)}</section>`;
}
