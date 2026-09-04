import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function fail(message) {
  throw new Error(message);
}

const tag = process.argv[2];
if (!tag) {
  fail('usage: node scripts/release-preflight.mjs <release-tag>');
}

const manifest = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) {
  fail(`package.json contains an invalid release version: ${manifest.version}`);
}
if (manifest.private !== true) {
  fail('package.json must remain private:true');
}
if (manifest.scripts?.start !== 'node dist/src/server.js') {
  fail('unexpected npm start contract');
}

const expectedTag = `v${manifest.version}`;
if (tag !== expectedTag) {
  fail(`release tag/version mismatch: expected ${expectedTag}, got ${tag}`);
}

const releaseNotePath = join(repoRoot, 'docs', 'releases', `${tag}.md`);
await access(releaseNotePath).catch(() => fail(`missing release note: docs/releases/${tag}.md`));
const releaseNote = await readFile(releaseNotePath, 'utf8');
if (releaseNote.trim().length === 0) {
  fail(`release note is empty: docs/releases/${tag}.md`);
}

console.log(`release-tag=${tag}`);
console.log(`package-version=${manifest.version}`);
console.log(`release-note=docs/releases/${tag}.md`);
console.log('release-preflight=PASS');
