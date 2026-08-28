import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'write_text'];

type PublicToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireSuccess(result: PublicToolResult, label: string): Record<string, unknown> {
  if (result.isError === true) {
    assert.fail(`${label} returned a public MCP error: ${JSON.stringify(result.structuredContent)}`);
  }
  return asRecord(result.structuredContent, `${label}.structuredContent`);
}

async function tmux(socketName: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    env: getDefaultEnvironment(),
  });
  return result.stdout;
}

async function callTool(client: Client, name: string) {
  return client.callTool({ name, arguments: {} });
}

test('official stdio client discovers only the allowed externally prepared tmux pane', { timeout: 12000 }, async () => {
  const socketName = `agent-runtime-mcp-discovery-${process.pid}-${Date.now()}`;
  const allowedSession = `mvp017-allowed-${process.pid}-${Date.now()}`;
  const hiddenSession = `mvp017-hidden-${process.pid}-${Date.now()}`;
  const serverPath = join(process.cwd(), 'dist', 'src', 'server.js');
  const safeEnvironment = getDefaultEnvironment();

  // This is intentionally the same reduced environment used by the official stdio
  // transport. The regression must not depend on ambient locale variables.
  assert.equal(safeEnvironment.LC_ALL, undefined);
  assert.equal(safeEnvironment.LC_CTYPE, undefined);
  assert.equal(safeEnvironment.LANG, undefined);

  // Endpoint lifecycle remains external to Channel MCP. Prepare one visible and one
  // same-socket hidden pane so the public listing also locks the configured scope.
  await tmux(socketName, 'new-session', '-d', '-s', allowedSession);
  await tmux(socketName, 'new-session', '-d', '-s', hiddenSession);

  const client = new Client({ name: 'agent-runtime-mcp-discovery-regression', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: process.cwd(),
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
    const channels = listPayload.channels;
    assert.ok(Array.isArray(channels));
    assert.equal(channels.length, 1);

    const channel = asRecord(channels[0], 'list_channels.channels[0]');
    assert.equal(channel.backend_kind, 'tmux');
    assert.equal(channel.state, 'available');
    assert.deepEqual(channel.capabilities, ['read', 'write-text', 'control']);
    assert.match(String(channel.channel_id), /^tmux:[a-f0-9]{12}:\d+$/);

    const backendMetadata = asRecord(channel.backend_metadata, 'channel.backend_metadata');
    const tmuxIdentity = asRecord(backendMetadata.tmux, 'channel.backend_metadata.tmux');
    assert.equal(tmuxIdentity.session_name, allowedSession);
    assert.match(String(tmuxIdentity.window_id), /^@\d+$/);
    assert.equal(Number.isInteger(tmuxIdentity.window_index) && (tmuxIdentity.window_index as number) >= 0, true);
    assert.match(String(tmuxIdentity.pane_id), /^%\d+$/);
    assert.equal(Number.isInteger(tmuxIdentity.pane_index) && (tmuxIdentity.pane_index as number) >= 0, true);

    const serialized = JSON.stringify(channel);
    assert.equal(serialized.includes(socketName), false);
    assert.equal(serialized.includes(hiddenSession), false);
  } finally {
    await client.close().catch(() => undefined);
    await tmux(socketName, 'kill-server').catch(() => undefined);
  }
});
