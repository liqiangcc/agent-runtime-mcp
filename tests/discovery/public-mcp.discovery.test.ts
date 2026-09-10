import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'wait_channel_event', 'write_text'];

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
    assert.deepEqual(channel.capabilities, ['read', 'write-text', 'control', 'observe']);
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

    const observed = requireSuccess(
      await client.callTool({ name: 'get_channel', arguments: { channel_id: String(channel.channel_id), observe: true } }),
      'get_channel observe',
    );
    const observation = asRecord(observed.observation, 'observation');
    await client.callTool({ name: 'write_text', arguments: { channel_id: String(channel.channel_id), text: "printf 'stdio-wait\\n'", submit: true } });
    const waitStarted = Date.now();
    const waited = requireSuccess(
      await client.callTool({ name: 'wait_channel_event', arguments: { channel_id: String(channel.channel_id), after_cursor: observation.cursor, idle_ms: 250, timeout_ms: 5000 } }),
      'wait_channel_event',
    );
    assert.equal(waited.reason, 'output_idle');
    assert.equal(waited.activity_observed, true);
    assert.ok(Date.now() - waitStarted >= 250);
    const afterRead = requireSuccess(await client.callTool({ name: 'read_channel', arguments: { channel_id: String(channel.channel_id), lines: 20, bytes: 4096 } }), 'read after wait');
    assert.equal(asRecord(afterRead.read, 'read').channel_id, String(channel.channel_id));
    console.log('STDIO_WAIT_EVIDENCE', JSON.stringify({ reason: waited.reason, elapsed_ms: Date.now() - waitStarted, next_cursor: typeof waited.next_cursor === 'string' }));

    const freshObserved = requireSuccess(
      await client.callTool({ name: 'get_channel', arguments: { channel_id: String(channel.channel_id), observe: true } }),
      'fresh get_channel observe',
    );
    const freshObservation = asRecord(freshObserved.observation, 'fresh observation');
    const cancel = new AbortController();
    const cancelStarted = Date.now();
    const cancelled = client.callTool({ name: 'wait_channel_event', arguments: { channel_id: String(channel.channel_id), after_cursor: freshObservation.cursor, idle_ms: 250, timeout_ms: 5000 } }, { signal: cancel.signal });
    let settledBeforeTrigger = false;
    void cancelled.then(() => { settledBeforeTrigger = true; }, () => { settledBeforeTrigger = true; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(settledBeforeTrigger, false);
    setTimeout(() => cancel.abort(), 100);
    let cancelledResult: unknown;
    try { cancelledResult = await cancelled; } catch { cancelledResult = undefined; }
    const cancelElapsed = Date.now() - cancelStarted;
    assert.ok(cancelElapsed < 2000);
    assert.equal((cancelledResult as { reason?: string } | undefined)?.reason, undefined);
    const admissionObserved = requireSuccess(await client.callTool({ name: 'get_channel', arguments: { channel_id: String(channel.channel_id), observe: true } }), 'admission observe');
    const admissionCursor = String(asRecord(admissionObserved.observation, 'admission observation').cursor);
    const admissions = await Promise.all([
      client.callTool({ name: 'wait_channel_event', arguments: { channel_id: String(channel.channel_id), after_cursor: admissionCursor, idle_ms: 250, timeout_ms: 100 } }),
      client.callTool({ name: 'wait_channel_event', arguments: { channel_id: String(channel.channel_id), after_cursor: admissionCursor, idle_ms: 250, timeout_ms: 100 } }),
    ]);
    assert.equal(admissions.every((entry) => entry.isError !== true && (entry.structuredContent as { reason?: string })?.reason === 'timeout'), true);
    console.log('STDIO_CANCEL_EVIDENCE', JSON.stringify({ trigger_delay_ms: 200, cleanup_elapsed_ms: cancelElapsed - 200, released_by_re_admission: true, response_error: (cancelledResult as { isError?: boolean } | undefined)?.isError === true }));

    const disconnectStarted = Date.now();
    const disconnectObserved = requireSuccess(await client.callTool({ name: 'get_channel', arguments: { channel_id: String(channel.channel_id), observe: true } }), 'disconnect observe');
    const disconnectCursor = String(asRecord(disconnectObserved.observation, 'disconnect observation').cursor);
    const disconnected = client.callTool({ name: 'wait_channel_event', arguments: { channel_id: String(channel.channel_id), after_cursor: disconnectCursor, idle_ms: 250, timeout_ms: 1000 } });
    let disconnectSettledBeforeClose = false;
    void disconnected.then(() => { disconnectSettledBeforeClose = true; }, () => { disconnectSettledBeforeClose = true; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(disconnectSettledBeforeClose, false);
    setTimeout(() => { void client.close(); }, 100);
    await disconnected.catch(() => undefined);
    const disconnectElapsed = Date.now() - disconnectStarted;
    assert.ok(disconnectElapsed < 3000);
    console.log('STDIO_DISCONNECT_EVIDENCE', JSON.stringify({ trigger_delay_ms: 200, completion_elapsed_ms: disconnectElapsed - 200, pending_before_close: true, transport_closed: true, server_cleanup: 'not_claimed_without_admission_probe' }));
  } finally {
    await client.close().catch(() => undefined);
    await tmux(socketName, 'kill-server').catch(() => undefined);
  }
});
