// Pure ranking: a wording overlap is a hint, never an assertion of equivalence.
const senseTokens = text => String(text).normalize("NFKC").toLowerCase().split(/[\s,，、；;。.!！?？()（）]+/).filter(Boolean);
export function orderDictionarySenses(candidate, meanings) {
  const known = meanings.flatMap(senseTokens);
  return (candidate.senses || []).map((sense, index) => {
    const terms = (sense.glosses || []).flatMap(senseTokens);
    const overlap = known.some(t => terms.includes(t));
    const uncommon = /古語|古语|古舊|古旧|罕用|已廢用|obsolete|archaic/.test([...(sense.tags || []), ...(sense.glosses || [])].join(" "));
    return { sense, index, overlap, uncommon };
  }).sort((a,b) => Number(b.overlap) - Number(a.overlap) || Number(a.uncommon) - Number(b.uncommon) || a.index - b.index);
}

export function japaneseLookupForms(lemma, pos) {
  const type = pos.join(" ").toLowerCase();
  if (type.includes("ichidan verb") && lemma.endsWith("る")) return ["ます", "て", "ない", "た"].map(s => lemma.slice(0,-1) + s);
  if ((type.includes("suru verb - included") || lemma === "する" && type.includes("suru")) && lemma.endsWith("する")) return ["します", "して", "しない", "した"].map(s => lemma.slice(0,-2) + s);
  if (type.includes("kuru verb") && ["来る", "くる"].includes(lemma)) return lemma === "来る" ? ["来ます", "来て", "来ない", "来た"] : ["きます", "きて", "こない", "きた"];
  const rules = {う:["u","い","わ","って","った"],く:["ku","き","か","いて","いた"],ぐ:["gu","ぎ","が","いで","いだ"],す:["su","し","さ","して","した"],つ:["tsu","ち","た","って","った"],ぬ:["nu","に","な","んで","んだ"],ぶ:["bu","び","ば","んで","んだ"],む:["mu","み","ま","んで","んだ"],る:["ru","り","ら","って","った"]};
  const rule = rules[lemma.slice(-1)], stem = lemma.slice(0,-1);
  if (type.includes("godan") && type.includes("irregular verb") && ["ある","有る","在る"].includes(lemma)) return [stem + "ります", stem + "って", "ない", stem + "った"];
  if (rule && type.includes("iku/yuku special class") && lemma.endsWith("く")) return [stem+"きます",stem+"って",stem+"かない",stem+"った"];
  if (!rule || !type.includes(`godan verb with '${rule[0]}' ending`) || type.includes("special class")) return [];
  return [stem+rule[1]+"ます",stem+rule[3],stem+rule[2]+"ない",stem+rule[4]];
}

export function matchedJapaneseLemmas(data, term) {
  const matches = [];
  for (const entry of (data.data || []).slice(0,5)) {
    const pos = (entry.senses || []).flatMap(s => s.parts_of_speech || []);
    for (const spelling of entry.japanese || []) {
      const lemma = spelling.word || spelling.reading || "";
      const forms = [lemma, spelling.reading, ...japaneseLookupForms(lemma,pos), ...japaneseLookupForms(spelling.reading || "",pos)];
      if (lemma !== term && forms.includes(term) && !matches.includes(lemma)) matches.push(lemma);
    }
  }
  return matches.slice(0,3);
}

export const dictionaryTableLabel = (label, language) => (language === "ja" ? {
  "敬體":"ます形（禮貌形）", "敬体":"ます形（禮貌形）", "接續":"て形（連接形）", "接续":"て形（連接形）",
  "完成":"た形（過去／完成）", "否定":"否定形", "被動":"被動形", "被动":"被動形", "使役":"使役形", "可能":"可能形",
} : {i:"虛擬一式",ii:"虛擬二式"})[label] || label;

// Explain source abbreviations only when the entry explicitly identifies a German noun.
export function dictionaryGrammar(candidate) {
  let text = candidate.grammar || "";
  if (candidate.language !== "de" || !candidate.pos?.some(p=>["名詞","名词","專有名詞","专有名词"].includes(p))) return {text,explanation:""};
  if (text.startsWith(candidate.lemma + " ")) text = text.slice(candidate.lemma.length).trim();
  text = text.replace(/^(陽|阴|陰|阳|中)(?=\s|\()/, gender=>({陽:"陽性名詞（der）",阳:"陽性名詞（der）",陰:"陰性名詞（die）",阴:"陰性名詞（die）",中:"中性名詞（das）"})[gender]);
  text = text.replace(/屬格|属格/g,"單數屬格").replace(/複數|复数/g,"複數形式");
  const explanation = /強變化|强变化|弱變化|弱变化|混合變化|混合变化/.test(text) ? "「強變化／弱變化」是名詞的變格類型，說明詞尾如何隨語法位置改變，與難度等級無關。" : "";
  return {text,explanation};
}
