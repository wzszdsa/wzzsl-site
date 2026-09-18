import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const entries = [
  'index.html',
  'app.js',
  'game.js',
  'styles.css',
  'assets',
];

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

for (const entry of entries) {
  const source = resolve(projectRoot, entry);
  const destination = resolve(distRoot, entry);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

console.log(`Built static bundle: ${distRoot}`);
