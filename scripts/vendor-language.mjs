import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
await mkdir(new URL("web/vendor/", root), { recursive: true });
await build({
  stdin: { contents: 'export { Converter } from "opencc-js/cn2t"; export { toRomaji, isKana } from "wanakana";', resolveDir: fileURLToPath(root) },
  outfile: fileURLToPath(new URL("web/vendor/language-tools.mjs", root)),
  bundle: true, format: "esm", platform: "browser", minify: true, legalComments: "eof",
});
for (const [source, target] of [
  ["opencc-js/LICENSE", "opencc-js.LICENSE"],
  ["opencc-js/LICENSES/Apache-2.0.txt", "opencc-data.LICENSE"],
  ["opencc-js/THIRD_PARTY_LICENSES.md", "opencc-data.NOTICE"],
  ["wanakana/LICENSE", "wanakana.LICENSE"],
]) await copyFile(new URL(`node_modules/${source}`, root), new URL(`web/vendor/${target}`, root));
