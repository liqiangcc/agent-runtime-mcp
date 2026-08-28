import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'write_text'];
const MISLEADING_MARKER = 'REMOTE [p1] 0:codex*';
const WRITE_MARKER = 'WRITE_P1_ONLY';

type PublicToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
};

type TmuxMetadata = {
  session_name: string;
  window_id: string;
  window_index: number;
  pane_id: string;
  pane_index: number;
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

function tmuxMetadata(channel: Record<string, unknown>, label: string): TmuxMetadata {
  const backendMetadata = asRecord(channel.backend_metadata, `${label}.backend_metadata`);
  const tmux = asRecord(backendMetadata.tmux, `${label}.backend_metadata.tmux`);
  assert.equal(typeof tmux.session_name, 'string');
  assert.equal(typeof tmux.window_id, 'string');
  assert.equal(typeof tmux.window_index, 'number');
  assert.equal(typeof tmux.pane_id, 'string');
  assert.equal(typeof tmux.pane_index, 'number');
  assert.equal(Number.isInteger(tmux.window_index) && (tmux.window_index as number) >= 0, true);
  assert.equal(Number.isInteger(tmux.pane_index) && (tmux.pane_index as number) >= 0, true);
  return {
    session_name: tmux.session_name as string,
    window_id: tmux.window_id as string,
    window_index: tmux.window_index as number,
    pane_id: tmux.pane_id as string,
    pane_index: tmux.pane_index as number,
  };
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

async function capture(socketName: string, sessionName: string): Promise<string> {
  return tmux(socketName, 'capture-pane', '-p', '-t', sessionName, '-S', '-100');
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

test('public MCP selects host p1 only from structured tmux identity despite misleading s2 output', { timeout: 20000 }, async () => {
  const socketName = `agent-runtime-mcp-public-identity-${process.pid}-${Date.now()}`;
  const commonCwd = mkdtempSync(join(tmpdir(), 'agent-runtime-mcp-public-identity-'));
  const serverPath = join(process.cwd(), 'dist', 'src', 'server.js');
  const safeEnvironment = getDefaultEnvironment();

  await tmux(socketName, 'new-session', '-d', '-s', 'p1', '-c', commonCwd);
  await tmux(socketName, 'new-session', '-d', '-s', 's2', '-c', commonCwd);
  for (const sessionName of ['p1', 's2']) {
    await tmux(socketName, 'send-keys', '-t', sessionName, '-l', 'exec bash --noprofile --norc');
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');
  }
  await waitFor(async () => {
    const commands = await Promise.all(
      ['p1', 's2'].map(async (sessionName) =>
        (await tmux(socketName, 'list-panes', '-t', sessionName, '-F', '#{pane_current_command}')).trim(),
      ),
    );
    return commands.every((command) => command === 'bash');
  });

  for (const sessionName of ['p1', 's2']) {
    await tmux(socketName, 'send-keys', '-t', sessionName, '-l', 'stty -echo');
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');
    await tmux(socketName, 'select-pane', '-t', `${sessionName}:0.0`, '-T', 'root');
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  await tmux(socketName, 'send-keys', '-t', 's2', '-l', `printf '${MISLEADING_MARKER}\\n'`);
  await tmux(socketName, 'send-keys', '-t', 's2', 'Enter');
  await waitFor(async () => (await capture(socketName, 's2')).includes(MISLEADING_MARKER));

  const client = new Client({ name: 'structured-tmux-identity-dogfood', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: process.cwd(),
    env: {
      ...safeEnvironment,
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: 'p1,s2',
      TMUX_TIMEOUT_MS: '5000',
    },
  });

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const publicTools = toolList.tools.map((tool) => tool.name).sort();
    assert.deepEqual(publicTools, EXPECTED_TOOLS);

    const listPayload = requireSuccess(await callTool(client, 'list_channels'), 'list_channels');
    assert.ok(Array.isArray(listPayload.channels));
    assert.equal(listPayload.channels.length, 2);
    const channels = listPayload.channels.map((channel, index) => asRecord(channel, `list_channels.channels[${index}]`));

    for (const channel of channels) {
      assert.equal(channel.backend_kind, 'tmux');
      assert.equal(channel.title, 'root');
      assert.equal(channel.cwd, commonCwd);
      assert.match(String(channel.channel_id), /^tmux:[a-f0-9]{12}:\d+$/);
      tmuxMetadata(channel, 'list channel');
    }

    // Target selection deliberately uses only backend-owned structured identity.
    // No read_channel call, terminal text, title or cwd participates in this selector.
    const selected = channels.find((channel) => tmuxMetadata(channel, 'selector channel').session_name === 'p1');
    assert.ok(selected, 'structured tmux session identity must select host p1');
    assert.equal(typeof selected.channel_id, 'string');
    const selectedMetadata = tmuxMetadata(selected, 'selected channel');

    const s2Channel = channels.find((channel) => tmuxMetadata(channel, 's2 channel').session_name === 's2');
    assert.ok(s2Channel);
    const s2Metadata = tmuxMetadata(s2Channel, 's2 channel');
    assert.notEqual(selectedMetadata.pane_id, s2Metadata.pane_id);

    const getPayload = requireSuccess(
      await callTool(client, 'get_channel', { channel_id: selected.channel_id }),
      'get_channel',
    );
    const inspected = asRecord(getPayload.channel, 'get_channel.channel');
    assert.deepEqual(tmuxMetadata(inspected, 'get_channel.channel'), selectedMetadata);
    assert.equal(inspected.channel_id, selected.channel_id);

    const actualP1Pane = (await tmux(socketName, 'list-panes', '-t', 'p1', '-F', '#{pane_id}')).trim();
    const actualS2Pane = (await tmux(socketName, 'list-panes', '-t', 's2', '-F', '#{pane_id}')).trim();
    assert.equal(selectedMetadata.pane_id, actualP1Pane);
    assert.equal(s2Metadata.pane_id, actualS2Pane);

    requireSuccess(
      await callTool(client, 'write_text', {
        channel_id: selected.channel_id,
        text: `printf '${WRITE_MARKER}\\n'`,
        submit: true,
      }),
      'write_text:selected-p1',
    );

    await waitFor(async () => (await capture(socketName, 'p1')).includes(WRITE_MARKER));
    const p1Output = await capture(socketName, 'p1');
    const s2Output = await capture(socketName, 's2');
    assert.equal(p1Output.includes(WRITE_MARKER), true);
    assert.equal(s2Output.includes(MISLEADING_MARKER), true);
    assert.equal(s2Output.includes(WRITE_MARKER), false);

    console.log(
      `STRUCTURED_TMUX_IDENTITY_EVIDENCE ${JSON.stringify({
        public_tools: publicTools,
        identities: channels.map((channel) => tmuxMetadata(channel, 'evidence channel')),
        same_title: channels.every((channel) => channel.title === 'root'),
        same_cwd: channels.every((channel) => channel.cwd === commonCwd),
        misleading_output_session: 's2',
        misleading_output_contains_p1: true,
        selector_source: 'backend_metadata.tmux.session_name only',
        selected_session: selectedMetadata.session_name,
        list_get_identity_consistent: true,
        selected_pane_matches_host_p1: selectedMetadata.pane_id === actualP1Pane,
        write_marker_seen_in_p1: true,
        write_marker_seen_in_s2: false,
      })}`,
    );
  } finally {
    await client.close().catch(() => undefined);
    await tmux(socketName, 'kill-server').catch(() => undefined);
    rmSync(commonCwd, { recursive: true, force: true });
  }
});
