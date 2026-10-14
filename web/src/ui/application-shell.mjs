// @ts-check
// DOM adapters for application-level state; no requests or persistence here.
/** @param {boolean} signedIn @param {boolean | null} studyAvailable */
export function configureAccountUI(signedIn, studyAvailable) {
  const link = document.querySelector('#account-link');
  if (link instanceof HTMLElement) link.hidden = !signedIn;
  const hint = document.querySelector('.storage-note');
  if (hint) hint.textContent = signedIn
    ? '同帳號可同步學習紀錄；切換裝置前請確認已同步。'
    : '紀錄儲存在此瀏覽器；換裝置時可備份再匯入。';
  if (studyAvailable === null) return;
  const area = document.querySelector('#study-sync-area');
  if (!studyAvailable && area) area.textContent = '學習同步未啟動，請先備份紀錄並檢查瀏覽器儲存空間。';
}

export const getSyncArea = () => document.querySelector('#sync-area');
export const reloadApplication = () => location.reload();

/** @param {Element} element @returns {element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} */
const field = element => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
function reviewFields() {
  const form = document.querySelector('.review-settings');
  return form instanceof HTMLFormElement ? [...form.elements].filter(field).filter(el => el.name) : [];
}

/** Redraw the workspace while retaining unsaved review settings. The dialog is untouched.
 * @param {() => void} render @param {boolean} showRomaji
 */
export function refreshStudyWorkspace(render, showRomaji) {
  const form = document.querySelector('.review-settings');
  const draft = form instanceof HTMLElement && form.dataset.dirty
    ? reviewFields().map(el => ({name: el.name, value: el.value, checked: el instanceof HTMLInputElement && el.checked}))
    : [];
  render();
  const romaji = document.querySelector('#romaji');
  if (romaji instanceof HTMLInputElement) romaji.checked = showRomaji;
  const fields = reviewFields();
  for (const value of draft) {
    const el = fields.find(el => el.name === value.name && (el.type !== 'checkbox' || el.value === value.value));
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value.checked;
    else if (el) el.value = value.value;
  }
  const nextForm = document.querySelector('.review-settings');
  if (draft.length && nextForm instanceof HTMLElement) nextForm.dataset.dirty = 'true';
}
