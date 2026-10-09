export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

export const unitLabel = (unit) =>
  unit.id === "unmapped"
    ? "尚未確認單元"
    : `第 ${unit.section} 階段 · ${unit.position} ${unit.title}`;

export function reading(word, language, showRomaji) {
  if (language !== "ja") return "";
  if (word.readingPending)
    return '<span class="reading">讀音待補，可先聽發音</span>';
  const kana = word.reading !== word.text ? esc(word.reading) : "";
  return `<span class="reading">${kana}${showRomaji ? ` <span>${esc(word.romaji)}</span>` : ""}</span>`;
}
