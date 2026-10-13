export function bindStudySyncEvents(actions) {
  document.querySelector("#study-sync-area").addEventListener("click",event=>{
    const button=event.target.closest("[data-study-sync]");
    if(button)actions.sync(button.dataset.studySync || null);
  });
  window.addEventListener("online",()=>actions.refresh());
  window.addEventListener("focus",()=>actions.refresh());
  window.addEventListener("storage",event=>{if(event.key?.endsWith("cijian-study-sync-v1"))actions.refresh();});
  document.addEventListener("visibilitychange",()=>actions.refresh());
}
