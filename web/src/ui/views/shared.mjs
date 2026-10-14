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
  const attributes = `class="reading" data-reading-word="${esc(word.id)}"`;
  if (word.readingPending && !word.reading)
    return `<span ${attributes}>讀音待補，可先聽發音</span>`;
  const kana = word.reading !== word.text ? esc(word.reading) : "";
  return `<span ${attributes}>${kana}${showRomaji ? ` <span>${esc(word.romaji)}</span>` : ""}</span>`;
}
