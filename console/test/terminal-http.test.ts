import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';
import { ConsoleEventBus } from '../src/events.js';
import { createRequestHandler, createUpgradeHandler, expectedAuthority } from '../src/http-app.js';
import { HistoryHub } from '../src/observer.js';
import { createLogger } from '../src/logger.js';
import { loadConfig } from '../src/config.js';
import { TerminalAttach, type PtyProcess } from '../src/terminal-attach.js';
import { McpToolError, type ConsoleMcp, type ToolPayload } from '../src/mcp-client.js';

const CHANNEL = 'tmux:abcdef123456:0';
const TMUX_META = { session_name: 'allowed-1', window_id: '@1', pane_id: '%3' };

class FakeMcp implements ConsoleMcp {
  channelPayload: ToolPayload = { channel: { channel_id: CHANNEL, backend_metadata: { tmux: TMUX_META } } };
  getChannelError: unknown = null;

  health(): Promise<ToolPayload> {
    return Promise.resolve({ health: { backend_kind: 'tmux', available: true } });
  }
  listChannels(): Promise<ToolPayload> {
    return Promise.resolve({ channels: [] });
  }
  getChannel(): Promise<ToolPayload> {
    return this.getChannelError ? Promise.reject(this.getChannelError) : Promise.resolve(this.channelPayload);
  }
  readChannel(): Promise<ToolPayload> {
    return Promise.resolve({ read: {} });
  }
  writeText(): Promise<ToolPayload> {
    return Promise.resolve({});
  }
  sendControl(): Promise<ToolPayload> {
    return Promise.resolve({});
  }
  waitChannelEvent(): Promise<ToolPayload> {
    return Promise.reject(new McpToolError('CAPABILITY_UNSUPPORTED', 'unused'));
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakePty implements PtyProcess {
  written: string[] = [];
  resizes: { cols: number; rows: number }[] = [];
  killed = false;
  private dataCb: ((d: string) => void) | null = null;
  private exitCb: ((e: { exitCode: number }) => void) | null = null;
  write(data: string): void {
    this.written.push(data);
  }
  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }
  kill(): void {
    this.killed = true;
  }
  onData(cb: (d: string) => void): void {
    this.dataCb = cb;
  }
  onExit(cb: (e: { exitCode: number }) => void): void {
    this.exitCb = cb;
  }
  emitData(d: string): void {
    this.dataCb?.(d);
  }
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

interface Ctx {
  server: Server;
  port: number;
  authority: string;
  logs: string[];
  mcp: FakeMcp;
  ptys: FakePty[];
  argvLog: string[][];
  sockets: Set<Duplex>;
  terminal?: TerminalAttach;
}

async function startServer(env: NodeJS.ProcessEnv): Promise<Ctx> {
  const logs: string[] = [];
  const logger = createLogger((line) => logs.push(line));
  const ptys: FakePty[] = [];
  const argvLog: string[][] = [];
  const mcp = new FakeMcp();
  const ctx: Ctx = {
    server: null as unknown as Server,
    port: 0,
    authority: '',
    logs,
    mcp,
    ptys,
    argvLog,
    sockets: new Set(),
  };
  const config = loadConfig(env);
  const terminal = config.terminal.enabled
    ? new TerminalAttach({
        config,
        logger,
        spawner: (argv) => {
          argvLog.push(argv);
          const pty = new FakePty();
          ptys.push(pty);
          return pty;
        },
      })
    : undefined;
  ctx.terminal = terminal;
  const events = new ConsoleEventBus();
  const history = new HistoryHub({ mcp, events });
  const deps = { mcp, events, history, expectedHost: '', publicDir, logger, terminal };
  const server = createServer((req, res) => {
    deps.expectedHost = ctx.authority;
    void createRequestHandler(deps)(req, res);
  });
  // Upgraded WebSocket sockets keep server.close() waiting — track every
  // socket so teardown can destroy them deterministically.
  const track = (socket: Duplex): void => {
    ctx.sockets.add(socket);
    socket.on('close', () => ctx.sockets.delete(socket));
  };
  server.on('connection', track);
  const upgrade = createUpgradeHandler(deps);
  server.on('upgrade', (req, socket, head) => {
    track(socket);
    deps.expectedHost = ctx.authority;
    void upgrade(req, socket, head);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  ctx.server = server;
  ctx.port = address.port;
  ctx.authority = expectedAuthority('127.0.0.1', ctx.port);
  return ctx;
}

function closeServer(ctx: Ctx): Promise<void> {
  for (const socket of ctx.sockets) socket.destroy();
  return new Promise((resolve) => ctx.server.close(() => resolve()));
}

/** Raw upgrade attempt — the HTTP status line is the observable result. */
function tryUpgrade(ctx: Ctx, path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port: ctx.port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        host: ctx.authority,
        ...headers,
      },
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('upgrade', (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on('error', () => resolve(-1));
    req.end();
  });
}

function openWs(ctx: Ctx, path: string): Promise<{ ws: WebSocket; status: number }> {
  return new Promise((resolve) => {
    // bounded: a regression must fail the test, not hang the suite
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ ws, status: -2 });
    }, 5_000);
    const settle = (status: number): void => {
      clearTimeout(timer);
      resolve({ ws, status });
    };
    const ws = new WebSocket(`ws://${ctx.authority}${path}`);
    ws.on('open', () => settle(101));
    ws.on('unexpected-response', (_req, res) => {
      // rejected-upgrade sockets are not closed automatically — destroy so the
      // handle does not outlive the test
      res.socket.destroy();
      settle(res.statusCode ?? 0);
    });
    ws.on('error', () => settle(-1));
  });
}

