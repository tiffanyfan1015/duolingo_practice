import { createValidationStore } from "./services/progress-store.mjs";
import { createAudioPlayer } from "./services/audio.mjs";
import { validationView } from "./ui/views/validation.mjs";
import { bindValidationEvents } from "./ui/validation-events.mjs";
import { candidateKey, emptyDecision } from "./domain/validation.mjs";
export function mountValidation(report, element) {
  const notify = (text) => { document.querySelector("#notice").textContent = text; };
  const storage = { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key,value) };
  const store = createValidationStore(storage, report, notify), audio = createAudioPlayer(notify);
  const state = { language: "", query: "", wordId: report.words[0]?.id, candidateIndex: 0 };
  let dirty = false;
  const word = () => report.words.find((w) => w.id === element.querySelector("article")?.dataset.word);
  const candidate = () => word()?.candidates[Number(element.querySelector("#candidate")?.value || 0)];
  const render = () => { element.innerHTML = validationView(report, state, store.decisions); };
  const mayLeave = () => !dirty || window.confirm("尚有未儲存的審核內容，確定放棄這些變更？");
  function save(data) {
    const c = candidate();
    if (!c) return false;
    const decision = structuredClone(store.decisions[candidateKey(word(), c)] || emptyDecision(c));
    decision.status = data.get("status"); decision.note = data.get("note"); decision.updatedAt = Date.now();
    decision.senses = decision.senses.map((s, i) => ({...s, selected: data.has(`s${i}-selected`)}));
    try {
      const persisted = store.save(candidateKey(word(), c), decision);
      dirty = false; render();
      if (persisted) notify("已儲存審核；尚未修改正式字庫。請匯出 JSON 留存。");
      return true;
    } catch (error) { notify(error.message); return false; }
  }
  bindValidationEvents(element, {
    dirty() { dirty = true; }, save,
    navigate(id, value) {
      if (!mayLeave()) {
        const old = id === "word" ? state.wordId : id === "candidate" ? state.candidateIndex : state[id];
        element.querySelector(`#${id}`).value = old || ""; return;
      }
      audio.stop(); dirty = false;
      if (id === "word") { state.wordId = value; state.candidateIndex = 0; }
      else if (id === "candidate") state.candidateIndex = Number(value);
      else { state[id] = value; state.wordId = null; state.candidateIndex = 0; }
      render(); state.wordId = word()?.id;
    },
    play() { const w = word(); if (w) audio.play(w, w.language); },
    export() {
      if (dirty && !save(new FormData(element.querySelector("#decision")))) return;
      const blob = new Blob([JSON.stringify(store.export(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `vocabulary-review-${report.reportId.slice(0,12)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async import(file) {
      if (!mayLeave()) return;
      try {
        if (file.size > 10000000) throw new Error("審核檔過大。");
        const persisted = store.merge(JSON.parse(await file.text())); dirty = false; render();
        if (persisted) notify("已匯入審核，保留較新的紀錄。");
      } catch (error) { notify(error.message); }
      finally { const input = element.querySelector("#import"); if(input) input.value = ""; }
    },
  });
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  render();
}
