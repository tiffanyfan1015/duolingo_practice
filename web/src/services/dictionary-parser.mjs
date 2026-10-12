import { dictionaryTableLabel } from "../domain/dictionary.mjs";

const compactDictionaryText = text => text.replace(/\s+/g, " ").trim();
// Parse inside an inert template. No source HTML is inserted into the live document.
function dictionaryText(node, { reading = false, skip = [] } = {}) {
  if (node.nodeType === 3) return node.textContent;
  if (node.classList?.contains("defdate")) return "";
  if (["SCRIPT","STYLE","SUP","RP",...skip].includes(node.nodeName)) return "";
  if (node.nodeName === "BR") return " / ";
  if (node.nodeName === "RT" && !reading) return "";
  if (node.nodeName === "RUBY" && reading && node.querySelector("rt")) return [...node.querySelectorAll("rt")].map(n=>dictionaryText(n,{reading})).join("");
  return [...node.childNodes].map(n=>dictionaryText(n,{reading,skip})).join("");
}
const dictionaryNodeText = (node, options) => compactDictionaryText(dictionaryText(node,options));
const dictionaryPos = new Set(["名詞","名词","動詞","动词","形容詞","形容词","副詞","副词","代名詞","代詞","代词","介詞","介词","助詞","助词","連詞","连词","感嘆詞","感叹词","嘆詞","叹词","數詞","数词","冠詞","冠词","專有名詞","专有名词","前置詞","前置词","量詞","量词","短語","短语","熟語","熟语"]);

function dictionaryExamples(li, language) {
  const examples = [];
  for (const n of li.querySelectorAll(`span[lang="${language}"], i[lang="${language}"]`)) {
    if (n.closest("li") !== li || n.closest(".nyms")) continue;
    const scope = n.closest("dd");
    if (!scope || n.parentElement.closest(`[lang="${language}"]`)) continue;
    const text = dictionaryNodeText(n);
    if (!text || examples.some(e=>e.text===text)) continue;
    let translations = [...scope.querySelectorAll(".e-translation")].map(n=>dictionaryNodeText(n));
    if (!translations.length) translations = [...scope.querySelectorAll("dd")].filter(n=>!n.querySelector("[lang]")).map(n=>dictionaryNodeText(n)).filter(t=>/[\u3400-\u9fff]/.test(t));
    const translation = translations.at(-1) || "";
    examples.push({text,translation,translationLanguage:translation ? "zh" : "",ref:"中文維基詞典"});
  }
  return examples;
}

function dictionaryDefinitions(li,language,parent="") {
  const text=dictionaryNodeText(li,{skip:["DL","UL","OL","TABLE"]});
  const gloss=[parent,text].filter(Boolean).join("：");
  const related = [...li.querySelectorAll(".nyms")].filter(n=>n.closest("li")===li).map(n=>dictionaryNodeText(n));
  const senses=text ? [{glosses:[gloss],glossLanguage:"zh",examples:dictionaryExamples(li,language),related}] : [];
  for (const list of li.querySelectorAll("ol")) {
    if (list.closest("li") !== li || list.closest("dl")) continue;
    for (const child of [...list.children].filter(n=>n.tagName === "LI")) senses.push(...dictionaryDefinitions(child,language,gloss));
  }
  return senses;
}

function dictionaryTable(table, language) {
  return [...table.querySelectorAll("tr")].filter(r=>r.closest("table")===table).map(row=>[...row.children].filter(c=>["TD","TH"].includes(c.tagName)).map(c=>{
    const text = dictionaryNodeText(c);
    const span = name => Math.min(30,Math.max(1,Number(c.getAttribute(name)) || 1));
    const person = language === "de" && c.tagName === "TD" ? ({ich:"第一人稱單數",du:"第二人稱單數",er:"第三人稱單數",es:"第三人稱單數",wir:"第一人稱複數",ihr:"第二人稱複數",Sie:"敬稱"})[text.split(" ")[0]] || "" : "";
    return {text:c.tagName === "TH" ? dictionaryTableLabel(text,language) : text,person,header:c.tagName === "TH",colspan:span("colspan"),rowspan:span("rowspan")};
  }));
}

export function parseDictionaryPage(payload, language) {
  if (payload.error?.code === "missingtitle") return [];
  const page = payload.parse;
  if (!page || typeof page.text !== "string") throw Error("字典回應格式不正確。");
  const template = document.createElement("template");
  template.innerHTML = page.text;
  const source = {name:"中文維基詞典",url:`https://zh.wiktionary.org/w/index.php?oldid=${encodeURIComponent(page.revid)}`,licenseUrl:"https://zh.wiktionary.org/wiki/Wiktionary:版权信息"};
  let active = false, section = "", candidate = null;
  const candidates = [];
  for (const n of template.content.querySelectorAll("h2,h3,h4,h5,.headword-line,ol,table,p")) {
    if (n.tagName === "H2") { active = ({ja:["日語","日语"],de:["德語","德语"]})[language]?.includes(dictionaryNodeText(n)); candidate=null; section=""; }
    else if (active && ["H3","H4","H5"].includes(n.tagName)) {
      section = dictionaryNodeText(n);
      if (dictionaryPos.has(section)) { candidate={lemma:page.title,language,pos:[section],readings:[],senses:[],forms:[],formTables:[],source}; candidates.push(candidate); }
    } else if (active && candidate && dictionaryPos.has(section) && n.classList.contains("headword-line")) {
      const head = n.querySelector(`.headword[lang="${language}"]`);
      if (head) {
        candidate.lemma = dictionaryNodeText(head);
        const reading = dictionaryNodeText(head,{reading:true});
        if (language === "ja" && reading && !/[\u3400-\u9fff]/.test(reading)) candidate.readings=[{text:reading}];
      }
      candidate.grammar = dictionaryNodeText(n);
    } else if (active && candidate && dictionaryPos.has(section) && n.tagName === "OL" && !n.closest("li")) {
      for (const li of [...n.children].filter(c=>c.tagName === "LI")) {
        candidate.senses.push(...dictionaryDefinitions(li,language));
      }
    } else if (active && candidate && ["活用","變位","变位","變格","变格","屈折","詞形變化","词形变化"].includes(section) && n.tagName === "TABLE" && !n.querySelector("table")) {
      const wrapper = n.closest(".inflection-table-wrapper");
      const rows = dictionaryTable(n,language);
      const caption = n.querySelector("caption");
      const title = rows[0]?.length === 1 && rows[0][0].header ? rows[0][0].text : "";
      if (rows.length) candidate.formTables.push({label:caption ? dictionaryNodeText(caption) : title || section,rows,notes:wrapper ? dictionaryNodeText(wrapper,{skip:["TABLE"]}) : ""});
    } else if (active && candidate && ["用法","用法說明","用法说明","使用說明","使用说明"].includes(section) && n.tagName === "P") {
      candidate.usage = [candidate.usage,dictionaryNodeText(n)].filter(Boolean).join(" ");
    }
  }
  return candidates.filter(c=>c.senses.length);
}
