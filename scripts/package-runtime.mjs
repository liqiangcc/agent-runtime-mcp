import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const artifactsDir = join(repoRoot, 'artifacts');
const stageDir = join(artifactsDir, '.stage');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function fail(message) {
  throw new Error(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function runtimeManifestFrom(manifest) {
  if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) {
    fail(`Expected a valid declared package version, got ${manifest.version}`);
  }
  if (manifest.private !== true) {
    fail('Runtime package must remain private:true');
  }
  if (manifest.scripts?.start !== 'node dist/src/server.js') {
    fail('Unexpected npm start contract');
  }

  return {
    name: manifest.name,
    version: manifest.version,
    private: true,
    description: manifest.description,
    type: manifest.type,
    engines: manifest.engines,
    scripts: {
      start: manifest.scripts.start,
    },
    dependencies: manifest.dependencies,
  };
}

function runtimeLockFrom(lock, manifest) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) {
    fail('Expected npm lockfileVersion 3 with a root package entry');
  }
  if (
    lock.name !== manifest.name ||
    lock.version !== manifest.version ||
    lock.packages[''].name !== manifest.name ||
    lock.packages[''].version !== manifest.version
  ) {
    fail('package-lock root metadata must match package.json name/version');
  }

  const runtimeLock = structuredClone(lock);
  delete runtimeLock.packages[''].devDependencies;

  for (const [packagePath, metadata] of Object.entries(runtimeLock.packages)) {
    if (packagePath !== '' && metadata?.dev === true) {
      delete runtimeLock.packages[packagePath];
    }
  }

  return runtimeLock;
}

function runTar(stageRoot, archivePath, bundleName) {
  const result = spawnSync(
    'tar',
    [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-czf',
      archivePath,
      '-C',
      stageRoot,
      bundleName,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    fail(`tar failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

const manifestPath = join(repoRoot, 'package.json');
const lockPath = join(repoRoot, 'package-lock.json');
const deploymentGuidePath = join(repoRoot, 'docs', 'runtime-package.md');
const keeperSourcePath = join(repoRoot, 'deployment', 'tmux-endpoint-keeper.sh');
const builtServerPath = join(repoRoot, 'dist', 'src', 'server.js');

await access(builtServerPath).catch(() => fail('Missing dist/src/server.js; run npm run build first'));
await access(deploymentGuidePath).catch(() => fail('Missing docs/runtime-package.md'));
await access(keeperSourcePath).catch(() => fail('Missing deployment/tmux-endpoint-keeper.sh'));

const manifest = await readJson(manifestPath);
const lock = await readJson(lockPath);
const runtimeManifest = runtimeManifestFrom(manifest);
const runtimeLock = runtimeLockFrom(lock, manifest);

const bundleName = `${manifest.name}-v${manifest.version}`;
const bundleRoot = join(stageDir, bundleName);
const archiveName = `${bundleName}.tar.gz`;
const archivePath = join(artifactsDir, archiveName);
const checksumPath = `${archivePath}.sha256`;

await mkdir(artifactsDir, { recursive: true });
await rm(stageDir, { recursive: true, force: true });
await rm(archivePath, { force: true });
await rm(checksumPath, { force: true });

try {
  await mkdir(join(bundleRoot, 'dist'), { recursive: true });
  await mkdir(join(bundleRoot, 'deployment'), { recursive: true });
  await cp(join(repoRoot, 'dist', 'src'), join(bundleRoot, 'dist', 'src'), { recursive: true });
  await writeFile(join(bundleRoot, 'package.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
  await writeFile(join(bundleRoot, 'package-lock.json'), `${JSON.stringify(runtimeLock, null, 2)}\n`);
  await cp(deploymentGuidePath, join(bundleRoot, 'README.md'));
  await cp(keeperSourcePath, join(bundleRoot, 'deployment', 'tmux-endpoint-keeper.sh'));
  await chmod(join(bundleRoot, 'deployment', 'tmux-endpoint-keeper.sh'), 0o755);

  const licensePath = join(repoRoot, 'LICENSE');
  try {
    await access(licensePath);
    await cp(licensePath, join(bundleRoot, 'LICENSE'));
  } catch {
    // Preserve the repository's current license state; no LICENSE is invented here.
  }

  runTar(stageDir, archivePath, bundleName);

  const digest = createHash('sha256').update(await readFile(archivePath)).digest('hex');
  await writeFile(checksumPath, `${digest}  ${archiveName}\n`);

  console.log(`Created ${archivePath}`);
  console.log(`SHA-256 ${digest}`);
} finally {
  await rm(stageDir, { recursive: true, force: true });
}
