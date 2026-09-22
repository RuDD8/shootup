#!/usr/bin/env node
/**
 * Build a Newgrounds-ready HTML5 ZIP.
 *
 * Newgrounds hosts the ZIP under a subdirectory iframe. Absolute `/js/...`
 * paths would 404, and the ~1.2GB models folder exceeds their size limits, so
 * this pack:
 *   - copies a slim client (html/css/js/vendor/sounds + shared/)
 *   - remaps absolute module paths to relative ones
 *   - points WebSocket + GLB/sound fetches at your live Railway origin
 *
 * Usage:
 *   SHOOTUP_ORIGIN=https://your-app.up.railway.app node scripts/pack-newgrounds.mjs
 *
 * Output: dist/newgrounds/shootup-newgrounds.zip
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'newgrounds');
const STAGE = path.join(OUT_DIR, 'stage');

const origin = (process.env.SHOOTUP_ORIGIN || '').replace(/\/$/, '');
if (!origin || !/^https?:\/\//i.test(origin)) {
  console.error(
    'Set SHOOTUP_ORIGIN to your live game URL, e.g.\n' +
      '  SHOOTUP_ORIGIN=https://your-app.up.railway.app npm run pack:newgrounds',
  );
  process.exit(1);
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest, { ignore = [] } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, { ignore });
    else fs.copyFileSync(from, to);
  }
}

function zipStage(stageDir, zipPath) {
  const zipBin = spawnSync('zip', ['-r', '-q', zipPath, '.'], { cwd: stageDir });
  if (zipBin.status === 0) return;
  const py = `
import zipfile, os
root = ${JSON.stringify(stageDir)}
out = ${JSON.stringify(zipPath)}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            z.write(full, os.path.relpath(full, root))
`;
  const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'zip failed');
    process.exit(1);
  }
}

rmrf(OUT_DIR);
fs.mkdirSync(STAGE, { recursive: true });

copyDir(path.join(ROOT, 'public'), STAGE, { ignore: ['models', 'dev'] });
copyDir(path.join(ROOT, 'shared'), path.join(STAGE, 'shared'));

const indexPath = path.join(STAGE, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const configScript = `
    <script>
      // Injected by pack-newgrounds.mjs — multiplayer + GLBs live on Railway.
      window.SHOOTUP = { origin: ${JSON.stringify(origin)} };
    </script>`;

html = html
  .replace('<link rel="stylesheet" href="/styles.css" />', '<link rel="stylesheet" href="./styles.css" />')
  .replace(
    `<script type="importmap">
      {
        "imports": {
          "three": "/vendor/three.module.js"
        }
      }
    </script>
    <script type="module" src="/js/main.js"></script>`,
    `${configScript}
    <script type="importmap">
      {
        "imports": {
          "three": "./vendor/three.module.js",
          "/vendor/": "./vendor/",
          "/shared/": "./shared/",
          "/js/": "./js/"
        }
      }
    </script>
    <script type="module" src="./js/main.js"></script>`,
  );

if (!html.includes('window.SHOOTUP')) {
  console.error('Failed to inject Newgrounds config into index.html — template drift?');
  process.exit(1);
}

fs.writeFileSync(indexPath, html);

const zipPath = path.join(OUT_DIR, 'shootup-newgrounds.zip');
zipStage(STAGE, zipPath);

const zipStat = fs.statSync(zipPath);
const mb = (zipStat.size / (1024 * 1024)).toFixed(2);

console.log(`Newgrounds pack ready: ${zipPath} (${mb} MB)`);
console.log(`  WS + models → ${origin}`);
console.log('');
console.log('Upload steps:');
console.log('  1. Deploy this repo to Railway so models/WS are live at the origin above.');
console.log('  2. newgrounds.com → Your Projects → New Game.');
console.log('  3. Drag shootup-newgrounds.zip (index.html must be at ZIP root — it is).');
console.log('  4. Preview: menu loads, weapons preload from Railway, create/join works.');
console.log('  5. Publish + ride judgment.');
