import { copyFile, mkdir } from "node:fs/promises";
const target = new URL("../web/vendor/", import.meta.url);
await mkdir(target, { recursive: true });
for (const [source, destination] of [
  ["dist/index.mjs", "ts-fsrs.mjs"],
  ["LICENSE", "ts-fsrs.LICENSE"],
  ["dist/index.mjs.map", "index.mjs.map"],
]) {
  await copyFile(
    new URL(`../node_modules/ts-fsrs/${source}`, import.meta.url),
    new URL(destination, target),
  );
}
