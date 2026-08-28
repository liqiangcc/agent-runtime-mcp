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
  assert.notEqual(result.isError, true, `${label} returned a public MCP error`);
  return asRecord(result.structuredContent, `${label}.structuredContent`);
}

async function tmux(socketName: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout;
}

async function sessionExists(socketName: string, sessionName: string): Promise<boolean> {
  try {
    await tmux(socketName, 'has-session', '-t', sessionName);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

async function readSnapshot(client: Client, channelId: string, lines = 40, bytes = 8192) {
  const result = await callTool(client, 'read_channel', { channel_id: channelId, lines, bytes });
  const payload = requireSuccess(result, 'read_channel');
  return asRecord(payload.read, 'read_channel.read');
}

async function waitForMarker(client: Client, channelId: string, marker: string): Promise<Record<string, unknown>> {
  let lastRead: Record<string, unknown> = {};
  await waitFor(async () => {
    lastRead = await readSnapshot(client, channelId);
    return typeof lastRead.text === 'string' && lastRead.text.includes(marker);
  });
  return lastRead;
}

test('official MCP client dogfoods the complete public Channel surface', { timeout: 15000 }, async () => {
  const socketName = `agent-runtime-mcp-dogfood-${process.pid}-${Date.now()}`;
  const sessionName = `mvp003-${process.pid}-${Date.now()}`;
  const serverPath = join(process.cwd(), 'dist', 'src', 'server.js');

  // Endpoint lifecycle is deliberately external to Channel MCP. Disable terminal
  // echo so marker assertions cannot pass merely because the input command itself
  // contains the marker text.
  await tmux(socketName, 'new-session', '-d', '-s', sessionName, 'stty -echo; exec bash --noprofile --norc');
  await waitFor(async () => (await tmux(socketName, 'list-panes', '-t', sessionName, '-F', '#{pane_current_command}')).trim() === 'bash');

  const client = new Client({ name: 'agent-runtime-mcp-dogfood', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: sessionName,
      TMUX_TIMEOUT_MS: '5000',
    },
  });

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const publicTools = toolList.tools.map((tool) => tool.name).sort();
    assert.deepEqual(publicTools, EXPECTED_TOOLS);

    const healthPayload = requireSuccess(await callTool(client, 'health'), 'health');
    const health = asRecord(healthPayload.health, 'health.health');
    assert.equal(health.backend_kind, 'tmux');
    assert.equal(health.available, true);

    const listPayload = requireSuccess(await callTool(client, 'list_channels'), 'list_channels');
    const channels = listPayload.channels;
    assert.ok(Array.isArray(channels));
    assert.equal(channels.length, 1);
    const channel = asRecord(channels[0], 'list_channels.channels[0]');
    assert.equal(typeof channel.channel_id, 'string');
    const channelId = channel.channel_id as string;
    const capabilities = channel.capabilities;
    assert.ok(Array.isArray(capabilities));
    assert.deepEqual([...capabilities].sort(), ['control', 'read', 'write-text']);

    const getPayload = requireSuccess(await callTool(client, 'get_channel', { channel_id: channelId }), 'get_channel');
    const inspected = asRecord(getPayload.channel, 'get_channel.channel');
    assert.equal(inspected.channel_id, channelId);

    const initialRead = await readSnapshot(client, channelId, 5, 1024);
    assert.equal(typeof initialRead.text, 'string');
    assert.equal(typeof initialRead.truncated, 'boolean');
    assert.equal(typeof initialRead.line_count, 'number');
    assert.equal(typeof initialRead.byte_count, 'number');
    assert.ok((initialRead.line_count as number) <= 5);
    assert.ok((initialRead.byte_count as number) <= 1024);

    requireSuccess(
      await callTool(client, 'write_text', {
        channel_id: channelId,
        text: "printf 'CHANNEL_DOGFOOD_OK\\n'",
        submit: true,
      }),
      'write_text:first-marker',
    );
    await waitForMarker(client, channelId, 'CHANNEL_DOGFOOD_OK');

    requireSuccess(
      await callTool(client, 'write_text', { channel_id: channelId, text: 'sleep 30', submit: true }),
      'write_text:sleep',
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    requireSuccess(
      await callTool(client, 'send_control', { channel_id: channelId, control: 'INTERRUPT' }),
      'send_control:INTERRUPT',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    requireSuccess(
      await callTool(client, 'write_text', {
        channel_id: channelId,
        text: "printf 'AFTER_INTERRUPT_OK\\n'",
        submit: true,
      }),
      'write_text:after-interrupt',
    );
    await waitForMarker(client, channelId, 'AFTER_INTERRUPT_OK');

    // Destroy the endpoint externally, then prove the still-connected MCP server
    // reports a mechanical failure and does not recreate the tmux endpoint.
    await tmux(socketName, 'kill-session', '-t', sessionName);
    await waitFor(async () => !(await sessionExists(socketName, sessionName)), 2000);

    const missingResult = await callTool(client, 'get_channel', { channel_id: channelId });
    assert.equal(missingResult.isError, true);
    const missingPayload = asRecord(missingResult.structuredContent, 'get_channel:missing.structuredContent');
    const missingError = asRecord(missingPayload.error, 'get_channel:missing.error');
    const missingCode = String(missingError.code);
    assert.ok(['CHANNEL_NOT_FOUND', 'CHANNEL_UNAVAILABLE', 'BACKEND_UNAVAILABLE'].includes(missingCode));
    assert.equal(await sessionExists(socketName, sessionName), false);

    console.log(
      `DOGFOOD_EVIDENCE ${JSON.stringify({
        public_tools: publicTools,
        health: { backend_kind: health.backend_kind, available: health.available },
        channels_visible: channels.length,
        channel_state: channel.state,
        channel_capabilities: capabilities,
        bounded_read: {
          line_count: initialRead.line_count,
          byte_count: initialRead.byte_count,
          truncated: initialRead.truncated,
        },
        marker_CHANNEL_DOGFOOD_OK: true,
        interrupt: 'INTERRUPT accepted through public MCP',
        marker_AFTER_INTERRUPT_OK: true,
        endpoint_destroyed_externally: true,
        post_destroy_error: missingCode,
        endpoint_recreated: false,
      })}`,
    );
  } finally {
    await client.close().catch(() => undefined);
    await tmux(socketName, 'kill-server').catch(() => undefined);
  }
});
