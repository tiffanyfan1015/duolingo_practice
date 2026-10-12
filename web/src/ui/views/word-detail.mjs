import { esc, reading, unitLabel } from "./shared.mjs";
import { dictionaryView } from "./dictionary.mjs";

export function detailView(
  w,
  { record: r, language: lang, showRomaji, course: catalog },
) {
  const meanings = [...new Set(w.meanings)].filter(Boolean);
  return /* HTML */ `<div class="eyebrow">
      ${esc(catalog.name)}
    </div>
    <h3 class="detail-title">${esc(w.text)}</h3>
    <div class="detail-pronunciation">${reading(w, lang, showRomaji)}<button
      class="secondary"
      data-audio="${esc(w.id)}"
    >
      ♫ 播放發音
    </button></div>
    <div class="detail-block">
      <h4>正在學的意思 <span class="dictionary-badge">Duolingo</span></h4>
      <p>${esc(meanings.slice(0,3).join("、"))}</p>
      ${meanings.length > 3 ? `<details class="dictionary-expand"><summary>更多課程釋義</summary><p>${esc(meanings.slice(3).join("、"))}</p></details>` : ""}
    </div>
    <div id="dictionary-content" data-dictionary-word="${esc(w.id)}" aria-live="polite">${dictionaryView({status:["de","ja"].includes(lang) ? "loading" : "unsupported"},w)}</div>
    <details class="detail-block">
      <summary>相關單元</summary>
      ${w.units
        .map(
          (id) =>
            `<div class="detail-unit">${esc(unitLabel(catalog.units.find((u) => u.id === id)))}</div>`,
        )
        .join("")}
    </details>
    <div class="detail-block">
      <h4>我的筆記</h4>
      <textarea id="note" class="detail-note" placeholder="記下容易忘記的地方…">
${esc(r.note || "")}</textarea
      ><button id="save-note" class="primary">儲存筆記</button>
    </div>`;
}
