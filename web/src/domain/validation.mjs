export const reviewStates = { pending: "未確認", accepted: "採用", revise: "需修正", rejected: "不採用" };
export function candidateKey(word, candidate) { return `${word.id}::${candidate.validationId}`; }
export function senseExamples(sense) {
  return (sense.examples || []).map((e) => ({
    text: e.text || (e.sentences || []).find((s) => s.language === "jpn")?.text || "",
    translation: e.translation || (e.sentences || []).find((s) => s.language === "eng")?.text || "",
    source: e.ref || e.sourceId || "",
  }));
}
export function posLabels(candidate, sense) {
  const pos = sense?.pos || candidate.pos || [];
  return Array.isArray(pos) ? pos : [pos];
}
export function wordClass(candidate, sense) {
  const pos = posLabels(candidate, sense).join(" ").toLowerCase();
  if (/adjective|^adj$|形容詞|形容词/.test(pos)) return "adjective";
  if (/\bverb\b|^v[15sk]|動詞|动词/.test(pos)) return "verb";
  if (/\bnoun\b|^n$|名詞|名词/.test(pos)) return "noun";
  return "other";
}
export function emptyDecision(candidate) {
  return { status: "pending", note: "", updatedAt: 0, senses: (candidate.senses || []).map(() => ({ selected: false, zh: "", usage: "", grammar: "", example: "", exampleZh: "", exampleSource: "" })) };
}
// Presence checks describe missing information; they never certify linguistic quality.
export function missingP0(word, candidate, decision) {
  const missing = [];
  if (!candidate.lemma) missing.push("原形／標準表記");
  if (word.language === "ja" && !candidate.readings?.length) missing.push("假名讀音");
  let selected = decision.senses.map((s, i) => [s, i]).filter(([s]) => s.selected);
  if (!selected.length) selected = candidate.senses.map((s, i) => [decision.senses[i], i]);
  if (!candidate.senses.length) missing.push("字典釋義");
  for (const [edit, index] of selected) {
    const sense = candidate.senses[index], prefix = `義項 ${index + 1}：`;
    const pos = posLabels(candidate, sense);
    if (!pos.filter(Boolean).length) missing.push(prefix + "詞性");
    if (!sense.glossLanguage?.startsWith("zh") || !sense.glosses?.length) missing.push(prefix + "中文釋義");
    if (!senseExamples(sense).some(e => e.text)) missing.push(prefix + "例句");
    else if (!(sense.examples || []).some(e => e.translation && e.translationLanguage?.startsWith("zh"))) missing.push(prefix + "例句中文譯文");
    const cls = wordClass(candidate, sense);
    const forms = sense.forms || candidate.forms || [];
    const has = (...tags) => forms.some((f) => tags.every((t) => (f.tags || []).includes(t)));
    if (["verb", "adjective"].includes(cls) && !(sense.grammar || candidate.grammar)) missing.push(prefix + "語法搭配／用法");
    const tableText = (candidate.formTables || []).flatMap(t => t.rows.flat().map(c => c.text)).join(" ");
    const grammar = [...pos, candidate.grammar || ""].join(" ").toLowerCase();
    if (word.language === "ja" && cls === "verb") {
      if (!/ichidan|godan|suru|kuru|v1|v5|vs-|vk|一段|五段|サ變|カ變/.test(grammar)) missing.push(prefix + "動詞分類");
      if (!/transitive|自動詞|他動詞|自动词|他动词/.test(grammar)) missing.push(prefix + "自他動詞性質");
      if (!["polite", "te-form", "negative", "past"].every((t) => has(t)) && !tableText) missing.push(prefix + "基本動詞活用");
    }
    if (word.language === "ja" && cls === "adjective" && !tableText && !["negative", "past"].every((t) => has(t))) missing.push(prefix + "形容詞基本變化");
    if (word.language === "de" && cls === "noun") {
      if (!/陽|陰|中性|阳|阴/.test(grammar) && !(candidate.tags || []).some(t => ["masculine", "feminine", "neuter"].includes(t))) missing.push(prefix + "性別");
      if (!forms.some(f => f.article) && !/\b(der|die|das)\b/.test(tableText)) missing.push(prefix + "冠詞");
      if (!has("nominative", "plural") && !/複數|复数/.test(tableText + grammar)) missing.push(prefix + "複數");
      if (!has("genitive", "singular") && !/所有格|屬格|属格/.test(tableText)) missing.push(prefix + "重要變格");
    }
    if (word.language === "de" && cls === "verb") {
      if ((!has("present", "third-person", "singular") || !has("past") || !has("participle", "past")) && !tableText) missing.push(prefix + "動詞主要形式");
      if (!/haben|sein/.test(grammar + tableText)) missing.push(prefix + "完成式助動詞");
    }
    if (word.language === "de" && cls === "adjective" && (!has("comparative") || !has("superlative")) && !/比較級|比较级|最高級|最高级/.test(grammar + tableText)) missing.push(prefix + "比較級／最高級或不適用說明");
  }
  return missing;
}
export function validateDecisions(report, input) {
  if (!input || input.schemaVersion !== 1 || input.kind !== "vocabulary-validation" || input.reportId !== report.reportId || !input.decisions || typeof input.decisions !== "object" || Array.isArray(input.decisions)) throw new Error("這不是本報告的審核檔，未匯入任何資料。");
  const known = new Map(report.words.flatMap((w) => w.candidates.map((c) => [candidateKey(w, c), c])));
  const result = {};
  for (const [key, item] of Object.entries(input.decisions)) {
    const candidate = known.get(key);
    if (!candidate || !item || !Object.hasOwn(reviewStates, item.status) || typeof item.note !== "string" || item.note.length > 10000 || !Number.isFinite(item.updatedAt) || item.updatedAt < 0 || !Array.isArray(item.senses) || item.senses.length !== candidate.senses.length) throw new Error("審核資料格式或候選版本不符，未匯入任何資料。");
    const senses = item.senses.map((s) => {
      if (!s || typeof s.selected !== "boolean") throw new Error("義項格式不正確。");
      const clean = { selected: s.selected };
      for (const field of ["zh", "usage", "grammar", "example", "exampleZh", "exampleSource"]) {
        if (typeof s[field] !== "string" || s[field].length > 10000) throw new Error("補充內容格式不正確或過長。");
        clean[field] = s[field];
      }
      return clean;
    });
    if (item.status === "accepted" && !senses.some((s) => s.selected)) throw new Error("採用前請至少選擇一個適用義項。");
    result[key] = { status: item.status, note: item.note, updatedAt: item.updatedAt, senses };
  }
  return result;
}
