import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const includePersonal = process.argv.includes('--include-personal');
// The compatibility Python CLI also goes through both type checks.
for (const config of ['tsconfig.json', 'tsconfig.browser.json']) {
  const check = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', config], {cwd: root, stdio: 'inherit'});
  if (check.error) throw check.error;
  if (check.status !== 0) process.exit(check.status ?? 1);
}
// Never remove a caller-selected directory.
if (dirname(output) !== resolve(root) || output !== join(resolve(root), 'dist')) throw Error('Invalid build output');
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
const web = join(root, 'web');
async function copy(relative) {
  const target = join(output, relative);
  await mkdir(dirname(target), {recursive: true});
  await cp(join(web, relative), target);
}
for (const name of ['index.html', 'app.js', 'account.html', 'account.js', 'style.css', 'learning.mjs']) await copy(name);
async function copyTree(folder, extension) {
  for (const entry of await readdir(join(web, folder), {withFileTypes: true})) {
    const relative = join(folder, entry.name);
    if (entry.isDirectory()) await copyTree(relative, extension);
    else if (entry.isFile() && (!extension || entry.name.endsWith(extension))) await copy(relative);
  }
}
await copyTree('src', '.mjs');
await copyTree('styles', '.css');
await copyTree('vendor', '');
if (includePersonal) {
  try { await copy('data.json'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await build({
  absWorkingDir: root, entryPoints: ['server/worker.ts'], outfile: 'dist/_worker.js',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2023', legalComments: 'eof',
});
await writeFile(join(output, '.assetsignore'), '_worker.js\n_routes.json\n');
await writeFile(join(output, '_routes.json'), JSON.stringify({version: 1, include: ['/*'], exclude: []}));
console.log(`Cloudflare build: ${output}; personal vocabulary included: ${includePersonal}`);
