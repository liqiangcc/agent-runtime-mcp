import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { connect as netConnect } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ConsoleEventBus } from '../src/events.js';
import { checkRequestAuthority, createRequestHandler, expectedAuthority, rejectUpgrade } from '../src/http-app.js';
import { HistoryHub } from '../src/observer.js';
import { createLogger } from '../src/logger.js';
import { McpToolError, McpUnavailableError, type ConsoleMcp, type ToolPayload } from '../src/mcp-client.js';

const MARKER = 'SENSITIVE_MARKER_9f8d27';

class StubMcp implements ConsoleMcp {
  constructor(private readonly channels: ToolPayload[] = []) {}
  health(): Promise<ToolPayload> {
    return Promise.resolve({ health: { backend_kind: 'tmux', available: true } });
  }
  listChannels(): Promise<ToolPayload> {
    return Promise.resolve({ channels: this.channels });
  }
  getChannel(channelId: string): Promise<ToolPayload> {
    const channel = this.channels.find((c) => c.channel_id === channelId);
    if (!channel) return Promise.reject(new McpToolError('CHANNEL_NOT_FOUND', 'channel not found'));
    return Promise.resolve({ channel });
  }
  readChannel(): Promise<ToolPayload> {
    return Promise.reject(new McpToolError('CAPABILITY_UNSUPPORTED', 'unused in this test'));
  }
  writeText(): Promise<ToolPayload> {
    return Promise.reject(new McpToolError('CAPABILITY_UNSUPPORTED', 'unused in this test'));
  }
  sendControl(): Promise<ToolPayload> {
    return Promise.reject(new McpToolError('CAPABILITY_UNSUPPORTED', 'unused in this test'));
  }
  waitChannelEvent(): Promise<ToolPayload> {
    return Promise.reject(new McpToolError('CAPABILITY_UNSUPPORTED', 'unused in this test'));
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

interface TestContext {
  server: Server;
  port: number;
  authority: string;
  logs: string[];
}

async function startServer(mcp: ConsoleMcp): Promise<TestContext> {
  const logs: string[] = [];
  const logger = createLogger((line) => logs.push(line));
  const ctx: TestContext = { server: null as unknown as Server, port: 0, authority: '', logs };
  const server = createServer((req, res) => {
    const events = new ConsoleEventBus();
    const history = new HistoryHub({ mcp, events });
    void createRequestHandler({ mcp, events, history, expectedHost: ctx.authority, publicDir, logger })(req, res);
  });
  server.on('upgrade', (req, socket) => rejectUpgrade(req, socket, ctx.authority, logger));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  ctx.server = server;
  ctx.port = address.port;
  ctx.authority = expectedAuthority('127.0.0.1', ctx.port);
  return ctx;
}

function closeServer(ctx: TestContext): Promise<void> {
  return new Promise((resolve) => ctx.server.close(() => resolve()));
}

function rawRequest(port: number, requestText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(port, '127.0.0.1');
    let data = '';
    socket.on('data', (chunk) => (data += chunk));
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
    socket.on('connect', () => socket.end(requestText));
    setTimeout(() => {
      socket.destroy();
      resolve(data);
    }, 2000).unref();
  });
}

