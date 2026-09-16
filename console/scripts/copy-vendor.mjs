// Copies the xterm browser bundles into public/vendor at build time so the
// static file server can serve them without exposing node_modules paths.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const consoleDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(consoleDir, 'public', 'vendor');
mkdirSync(out, { recursive: true });

const files = [
  ['node_modules/@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['node_modules/@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['node_modules/@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
];
for (const [src, dest] of files) {
  copyFileSync(join(consoleDir, src), join(out, dest));
}
console.log(`vendored ${files.length} xterm files into public/vendor/`);

// Issue #128 — browser delivery of the compiled pure data-path modules.
// projection/adapter/devin-adapter compile to import-free ES modules (type
// imports erase), so the built files are copied verbatim into
// public/modules/ and served like any other static asset. The UI reuses the
// exact production implementation — no reimplementation, no bundler.
const modulesOut = join(consoleDir, 'public', 'modules');
mkdirSync(modulesOut, { recursive: true });
const modules = ['projection.js', 'adapter.js', 'devin-adapter.js'];
for (const name of modules) {
  copyFileSync(join(consoleDir, 'dist', 'src', name), join(modulesOut, name));
}
console.log(`vendored ${modules.length} pure modules into public/modules/`);

// Issue #134 — build identity marker. The served module carries the exact
// build identity so a resumed standalone page can detect it is stale and
// reload. Git SHA when available; otherwise a deterministic content stamp.
let buildId = 'unknown';
try {
  buildId = execSync('git rev-parse HEAD', { cwd: consoleDir, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch {
  // no git metadata — fall back to a deterministic hash of the public assets
  const hash = createHash('sha256');
  for (const name of readdirSync(join(consoleDir, 'public')).sort()) {
    try { hash.update(readFileSync(join(consoleDir, 'public', name))); } catch { /* dirs */ }
  }
  buildId = `content-${hash.digest('hex').slice(0, 16)}`;
}
writeFileSync(
  join(modulesOut, 'build-stamp.js'),
  `// generated at build time — build identity for stale-resume self-heal\nexport const BUILD_ID = ${JSON.stringify(buildId)};\n`,
);
console.log(`wrote build-stamp.js (${buildId.slice(0, 12)})`);
