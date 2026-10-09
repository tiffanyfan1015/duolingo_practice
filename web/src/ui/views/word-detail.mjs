import { esc, reading, unitLabel } from "./shared.mjs";

export function detailView(
  w,
  { record: r, language: lang, showRomaji, course: catalog },
) {
  return /* HTML */ `<div class="eyebrow">
      ${esc(catalog.name)}
    </div>
    <h3 class="detail-title">${esc(w.text)}</h3>
    ${reading(w, lang, showRomaji)}<button
      class="secondary"
      data-audio="${esc(w.id)}"
    >
      ♫ 播放發音
    </button>
    <div class="detail-block">
      <h4>
        釋義 ·
        ${catalog.sync?.rawMeanings ? "Duolingo 原始釋義" : "原始釋義轉繁體"}
      </h4>
      <p>${esc(w.meanings.join("、"))}</p>
    </div>
    <div class="detail-block">
      <h4>相關單元 · 由技能對應推定</h4>
      ${w.units
        .map(
          (id) =>
            `<div class="detail-unit">${esc(unitLabel(catalog.units.find((u) => u.id === id)))}</div>`,
        )
        .join("")}
    </div>
    <div class="detail-block">
      <h4>
        ${lang === "de" ? "冠詞、複數、動詞變化與例句" : "詞形變化與例句"}
      </h4>
      <p class="hint">
        目前 API
        未提供，尚待補充。${lang === "ja"
          ? "上方假名與羅馬拼音為自動轉換，遇到多音字請以課程發音確認。"
          : ""}
      </p>
    </div>
    <div class="detail-block">
      <h4>我的筆記</h4>
      <textarea id="note" class="detail-note" placeholder="記下容易忘記的地方…">
${esc(r.note || "")}</textarea
      ><button id="save-note" class="primary">儲存筆記</button>
    </div>`;
}
