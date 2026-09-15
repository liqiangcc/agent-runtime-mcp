import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
// ws is a Console-only dependency — resolved from console/package.json so the
// runtime/MCP package never carries it.
const requireConsole = createRequire(join(repoRoot, 'console', 'package.json'));
const WebSocket: any = requireConsole('ws');
interface WsLike {
  send(data: string): void;
  close(): void;
  on(event: string, cb: (...args: any[]) => void): void;
}
const TMUX = process.env.TMUX_BIN ?? 'tmux';
const CONSOLE_SERVER = join(repoRoot, 'console', 'dist', 'src', 'server.js');
const MCP_SERVER = join(repoRoot, 'dist', 'src', 'server.js');
const TERM_SESSION = `conterm-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
const SOCKET = `mcp-test-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;

function tmux(...args: string[]) {
  return execFileAsync(TMUX, ['-L', SOCKET, ...args]);
}

/** Count tmux clients attached to the disposable server (baseline is 0). */
async function clientCount(): Promise<number> {
  try {
    const { stdout } = await tmux('list-clients', '-F', '#{client_name}');
    return stdout.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function waitForClients(expected: number, deadlineMs = 5_000): Promise<number> {
  const start = Date.now();
  let n = await clientCount();
  while (n !== expected && Date.now() - start < deadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    n = await clientCount();
  }
  return n;
}

async function waitForHealth(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`console exited early (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('console health endpoint did not become ready');
}

function openWs(base: string, path: string): Promise<{ ws: WsLike; status: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${base}${path}`) as WsLike;
    ws.on('open', () => resolve({ ws, status: 101 }));
    ws.on('unexpected-response', (_req: unknown, res: { statusCode?: number; socket?: { destroy(): void } }) => {
      res.socket?.destroy();
      resolve({ ws, status: res.statusCode ?? 0 });
    });
    ws.on('error', () => resolve({ ws, status: -1 }));
  });
}

function wsSend(ws: WsLike, msg: object): void {
  ws.send(JSON.stringify(msg));
}

test('terminal attach: WS/PTY input lands in the pane; close leaves no orphan client', async (t) => {
  await tmux('new-session', '-d', '-s', TERM_SESSION, '-x', '80', '-y', '24');
  await new Promise((resolve) => setTimeout(resolve, 800));

  const consolePort = 19850 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [CONSOLE_SERVER], {
    env: {
      ...process.env,
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(consolePort),
      CONSOLE_TERMINAL_ENABLED: 'true',
      CONSOLE_MAX_ATTACH: '1',
      TMUX_SOCKET_NAME: SOCKET,
      TMUX_ALLOWED_SESSIONS: TERM_SESSION,
      MCP_HOST_NAME: 'console-terminal-test',
      MCP_HOST_VERSION: '0.0.1-test',
      CONSOLE_ATTACH_PROTECTED: 'protected-agent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  const base = `127.0.0.1:${consolePort}`;
  await waitForHealth(`http://${base}/api/health`, child);

  const mcp = new Client({ name: 'terminal-readback', version: '0.0.1' });
  await mcp.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [MCP_SERVER],
      env: { ...process.env, TMUX_SOCKET_NAME: SOCKET, TMUX_ALLOWED_SESSIONS: TERM_SESSION },
      stderr: 'pipe',
    }),
  );
  t.after(() => mcp.close());

  // enabled probe advertises the feature + hard cap
  const probe = await fetch(`http://${base}/api/terminal`);
  assert.equal(probe.status, 200);
  assert.deepEqual(await probe.json(), { enabled: true, maxAttach: 1 });

  const list = await fetch(`http://${base}/api/channels`);
  assert.equal(list.status, 200);
  const { channels } = (await list.json()) as {
    channels: { channel_id: string; backend_metadata?: { tmux?: { session_name?: string } } }[];
  };
  const channel = channels.find((c) => c.backend_metadata?.tmux?.session_name === TERM_SESSION);
  assert.ok(channel, 'scoped session must appear through list_channels');
  const channelId = encodeURIComponent(channel.channel_id);

  assert.equal(await clientCount(), 0, 'baseline: no attached tmux clients');

  // C3: attach, type through the WS, observe via public read_channel
  const first = await openWs(base, `/api/channels/${channelId}/terminal?cols=80&rows=24`);
  assert.equal(first.status, 101);
  t.after(() => first.ws.close());
  assert.equal(await waitForClients(1), 1, 'attach must register one tmux client');

  const marker = `C64_TYPE_${Math.random().toString(16).slice(2, 8)}`;
  wsSend(first.ws, { type: 'input', data: `printf '%s\\n' ${marker}` });
  wsSend(first.ws, { type: 'input', data: '\n' });

  const deadline = Date.now() + 8_000;
  let tail = '';
  while (Date.now() < deadline) {
    const read = (await mcp.callTool({
      name: 'read_channel',
      arguments: { channel_id: channel.channel_id, lines: 40, bytes: 8192 },
    })) as { content?: { text?: string }[] };
    tail = String(read.content?.[0]?.text ?? '');
    if (tail.includes(marker)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(tail.includes(marker), `typed input must be visible through read_channel; got: ${tail.slice(-300)}`);

  // C5: the configured cap rejects a second concurrent attach
  const second = await openWs(base, `/api/channels/${channelId}/terminal`);
  assert.equal(second.status, 429);
  assert.equal(await clientCount(), 1, 'rejected attach must not add a client');

  // C4: closing the WS terminates the tmux client within bounded time
  first.ws.close();
  assert.equal(await waitForClients(0), 0, 'closed WS must not leave an orphan tmux client');

  // a fresh attach still works after cleanup
  const third = await openWs(base, `/api/channels/${channelId}/terminal`);
  assert.equal(third.status, 101);
  t.after(() => third.ws.close());
  assert.equal(await waitForClients(1), 1);
  third.ws.close();
  assert.equal(await waitForClients(0), 0);

  await tmux('kill-session', '-t', TERM_SESSION);
});
