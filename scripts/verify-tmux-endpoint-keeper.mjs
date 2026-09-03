import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'write_text'];
const socketName = `agent-runtime-keeper-${process.pid}-${Date.now()}`;
const keeperSession = `keeper-${process.pid}-${Date.now()}`;
const workerSession = `worker-${process.pid}-${Date.now()}`;
const safeEnvironment = getDefaultEnvironment();
const keeperScript = resolve('deployment/tmux-endpoint-keeper.sh');
const deploymentEnvironment = {
  ...safeEnvironment,
  TMUX_SOCKET_NAME: socketName,
  TMUX_SOCKET_PATH: '',
  TMUX_KEEPER_SESSION: keeperSession,
};

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

async function tmux(...args) {
  return execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    env: safeEnvironment,
  });
}

async function keeper(command) {
  return execFileAsync('bash', [keeperScript, command], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    env: deploymentEnvironment,
  });
}

async function health(client) {
  const payload = requireSuccess(await client.callTool({ name: 'health', arguments: {} }), 'health');
  return asRecord(payload.health, 'health.health');
}

await tmux('kill-server').catch(() => undefined);

const client = new Client({ name: 'tmux-endpoint-keeper-verifier', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/src/server.js'],
  cwd: process.cwd(),
  env: {
    ...safeEnvironment,
    TMUX_SOCKET_NAME: socketName,
    TMUX_TIMEOUT_MS: '1000',
  },
});

try {
  await client.connect(transport);

  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, EXPECTED_TOOLS);
  console.log(`public-tools=${toolNames.join(',')}`);

  let statusFailed = false;
  try {
    await keeper('status');
  } catch {
    statusFailed = true;
  }
  assert.equal(statusFailed, true, 'keeper status must fail closed while the tmux endpoint is absent');

  const before = await health(client);
  assert.equal(before.backend_kind, 'tmux');
  assert.equal(before.available, false);
  assert.equal(before.detail, 'BACKEND_UNAVAILABLE');
  console.log('health-before-recovery=unavailable');

  const firstEnsure = await keeper('ensure');
  assert.match(firstEnsure.stdout, /created|unchanged|recovered-after-race/);
  const afterFirstEnsure = await health(client);
  assert.equal(afterFirstEnsure.available, true);
  console.log('health-after-first-ensure=healthy');

  await tmux('new-session', '-d', '-s', workerSession);
  await tmux('kill-session', '-t', `=${workerSession}`);
  const afterWorkerRemoval = await health(client);
  assert.equal(afterWorkerRemoval.available, true, 'keeper must preserve backend health after a worker session is removed');
  console.log('health-after-worker-removal=healthy');

  await tmux('kill-server');
  const afterEndpointLoss = await health(client);
  assert.equal(afterEndpointLoss.available, false);
  assert.equal(afterEndpointLoss.detail, 'BACKEND_UNAVAILABLE');
  console.log('health-after-endpoint-loss=unavailable');

  const recoveryEnsure = await keeper('ensure');
  assert.match(recoveryEnsure.stdout, /created|unchanged|recovered-after-race/);
  const afterRecovery = await health(client);
  assert.equal(afterRecovery.available, true);
  console.log('health-after-recovery=healthy');

  const status = await keeper('status');
  assert.match(status.stdout, /available/);
  await tmux('has-session', '-t', `=${keeperSession}`);

  console.log(`candidate=${process.env.GITHUB_SHA ?? 'local'}`);
  console.log('tmux-endpoint-keeper-recovery=PASS');
} finally {
  await client.close().catch(() => undefined);
  await tmux('kill-server').catch(() => undefined);
}
