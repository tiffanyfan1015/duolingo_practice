import { esc } from "./shared.mjs";
import { orderDictionarySenses, dictionaryGrammar } from "../../domain/dictionary.mjs";
import { chineseTerms } from "../../domain/morphology-labels.mjs";

const dictionaryLink = (url,label) => /^https:\/\//.test(url || "") ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : "";
const dictionarySpan = n => Number.isInteger(n) && n > 0 && n <= 30 ? n : 1;
function dictionarySenseView({sense,index,uncommon}) {
  const examples = (sense.examples || []).map(e=>`<div class="dictionary-example"><span class="dictionary-example-label">用法示例</span><p lang="${esc(e.language || "")}">${esc(e.text)}</p>${e.translation ? `<p class="example-translation">${esc(e.translation)}</p>` : ""}</div>`);
  return `<section class="dictionary-sense"><div class="dictionary-sense-heading"><span class="sense-number">${index+1}</span><h5>${esc((sense.glosses || []).join("；"))}</h5>${uncommon ? '<span class="dictionary-badge muted-badge">較少用</span>' : ""}</div>
    ${examples[0] || ""}${examples.length > 1 ? `<details class="dictionary-expand more-examples"><summary>更多用法示例 <span>${examples.length-1}</span></summary>${examples.slice(1).join("")}</details>` : ""}
    ${sense.related?.length ? `<details class="dictionary-expand dictionary-related"><summary>相關詞語</summary>${sense.related.map(text=>`<p>${esc(text)}</p>`).join("")}</details>` : ""}</section>`;
}
function dictionaryFormsView(candidate) {
  const tables = candidate.formTables || [];
  if (!tables.length) return "";
  const commonLabels = new Set(["ます形（禮貌形）","て形（連接形）","た形（過去／完成）","否定形","不定式","現在分詞","现在分词","過去分詞","过去分词","助動詞","助动词"]);
  const common = tables.flatMap(t=>t.rows).filter(row=>row[0]?.header && commonLabels.has(row[0].text) && row[1]?.text).slice(0,4);
  return `<section class="dictionary-forms"><h4>詞形變化</h4><div class="dictionary-form-cards">${common.map(row=>`<div><span>${esc(row[0].text)}</span><strong>${esc(row[1].text)}</strong></div>`).join("")}</div>
    <details class="dictionary-expand"><summary>完整詞形變化</summary>${tables.map(t=>`<div class="dictionary-table-scroll" tabindex="0" role="region" aria-label="${esc(t.label)}，可左右捲動"><table><caption>${esc(t.label)}</caption><tbody>${t.rows.map(row=>`<tr>${row.map(cell=>{const tag=cell.header ? "th" : "td";return `<${tag} colspan="${dictionarySpan(cell.colspan)}" rowspan="${dictionarySpan(cell.rowspan)}">${esc(cell.text)}${cell.person ? `<small>${esc(cell.person)}</small>` : ""}</${tag}>`;}).join("")}</tr>`).join("")}</tbody></table></div>${t.notes ? `<p class="dictionary-footnote">${esc(t.notes)}</p>` : ""}`).join("")}</details></section>`;
}
function dictionaryEntryView(candidate,word) {
  const grammar = dictionaryGrammar(candidate);
  const ordered = orderDictionarySenses(candidate,word.meanings);
  const featured = ordered.filter(s=>s.overlap && !s.uncommon);
  if (!featured.length && ordered[0] && !ordered[0].uncommon) featured.push(ordered[0]);
  const other = ordered.filter(s=>!featured.includes(s));
  return `<article class="dictionary-entry"><header class="dictionary-entry-heading"><div><h4>${esc(candidate.lemma)}</h4>${candidate.readings?.length ? `<p>${esc(candidate.readings.map(r=>r.text).join("、"))}</p>` : ""}</div><span class="dictionary-badge">${esc(chineseTerms(candidate.pos || []))}</span></header>
    ${featured.map(dictionarySenseView).join("")}
    ${other.length ? `<details class="dictionary-expand other-meanings"><summary>其他意思 <span>${other.length}</span></summary>${other.map(dictionarySenseView).join("")}</details>` : ""}
    ${candidate.usage || grammar.text ? `<details class="dictionary-expand dictionary-grammar"><summary>語法與用法</summary>${grammar.text ? `<p>${esc(grammar.text)}</p>` : ""}${grammar.explanation ? `<p class="dictionary-footnote">${esc(grammar.explanation)}</p>` : ""}${candidate.usage ? `<p>${esc(candidate.usage)}</p>` : ""}</details>` : ""}
    ${dictionaryFormsView(candidate)}
    <footer class="dictionary-source">${dictionaryLink(candidate.source?.url,candidate.source?.name || "詞條來源")}${dictionaryLink(candidate.source?.licenseUrl,"授權")}${dictionaryLink(candidate.lookupSource,"原形查詢")}</footer></article>`;
}
function dictionaryReadingsView(entries, word) {
  if (!entries?.length) return "";
  const senseView = s => `<div class="dictionary-reading-sense">${s.pos.length ? `<span class="dictionary-reading-pos">${esc(chineseTerms(s.pos))}</span>` : ""}<p lang="en">${esc(s.glosses.join("; "))}</p>${s.tags.length || s.notes.length ? `<p class="dictionary-footnote" lang="en">${esc([...s.tags,...s.notes].join(" · "))}</p>` : ""}</div>`;
  return `<section class="dictionary-readings"><div class="dictionary-section-title"><h4>字典讀音</h4><span>用法釋義為英文</span></div>
    <p class="dictionary-footnote">依用法有不同讀音；課程發音請聽 Duolingo 音訊。</p>
    <div class="dictionary-reading-grid">${entries.map(entry => `<article class="dictionary-reading-card"><h5 lang="ja">${esc(entry.reading)}</h5>
      ${entry.senses[0] ? senseView(entry.senses[0]) : ""}${entry.senses.length > 1 ? `<details class="dictionary-expand"><summary>其他用法 <span>${entry.senses.length-1}</span></summary>${entry.senses.slice(1).map(senseView).join("")}</details>` : ""}</article>`).join("")}</div>
    <footer class="dictionary-source">${dictionaryLink(`https://jisho.org/search/${encodeURIComponent(word.text)}`,"Jisho / JMdict")}</footer></section>`;
}
export function dictionaryView(result,word) {
  if (!result || result.status === "loading") return '<div class="dictionary-status" role="status"><span class="dictionary-spinner" aria-hidden="true"></span>正在查詢字典…</div>';
  if (result.status === "unsupported") return '<p class="dictionary-status">此語言目前顯示 Duolingo 釋義。</p>';
  if (result.status === "error") return `<div class="dictionary-status" role="status"><p>${esc(result.message)}</p><button type="button" class="secondary" data-dictionary-retry>重新查詢</button></div>`;
  const readings = dictionaryReadingsView(result.readingEntries, word);
  if (!result.candidates?.length) return readings || '<p class="dictionary-status">暫時沒有對應的字典詞條。</p>';
  return `${readings}<div class="dictionary-section-title"><h4>字典釋義</h4><span>含其他用法</span></div>${result.candidates.map(c=>dictionaryEntryView(c,word)).join("")}`;
}
