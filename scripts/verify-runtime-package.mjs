import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'write_text'];

function asRecord(value, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function requireSuccess(result, label) {
  if (result.isError === true) {
    assert.fail(`${label} returned a public MCP error: ${JSON.stringify(result.structuredContent)}`);
  }
  return asRecord(result.structuredContent, `${label}.structuredContent`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function tmux(socketName, ...args) {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    env: getDefaultEnvironment(),
  });
  return result.stdout;
}

async function callTool(client, name) {
  return client.callTool({ name, arguments: {} });
}

const packageRootArg = process.argv[2];
assert.ok(packageRootArg, 'usage: node scripts/verify-runtime-package.mjs <extracted-package-root>');
const packageRoot = resolve(packageRootArg);

const requiredPaths = [
  'README.md',
  'package.json',
  'package-lock.json',
  'dist/src/server.js',
];
for (const path of requiredPaths) {
  assert.equal(await exists(join(packageRoot, path)), true, `missing required package path: ${path}`);
}

const forbiddenPaths = [
  'src',
  'tests',
  'dist/tests',
  'scripts',
  'node_modules/typescript',
  'node_modules/@modelcontextprotocol/client',
  'tsconfig.json',
  '.github',
  'docs',
];
for (const path of forbiddenPaths) {
  assert.equal(await exists(join(packageRoot, path)), false, `forbidden runtime package path present: ${path}`);
}

const topLevel = (await readdir(packageRoot)).sort();
for (const entry of topLevel) {
  assert.ok(['LICENSE', 'README.md', 'dist', 'node_modules', 'package-lock.json', 'package.json'].includes(entry), `unexpected top-level runtime entry: ${entry}`);
}
assert.deepEqual((await readdir(join(packageRoot, 'dist'))).sort(), ['src']);

const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'agent-runtime-mcp');
assert.equal(manifest.version, '0.1.0');
assert.equal(manifest.private, true);
assert.equal(manifest.description, 'Generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.');
assert.deepEqual(manifest.scripts, { start: 'node dist/src/server.js' });
assert.equal(manifest.devDependencies, undefined);

const lock = JSON.parse(await readFile(join(packageRoot, 'package-lock.json'), 'utf8'));
assert.equal(lock.name, 'agent-runtime-mcp');
assert.equal(lock.version, '0.1.0');
assert.equal(lock.packages[''].devDependencies, undefined);
for (const [packagePath, metadata] of Object.entries(lock.packages)) {
  assert.notEqual(metadata?.dev, true, `dev-only package leaked into runtime lockfile: ${packagePath}`);
}

// The clean-room npm ci --omit=dev step must have completed before this verifier.
assert.equal(await exists(join(packageRoot, 'node_modules', '@modelcontextprotocol', 'server')), true, 'production MCP server dependency is not installed');
assert.equal(await exists(join(packageRoot, 'node_modules', 'zod')), true, 'production zod dependency is not installed');
assert.equal(await exists(join(packageRoot, 'node_modules', 'typescript')), false, 'TypeScript must not be installed in the runtime package');
assert.equal(await exists(join(packageRoot, 'node_modules', '@modelcontextprotocol', 'client')), false, 'official MCP client is a verifier dependency, not a runtime dependency');

const socketName = `agent-runtime-mcp-package-${process.pid}-${Date.now()}`;
const allowedSession = `package-smoke-${process.pid}-${Date.now()}`;
const safeEnvironment = getDefaultEnvironment();

// Endpoint lifecycle is intentionally external to the packaged MCP process.
await tmux(socketName, 'new-session', '-d', '-s', allowedSession);

const client = new Client({ name: 'agent-runtime-mcp-package-verifier', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: 'npm',
  args: ['--silent', 'start'],
  cwd: packageRoot,
  env: {
    ...safeEnvironment,
    TMUX_SOCKET_NAME: socketName,
    TMUX_ALLOWED_SESSIONS: allowedSession,
    TMUX_TIMEOUT_MS: '5000',
  },
});

try {
  await client.connect(transport);

  const toolList = await client.listTools();
  assert.deepEqual(toolList.tools.map((tool) => tool.name).sort(), EXPECTED_TOOLS);

  const healthPayload = requireSuccess(await callTool(client, 'health'), 'health');
  const health = asRecord(healthPayload.health, 'health.health');
  assert.equal(health.backend_kind, 'tmux');
  assert.equal(health.available, true);

  const listPayload = requireSuccess(await callTool(client, 'list_channels'), 'list_channels');
  assert.ok(Array.isArray(listPayload.channels));
  assert.equal(listPayload.channels.length, 1);

  const channel = asRecord(listPayload.channels[0], 'list_channels.channels[0]');
  assert.equal(channel.backend_kind, 'tmux');
  assert.equal(channel.state, 'available');
  assert.deepEqual(channel.capabilities, ['read', 'write-text', 'control']);
} finally {
  await client.close().catch(() => undefined);
  await tmux(socketName, 'kill-server').catch(() => undefined);
}

console.log('Packaged runtime clean-room verification passed.');
