// Copies the xterm browser bundles into public/vendor at build time so the
// static file server can serve them without exposing node_modules paths.
import { copyFileSync, mkdirSync } from 'node:fs';
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
