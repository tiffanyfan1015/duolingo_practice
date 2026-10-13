import { mountApplication } from "./src/app-controller.mjs";
import { loadCatalog } from "./src/services/catalog.mjs";
import { createProgressStore, accountStorage } from "./src/services/progress-store.mjs";
import { createAudioPlayer } from "./src/services/audio.mjs";
import { toast } from "./src/ui/dom.mjs";
import { showLoadError } from "./src/ui/shell.mjs";
import { createReviewStore } from "./src/services/review-store.mjs";

try {
  const catalog = await loadCatalog();
  const storage = accountStorage(localStorage, catalog.user?.id);
  mountApplication({
    catalog,
    storage,
    progress: createProgressStore(storage, toast),
    review: createReviewStore(storage, toast),
    audio: createAudioPlayer(toast),
    notify: toast,
  });
} catch (error) {
  console.error(error);
  showLoadError();
}
