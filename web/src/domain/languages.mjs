const languageLabels = { en: "英文", ja: "日文", de: "德文", fr: "法文", es: "西班牙文", it: "義大利文", ko: "韓文", zh: "中文", zs: "中文", pt: "葡萄牙文", ru: "俄文", ar: "阿拉伯文", hi: "印地文", vi: "越南文", th: "泰文", nl: "荷蘭文", sv: "瑞典文", nb: "挪威文", no: "挪威文", da: "丹麥文", fi: "芬蘭文", pl: "波蘭文", uk: "烏克蘭文", tr: "土耳其文", el: "希臘文", he: "希伯來文", id: "印尼文", ro: "羅馬尼亞文", cs: "捷克文", hu: "匈牙利文", ga: "愛爾蘭文", cy: "威爾斯文", eo: "世界語", la: "拉丁文", sw: "斯瓦希里文", tl: "菲律賓文" };
export function languageName(code) {
  if (Object.hasOwn(languageLabels, code)) return languageLabels[code];
  try { return new Intl.DisplayNames(["zh-Hant"], { type: "language" }).of(code); }
  catch { return String(code); }
}
export const speechLanguage = (code) => ({ zs: "zh-CN", zh: "zh-CN", ja: "ja-JP", de: "de-DE", en: "en-US", nb: "nb-NO" })[code] || code;
export const validCourseKey = (key) => typeof key === "string" && key.length > 0 && key.length <= 800 && !["__proto__", "constructor", "prototype"].includes(key);
