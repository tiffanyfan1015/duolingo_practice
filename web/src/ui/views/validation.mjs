import { esc } from "./shared.mjs";
import { chineseTerms, morphologyLabel } from "../../domain/morphology-labels.mjs";
import { candidateKey, emptyDecision, missingP0, posLabels, reviewStates, senseExamples } from "../../domain/validation.mjs";
const terms = chineseTerms;
const safeLink = (url, label) => /^https?:\/\//i.test(url || "") ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);
const field = (label, name, value, placeholder = "") => `<label>${esc(label)}<textarea name="${esc(name)}" maxlength="10000" rows="2" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
function formsView(forms, tables = []) {
  if (!forms.length && !tables.length) return '<p class="muted">字典尚未提供詞形資料。</p>';
  const cards = `<div class="forms">${forms.map((f) => `<div><strong>${esc([f.article, f.form].filter(Boolean).join(" "))}</strong><span>${esc(morphologyLabel(f))}</span>${f.source?.startsWith("rule:") ? '<small>規則產生 · 待核對</small>' : '<small>字典資料</small>'}</div>`).join("")}</div>`;
  const safeSpan = x => Number.isInteger(x) && x > 0 && x <= 30 ? x : 1;
  return cards + tables.map(t => `<div class="table-scroll"><table><caption>${esc(t.label)}</caption>${t.rows.map(row => `<tr>${row.map(c => {const tag = c.header ? "th" : "td"; return `<${tag} colspan="${safeSpan(c.colspan)}" rowspan="${safeSpan(c.rowspan)}">${esc(c.text)}${c.person ? `<br><small>${esc(c.person)}</small>` : ""}</${tag}>`;}).join("")}</tr>`).join("")}</table></div>`).join("");
}
function senseView(sense, index, edit, candidate) {
  const examples = senseExamples(sense);
  return `<section class="sense"><h3><label class="check"><input type="checkbox" name="s${index}-selected" ${edit.selected ? "checked" : ""}>義項 ${index + 1} <small>用於這個 Duolingo 單字</small></label></h3>
    <details ${index === 0 || edit.selected ? "open" : ""}><summary>字典釋義與例句</summary>
    <p class="badge">${esc(terms(posLabels(candidate, sense))) || "詞性待補"}</p>
    <p class="source-meaning">${esc((sense.glosses || []).join("；")) || "原文釋義待補"}</p>
    ${sense.tags?.length ? `<p>${esc(terms(sense.tags))}</p>` : ""}
    ${sense.restrictedSpellings?.length ? `<p>適用表記：${esc(sense.restrictedSpellings.join("、"))}</p>` : ""}
    ${sense.restrictedReadings?.length ? `<p>適用讀音：${esc(sense.restrictedReadings.join("、"))}</p>` : ""}
    ${sense.usage || candidate.usage ? `<p>使用情境：${esc(sense.usage || candidate.usage)}</p>` : ""}
    ${sense.grammar || candidate.grammar ? `<p>語法／用法：${esc(sense.grammar || candidate.grammar)}</p>` : ""}
    <details><summary>詞形變化</summary>${formsView(sense.forms || candidate.forms || [], candidate.formTables || [])}</details>
    <details open><summary>來源例句（${examples.length}）</summary>${examples.map(e => `<div class="example"><p>${esc(e.text)}</p><p class="muted">${esc(e.translation || "字典未提供中文譯文")}</p><small>來源：${esc(e.source || candidate.source?.name || "待確認")}</small></div>`).join("") || '<p class="muted">字典尚未提供例句。</p>'}</details>
    ${[edit.zh, edit.usage, edit.grammar, edit.example, edit.exampleZh, edit.exampleSource].some(Boolean) ? `<details><summary>先前補充（保留）</summary>${[edit.zh, edit.usage, edit.grammar, edit.example, edit.exampleZh, edit.exampleSource].filter(Boolean).map(t => `<p>${esc(t)}</p>`).join("")}</details>` : ""}
  </details></section>`;
}
export function validationView(report, state, decisions) {
  const words = report.words.filter((w) => (!state.language || w.language === state.language) && (!state.query || `${w.text} ${w.duolingoMeanings.join(" ")}`.toLowerCase().includes(state.query.toLowerCase())));
  const word = words.find((w) => w.id === state.wordId) || words[0];
  const reviewed = report.words.filter((w) => w.candidates.some((c) => decisions[candidateKey(w, c)]?.status && decisions[candidateKey(w, c)].status !== "pending")).length;
  const navigation = `<div class="toolbar"><label>語言<select id="language"><option value="">全部</option>${[...new Set(report.words.map((w) => w.language))].map((lang) => `<option value="${esc(lang)}" ${state.language === lang ? "selected" : ""}>${esc(({ja:"日文",de:"德文"})[lang] || lang)}</option>`).join("")}</select></label><label>搜尋<input id="query" value="${esc(state.query)}" placeholder="單字或 Duolingo 釋義"></label><label class="word-picker">單字<select id="word">${words.map((w) => `<option value="${esc(w.id)}" ${w === word ? "selected" : ""}>${esc(w.text)}${!w.candidates.length ? " · 無候選" : ""}${w.candidates.some((c) => decisions[candidateKey(w,c)]?.status === "accepted") ? " · 已採用配對" : ""}</option>`).join("")}</select></label></div>`;
  let content = '<p class="empty">沒有符合的單字。</p>';
  if (word) {
    const index = Math.min(state.candidateIndex, Math.max(0, word.candidates.length - 1));
    const candidate = word.candidates[index];
    content = `<article data-word="${esc(word.id)}"><div class="word-heading"><div><small>${esc(({ja:"日文",de:"德文"})[word.language] || word.language)}</small><h2>${esc(word.text)}</h2><p>Duolingo：${esc(word.duolingoMeanings.join("、"))}</p></div><button type="button" id="play">♫ 播放發音</button></div><p class="muted">發音使用 Duolingo 音訊；無法播放時嘗試裝置語音。${word.reading ? `原單字讀音：${esc(word.reading)}（自動轉換，待核對）。` : ""}</p>`;
    if (!candidate) content += `<div class="empty">${esc(word.lookupError || "尚無字典候選，先保留 Duolingo 資料。")}</div>`;
    else {
      const key = candidateKey(word, candidate), decision = decisions[key] || emptyDecision(candidate);
      const missing = missingP0(word, candidate, decision);
      content += `<label>字典候選<select id="candidate">${word.candidates.map((c, i) => `<option value="${i}" ${i === index ? "selected" : ""}>${i + 1}. ${esc(c.lemma)} · ${reviewStates[decisions[candidateKey(word,c)]?.status || "pending"]}</option>`).join("")}</select></label>
      <div class="lemma"><h2>${esc(candidate.lemma)}</h2><p>${esc((candidate.readings || []).map((r) => `${r.text}${r.restrictedTo?.length ? `（限 ${r.restrictedTo.join("、")}）` : ""}`).join("、"))}</p><p>${esc(terms([...(candidate.tags || []), ...(candidate.rawTags || [])]))}</p>${candidate.spellings?.length ? `<p>字典表記：${esc(candidate.spellings.join("、"))}</p>` : ""}<small>原形讀音不等於所有活用形的讀音；候選表記不代表都同樣常用。</small></div>
      <p>${safeLink(candidate.source?.url, candidate.source?.name || "來源待補")} · ${safeLink(candidate.source?.licenseUrl, "授權資料")} · ${esc(candidate.match || "候選配對")}</p>
      <aside class="missing"><strong>${missing.length ? `字典資料缺漏 ${missing.length} 項` : "字典已提供基本資料"}</strong><ul>${missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul><small>缺漏保留空白，不需手動填寫。「採用」僅確認義項配對。</small></aside>
      <form id="decision" data-key="${esc(key)}">${candidate.senses.map((s, i) => senseView(s, i, decision.senses[i], candidate)).join("")}
      ${field("核對備註（選填）", "note", decision.note)}
      <div class="decision-bar"><label>審核結果<select name="status">${Object.entries(reviewStates).map(([value, label]) => `<option value="${value}" ${decision.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="primary" type="submit">儲存審核</button></div></form>
      <details class="raw"><summary>原始候選資料</summary><pre>${esc(JSON.stringify(candidate, null, 2))}</pre></details>`;
    }
    content += '</article>';
  }
  return `<header><div><p class="eyebrow">Duolingo 單字庫</p><h1>單字資料驗證</h1><p>${reviewed} / ${report.words.length} 個單字已留下審核結果</p></div><div class="file-actions"><button id="export">匯出審核 JSON</button><label class="file-button">匯入審核 JSON<input id="import" type="file" accept="application/json" hidden></label></div></header><p class="intro">字典資料自動取得，確認適用義項即可。審核結果獨立保存，尚未寫入正式字庫。</p>${navigation}${content}`;
}
