const morphologyLabels = {
  noun: "名詞", verb: "動詞", adj: "形容詞", adjective: "形容詞", adv: "副詞", intj: "感嘆詞", pron: "代名詞", prep: "介系詞",
  masculine: "陽性", feminine: "陰性", neuter: "中性", singular: "單數", plural: "複數", nominative: "主格", accusative: "受格", dative: "與格", genitive: "所有格",
  polite: "ます形（禮貌形）", "te-form": "て形（連接形）", negative: "否定形", past: "過去式", present: "現在式", future: "未來式", participle: "分詞",
  comparative: "比較級", superlative: "最高級", positive: "原級", "first-person": "第一人稱", "second-person": "第二人稱", "third-person": "第三人稱",
  infinitive: "不定詞", indicative: "直陳式", subjunctive: "虛擬式", imperative: "命令式", conditional: "條件形", potential: "可能形", passive: "被動形", causative: "使役形",
  perfect: "完成式", imperfect: "未完成式", pluperfect: "過去完成式", auxiliary: "助動詞", attributive: "連體用法", predicative: "述語用法",
  strong: "強變化", weak: "弱變化", mixed: "混合變化", formal: "正式", informal: "非正式", archaic: "古語", obsolete: "已廢用", rare: "罕用",
  "ichidan verb": "一段動詞", "transitive verb": "他動詞", "intransitive verb": "自動詞", transitive: "及物", intransitive: "不及物",
  reflexive: "反身", uncountable: "不可數", countable: "可數", "no-plural": "無複數", "plural-only": "只用複數",
};
export function chineseTerms(items = []) {
  return items.map(x => morphologyLabels[x.toLowerCase()] || (/godan verb/i.test(x) ? "五段動詞" : x)).join(" · ");
}
export function morphologyLabel(form) {
  if (form.label) return form.label;
  const tags = form.tags || [];
  if (tags.includes("participle")) {
    const rest = tags.filter(t => !["participle", "past", "present"].includes(t));
    return [...(rest.length ? [chineseTerms(rest)] : []), tags.includes("past") ? "過去分詞" : tags.includes("present") ? "現在分詞" : "分詞"].join(" · ");
  }
  const ordered = ["first-person", "second-person", "third-person", "singular", "plural", "present", "past", "future"];
  const primary = ordered.filter(t => tags.includes(t));
  const others = tags.filter(t => !ordered.includes(t));
  return [primary.map(t => morphologyLabels[t]).join(""), chineseTerms(others)].filter(Boolean).join(" · ") || "來源未標示詞形";
}