const ENABLED_ENV: NodeJS.ProcessEnv = {
  CONSOLE_TERMINAL_ENABLED: 'true',
  TMUX_ALLOWED_SESSIONS: 'allowed-1,allowed-2',
  TMUX_SOCKET_NAME: 'agents',
};

test('C6: terminal disabled — probe 404 and every upgrade refused', async (t) => {
  const ctx = await startServer({});
  t.after(() => closeServer(ctx));

  const probe = await fetch(`http://${ctx.authority}/api/terminal`);
  assert.equal(probe.status, 404);
  assert.equal(await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal`), 403);
  assert.equal(ctx.ptys.length, 0);

  // static assets exist for when the operator enables the feature
  for (const asset of ['/terminal.html', '/terminal.js', '/vendor/xterm.js', '/vendor/xterm.css', '/vendor/addon-fit.js']) {
    const res = await fetch(`http://${ctx.authority}${asset}`);
    assert.equal(res.status, 200, asset);
    await res.arrayBuffer();
  }
});

test('enabled probe reports the cap; non-terminal upgrades still refused', async (t) => {
  const ctx = await startServer({ ...ENABLED_ENV, CONSOLE_MAX_ATTACH: '2' });
  t.after(() => closeServer(ctx));

  const probe = await fetch(`http://${ctx.authority}/api/terminal`);
  assert.equal(probe.status, 200);
  const body = await probe.json();
  assert.deepEqual(body, { enabled: true, maxAttach: 2 });

  assert.equal(await tryUpgrade(ctx, '/api/terminal'), 403, 'the probe path is not an upgrade endpoint');
  assert.equal(await tryUpgrade(ctx, `/api/channels/${CHANNEL}/events`), 403);
});

test('upgrade requires the same Origin/Host authority', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  assert.equal(await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal`, { host: 'evil.example' }), 403);
  assert.equal(await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal`, { origin: 'http://evil.example' }), 403);
  assert.equal(ctx.ptys.length, 0);
});

test('channel resolution goes through get_channel only — unknown channel 404s, no tmux metadata 403s', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  ctx.mcp.getChannelError = new McpToolError('CHANNEL_NOT_FOUND', 'no such channel');
  assert.equal(await tryUpgrade(ctx, '/api/channels/tmux:000000000000:9/terminal'), 404);

  ctx.mcp.getChannelError = null;
  ctx.mcp.channelPayload = { channel: { channel_id: CHANNEL, backend_metadata: {} } };
  assert.equal(await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal`), 403);

  // out-of-scope session resolved from metadata is refused before spawn
  ctx.mcp.channelPayload = { channel: { channel_id: CHANNEL, backend_metadata: { tmux: { session_name: 'hidden' } } } };
  assert.equal(await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal`), 403);
  assert.equal(ctx.ptys.length, 0, 'no pty may spawn for refused upgrades');
});

test('WS bridge: output flows server→client, input client→pty, close disposes the pty', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  const { ws, status } = await openWs(ctx, `/api/channels/${CHANNEL}/terminal?cols=120&rows=40`);
  assert.equal(status, 101);
  t.after(() => ws.close());
  const pty = ctx.ptys[0];
  assert.ok(pty, 'a pty was spawned');
  assert.deepEqual(ctx.argvLog[0].slice(0, 5), ['-L', 'agents', ['attach', 'session'].join('-'), '-t', 'allowed-1']);

  const received: string[] = [];
  ws.on('message', (data) => received.push(String(data)));
  pty.emitData('PROMPT> ');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(received, ['PROMPT> ']);

  ws.send(JSON.stringify({ type: 'input', data: 'ls\n' }));
  ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
  ws.send('{"bogus":true}');
  ws.send('not json at all');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(pty.written, ['ls\n']);
  assert.deepEqual(pty.resizes, [{ cols: 100, rows: 30 }]);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(pty.killed, true, 'WS close must kill the pty');
});

