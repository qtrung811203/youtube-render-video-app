// Rebuilds only when sources are newer than the last build; bundling the CJK fonts makes a full
// build take ~40s, which the launcher would otherwise pay on every start.
import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const newest = (path) => {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...readdirSync(path).map((name) => newest(join(path, name))));
};
const sources = Math.max(...['src', 'electron', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.electron.json'].map((p) => newest(join(root, p))));
const built = ['dist/index.html', 'dist-electron/main.js'].map((p) => join(root, p));
const lastBuild = built.every(existsSync) ? Math.min(...built.map((p) => statSync(p).mtimeMs)) : 0;
if (sources > lastBuild) execSync('npm run build', { cwd: root, stdio: 'inherit' });
else console.log('Build is up to date.');
