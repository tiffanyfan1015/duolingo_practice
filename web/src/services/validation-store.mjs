import { validateDecisions } from "../domain/validation.mjs";
export function createValidationStore(storage, report, notify = () => {}) {
  const key = `cijian-vocabulary-validation-v1:${report.reportId}`;
  let decisions = {};
  const wrap = (value) => ({ schemaVersion: 1, kind: "vocabulary-validation", reportId: report.reportId, decisions: value });
  try {
    const raw = storage.getItem(key);
    if (raw) decisions = validateDecisions(report, JSON.parse(raw));
  } catch { notify("無法讀取本機審核紀錄。請匯入已匯出的審核檔。"); }
  function persist(next) {
    // Validate the complete update before changing either memory or persistence.
    next = validateDecisions(report, wrap(next));
    try { storage.setItem(key, JSON.stringify(wrap(next))); }
    catch { decisions = next; notify("瀏覽器無法保存，請立即匯出審核檔；關閉頁面可能遺失變更。"); return false; }
    decisions = next;
    return true;
  }
  return {
    get decisions() { return decisions; },
    save(id, decision) { return persist({ ...decisions, [id]: decision }); },
    export() { return { ...wrap(decisions), exportedAt: new Date().toISOString(), generatedAt: report.generatedAt, sources: report.sources }; },
    merge(input) {
      const clean = validateDecisions(report, input), next = { ...decisions };
      for (const [id, value] of Object.entries(clean)) if (!next[id] || value.updatedAt > next[id].updatedAt) next[id] = value;
      return persist(next);
    },
  };
}