test('C5: cap rejects the second concurrent attach with 429, first survives', async (t) => {
  const ctx = await startServer({ ...ENABLED_ENV, CONSOLE_MAX_ATTACH: '1' });
  t.after(() => closeServer(ctx));

  const first = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(first.status, 101);
  t.after(() => first.ws.close());

  const second = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(second.status, 429);
  assert.equal(ctx.ptys.length, 1, 'rejected attach must not spawn a pty');

  first.ws.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(ctx.terminal?.activeCount(), 0, 'closed attach releases its slot');
  const third = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(third.status, 101, 'cap slot frees after close');
  t.after(() => third.ws.close());
});

test('upgrade query whitelist: only cols/rows — tmux-like keys are refused before any resolution', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  for (const suffix of ['?target=allowed-1', '?session=allowed-1', '?pane=%1', '?cols=80&rows=24&x=1']) {
    assert.equal(
      await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal${suffix}`),
      400,
      suffix,
    );
  }
  assert.equal(ctx.ptys.length, 0, 'no resolution or spawn for whitelisted-key violations');
});

test('malformed handshake on the terminal route never spawns or orphans a pty', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  // Authority-valid upgrade with a broken handshake: reserve() holds only a
  // cap slot — spawn happens in the successful-upgrade callback, so an
  // aborted handshake leaves pty count, active and reserved all at zero.
  for (const badHeaders of [
    { 'sec-websocket-version': '12' },
    { 'sec-websocket-key': 'not-a-valid-key' },
  ] as Record<string, string>[]) {
    const status = await tryUpgrade(ctx, `/api/channels/${CHANNEL}/terminal`, badHeaders);
    assert.notEqual(status, 101, `malformed handshake must not upgrade (got ${status})`);
    assert.ok(status >= 400 && status < 500, `expected a refused handshake, got ${status}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(ctx.ptys.length, 0, 'no pty may spawn for a handshake that fails');
  assert.equal(ctx.terminal?.activeCount(), 0, 'no cap slot is held');
  assert.equal(ctx.terminal?.reservedCount(), 0, 'reservations are released on handshake failure');

  // the released slot is usable — a valid upgrade still attaches
  const { ws, status } = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(status, 101, 'released reservation slot is reusable');
  t.after(() => ws.close());
  assert.equal(ctx.ptys.length, 1, 'valid upgrade commits exactly one pty');
  assert.equal(ctx.terminal?.reservedCount(), 0, 'commit consumes the reservation');
});

test('oversized input frames are dropped before reaching the pty', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  const { ws, status } = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(status, 101);
  t.after(() => ws.close());
  const pty = ctx.ptys[0];
  assert.ok(pty);

  ws.send(JSON.stringify({ type: 'input', data: 'x'.repeat(20 * 1024) }));
  ws.send(JSON.stringify({ type: 'input', data: 'ok' }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(pty.written, ['ok'], 'only within-bound input reaches the pty');
});

test('ws parser hard limit: a frame over maxPayload closes the socket and never reaches the pty', async (t) => {
  const ctx = await startServer(ENABLED_ENV);
  t.after(() => closeServer(ctx));

  const { ws, status } = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(status, 101);
  const pty = ctx.ptys[0];
  assert.ok(pty);
  assert.equal(ctx.terminal?.activeCount(), 1);

  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  ws.send('x'.repeat(80 * 1024)); // well over the 64 KiB parser maxPayload
  const code = await Promise.race([
    closed,
    new Promise<number>((resolve) => setTimeout(() => resolve(-1), 5_000)),
  ]);
  assert.equal(code, 1009, 'parser must close oversize frames with 1009 message too big');
  assert.deepEqual(pty.written, [], 'oversized frame never reaches the pty');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(pty.killed, true, 'pty dies with the closed socket');
  assert.equal(ctx.terminal?.activeCount(), 0);

  const fresh = await openWs(ctx, `/api/channels/${CHANNEL}/terminal`);
  assert.equal(fresh.status, 101, 'cap slot is released after parser-killed close');
  assert.equal(ctx.ptys.length, 2, 'fresh attach commits a second pty');
  fresh.ws.close();
  const deadline = Date.now() + 5_000;
  while (ctx.terminal?.activeCount() !== 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(ctx.terminal?.activeCount(), 0, 'closing the fresh socket releases the slot');
});
