import { Converter, toRomaji, isKana } from "../../vendor/language-tools.mjs";
const convert = Converter({ from: "cn", to: "twp" });
export const traditionalChinese = text => convert(String(text || ""));
export function kanaPronunciation(text) {
  return typeof text === "string" && text.length <= 200 && isKana(text)
    ? { reading: text, romaji: toRomaji(text), readingPending: false }
    : null;
}
