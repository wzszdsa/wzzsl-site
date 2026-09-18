import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = resolve(projectRoot, 'android');
const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradleCommand, ['assembleDebug'], {
  cwd: androidRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const source = resolve(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const destination = resolve(projectRoot, 'release', 'android', 'warm-warehouse-sokoban-debug.apk');
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log(`Built Android APK: ${destination}`);