test('requests with a mismatched Host or Origin are rejected', async (t) => {
  const ctx = await startServer(new StubMcp());
  t.after(() => closeServer(ctx));

  const ok = await new Promise<{ status: number }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: ctx.port, path: '/api/health' }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(ok.status, 200);

  for (const badHost of ['evil.example', `127.0.0.1:${ctx.port + 1}`, 'localhost']) {
    const res = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port: ctx.port, path: '/api/health', headers: { host: badHost } },
        (r) => {
          r.resume();
          resolve(r.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(res, 403, `host ${badHost} should be rejected`);
  }

  const badOrigin = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: ctx.port,
        path: '/api/health',
        headers: { origin: 'http://evil.example' },
      },
      (r) => {
        r.resume();
        resolve(r.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(badOrigin, 403);

  const goodOrigin = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: ctx.port,
        path: '/api/health',
        headers: { origin: `http://127.0.0.1:${ctx.port}` },
      },
      (r) => {
        r.resume();
        resolve(r.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(goodOrigin, 200);
});

test('a request without Host is rejected', async (t) => {
  const ctx = await startServer(new StubMcp());
  t.after(() => closeServer(ctx));
  const response = await rawRequest(ctx.port, 'GET /api/health HTTP/1.0\r\n\r\n');
  assert.match(response, /^HTTP\/1\.[01] 403/);
});

test('non-GET methods and upgrade requests are rejected', async (t) => {
  const ctx = await startServer(new StubMcp());
  t.after(() => closeServer(ctx));

  const post = await new Promise<number>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: ctx.port, path: '/api/channels', method: 'POST' }, (r) => {
      r.resume();
      resolve(r.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(post, 405);

  const upgrade = await rawRequest(
    ctx.port,
    `GET / HTTP/1.1\r\nHost: ${ctx.authority}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
  );
  assert.match(upgrade, /^HTTP\/1\.1 403/);

  const upgradeBadHost = await rawRequest(
    ctx.port,
    'GET / HTTP/1.1\r\nHost: evil.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
  );
  assert.match(upgradeBadHost, /^HTTP\/1\.1 403/);
});

test('checkRequestAuthority accepts only the bound authority', () => {
  const authority = '[fd7a:115c:a1e0::5]:8080';
  assert.equal(expectedAuthority('fd7a:115c:a1e0::5', 8080), authority);
  assert.equal(expectedAuthority('127.0.0.1', 8080), '127.0.0.1:8080');

  const fakeReq = (host?: string, origin?: string) =>
    ({ headers: { ...(host ? { host } : {}), ...(origin ? { origin } : {}) } }) as unknown as Parameters<
      typeof checkRequestAuthority
    >[0];
  assert.equal(checkRequestAuthority(fakeReq(authority), authority).ok, true);
  assert.equal(checkRequestAuthority(fakeReq(authority, `http://${authority}`), authority).ok, true);
  assert.equal(checkRequestAuthority(fakeReq('fd7a:115c:a1e0::5:8080'), authority).ok, false);
  assert.equal(checkRequestAuthority(fakeReq(undefined), authority).ok, false);
  assert.equal(checkRequestAuthority(fakeReq(authority, 'http://other.example'), authority).ok, false);
  assert.equal(checkRequestAuthority(fakeReq(authority, 'not-a-url'), authority).ok, false);
});

test('channel API maps MCP results and errors to HTTP', async (t) => {
  const channel = {
    channel_id: 'tmux:abcdef123456:0',
    backend_kind: 'tmux',
    state: 'available',
    capabilities: ['read', 'write-text', 'control', 'observe'],
    title: MARKER,
    cwd: '/tmp/work',
    backend_metadata: { tmux: { session_name: 'ops', window_id: '@1', window_index: 0, pane_id: '%1', pane_index: 0 } },
  };
  const ctx = await startServer(new StubMcp([channel]));
  t.after(() => closeServer(ctx));

  const listRes = await fetch(`http://127.0.0.1:${ctx.port}/api/channels`);
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.channels.length, 1);
  assert.equal(list.channels[0].channel_id, channel.channel_id);
  assert.equal(list.channels[0].backend_metadata.tmux.session_name, 'ops');

  const oneRes = await fetch(`http://127.0.0.1:${ctx.port}/api/channels/${encodeURIComponent(channel.channel_id)}`);
  assert.equal(oneRes.status, 200);
  const one = await oneRes.json();
  assert.equal(one.channel.channel_id, channel.channel_id);

  const missingRes = await fetch(`http://127.0.0.1:${ctx.port}/api/channels/${encodeURIComponent('tmux:000000000000:9')}`);
  assert.equal(missingRes.status, 404);
  const missing = await missingRes.json();
  assert.equal(missing.error.code, 'CHANNEL_NOT_FOUND');
});

test('MCP unavailability maps to an explicit unavailable response', async (t) => {
  class DownMcp extends StubMcp {
    override health(): Promise<ToolPayload> {
      return Promise.reject(new McpUnavailableError('connect failed'));
    }
    override listChannels(): Promise<ToolPayload> {
      return Promise.reject(new McpUnavailableError('connect failed'));
    }
  }
  const ctx = await startServer(new DownMcp());
  t.after(() => closeServer(ctx));

  const healthRes = await fetch(`http://127.0.0.1:${ctx.port}/api/health`);
  assert.equal(healthRes.status, 503);
  const health = await healthRes.json();
  assert.equal(health.error.code, 'MCP_UNAVAILABLE');

  const listRes = await fetch(`http://127.0.0.1:${ctx.port}/api/channels`);
  assert.equal(listRes.status, 503);
});

test('the session list page is served and traversal is impossible', async (t) => {
  const ctx = await startServer(new StubMcp());
  t.after(() => closeServer(ctx));

  const root = await fetch(`http://127.0.0.1:${ctx.port}/`);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type') ?? '', /text\/html/);
  const html = await root.text();
  // Stable Chat-first invariants: the page brand, the Sessions sidebar, and
  // the element IDs the bundled app.js wires (conversation + composer + SSE).
  assert.match(html, /<h1>Web Console<\/h1>/);
  assert.match(html, /Sessions/);
  for (const id of ['id="chat"', 'id="composer"', 'id="observe-banner"', 'id="raw-toggle"']) {
    assert.ok(html.includes(id), `required element ${id} missing`);
  }

  const traversal = await fetch(`http://127.0.0.1:${ctx.port}/%2e%2e/%2e%2e/package.json`);
  assert.equal(traversal.status, 404);

  const unknown = await fetch(`http://127.0.0.1:${ctx.port}/nope`);
  assert.equal(unknown.status, 404);
});

test('logs never contain channel payload content', async (t) => {
  const channel = {
    channel_id: 'tmux:abcdef123456:0',
    state: 'available',
    title: MARKER,
    cwd: '/tmp/secret-workdir',
    backend_metadata: { tmux: { session_name: 'ops' } },
  };
  const ctx = await startServer(new StubMcp([channel]));
  t.after(() => closeServer(ctx));

  await fetch(`http://127.0.0.1:${ctx.port}/api/channels`);
  await fetch(`http://127.0.0.1:${ctx.port}/api/health`);

  assert.ok(ctx.logs.length >= 2);
  for (const line of ctx.logs) {
    assert.ok(!line.includes(MARKER), `log line leaked payload: ${line}`);
    assert.ok(!line.includes('/tmp/secret-workdir'));
  }
  const requestLog = ctx.logs.map((line) => JSON.parse(line)).find((r) => r.event === 'http_request');
  assert.equal(requestLog.path, '/api/channels');
  assert.equal(requestLog.status, 200);
});

test('logger drops non-scalar fields', () => {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line));
  logger('probe', { payload: { secret: MARKER }, list: [MARKER], count: 3, ok: true });
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes(MARKER));
  const record = JSON.parse(lines[0]);
  assert.equal(record.count, 3);
  assert.equal(record.ok, true);
  assert.equal(record.payload, '[object]');
  assert.equal(record.list, '[array]');
});
