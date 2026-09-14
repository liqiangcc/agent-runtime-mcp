import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ConsoleEventBus, type ConsoleEvent } from '../src/events.js';
import { createRequestHandler, expectedAuthority } from '../src/http-app.js';
import { createLogger } from '../src/logger.js';
import { McpToolError, type ConsoleMcp, type TerminalControl, type ToolPayload } from '../src/mcp-client.js';

const TEXT_MARKER = 'SECRET_TEXT_MARKER_4c91';

class RecordingMcp implements ConsoleMcp {
  calls: { tool: string; channelId: string; text?: string; submit?: boolean; control?: string }[] = [];
  writeError: unknown = null;
  controlError: unknown = null;

  health(): Promise<ToolPayload> {
    return Promise.resolve({ health: { backend_kind: 'tmux', available: true } });
  }
  listChannels(): Promise<ToolPayload> {
    return Promise.resolve({ channels: [] });
  }
  getChannel(): Promise<ToolPayload> {
    return Promise.resolve({ channel: {} });
  }
  readChannel(): Promise<ToolPayload> {
    return Promise.resolve({ read: {} });
  }
  writeText(channelId: string, text: string, submit: boolean): Promise<ToolPayload> {
    this.calls.push({ tool: 'write_text', channelId, text, submit });
    return this.writeError ? Promise.reject(this.writeError) : Promise.resolve({ channel_id: channelId, submitted: submit });
  }
  sendControl(channelId: string, control: TerminalControl): Promise<ToolPayload> {
    this.calls.push({ tool: 'send_control', channelId, control });
    return this.controlError ? Promise.reject(this.controlError) : Promise.resolve({ channel_id: channelId, control });
  }
  waitChannelEvent(): Promise<ToolPayload> {
    return Promise.reject(new McpToolError('CAPABILITY_UNSUPPORTED', 'unused'));
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

interface Ctx {
  server: Server;
  port: number;
  authority: string;
  logs: string[];
  events: ConsoleEvent[];
}

async function startServer(mcp: ConsoleMcp): Promise<Ctx> {
  const logs: string[] = [];
  const events: ConsoleEvent[] = [];
  const bus = new ConsoleEventBus();
  bus.subscribe((event) => events.push(event));
  const logger = createLogger((line) => logs.push(line));
  const ctx: Ctx = { server: null as unknown as Server, port: 0, authority: '', logs, events };
  const server = createServer((req, res) => {
    void createRequestHandler({ mcp, events: bus, expectedHost: ctx.authority, publicDir, logger })(req, res);
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
  return new Promise((resolve) => ctx.server.close(() => resolve()));
}

function post(ctx: Ctx, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${ctx.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const CHANNEL = 'tmux:abcdef123456:0';

// fetch()/undici silently drops forbidden headers (Host, Origin); raw
// node:http is required to exercise the authority guard deterministically.
function postRaw(
  ctx: Ctx,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: ctx.port,
        path,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('C1: mismatched Host or Origin is rejected on both mutation routes', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  for (const route of ['text', 'control']) {
    const body = route === 'text' ? { text: 'x' } : { control: 'ENTER' };
    const badHost = await postRaw(ctx, `/api/channels/${CHANNEL}/${route}`, body, { host: 'evil.example' });
    assert.equal(badHost.status, 403, `${route} bad Host`);
    const badOrigin = await postRaw(ctx, `/api/channels/${CHANNEL}/${route}`, body, { origin: 'http://evil.example' });
    assert.equal(badOrigin.status, 403, `${route} bad Origin`);
  }
  assert.equal(mcp.calls.length, 0, 'rejected requests must not reach the adapter');
});

test('C2: same-host request without Origin is accepted; foreign Origin rejected', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const noOrigin = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'hello', submit: true });
  assert.equal(noOrigin.status, 200);
  assert.equal(mcp.calls.length, 1);

  const foreign = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'hello' }, { origin: 'https://foreign.example' });
  assert.equal(foreign.status, 403);
  assert.equal(mcp.calls.length, 1, 'foreign Origin must not reach the adapter');
});

test('C3: control values outside the closed enum are rejected before the adapter', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  for (const control of ['DELETE', 'BACKSPACE', 'enter', 'CTRL_C', 'SIGINT', 3, null]) {
    const res = await post(ctx, `/api/channels/${CHANNEL}/control`, { control });
    assert.equal(res.status, 400, `control ${JSON.stringify(control)} must be rejected`);
  }
  assert.equal(mcp.calls.length, 0);

  for (const control of ['ENTER', 'INTERRUPT', 'ESCAPE']) {
    const res = await post(ctx, `/api/channels/${CHANNEL}/control`, { control });
    assert.equal(res.status, 200);
  }
  assert.equal(mcp.calls.length, 3);
  assert.deepEqual(mcp.calls.map((c) => c.control), ['ENTER', 'INTERRUPT', 'ESCAPE']);
});

test('text send defaults submit=true and honors submit=false', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const res1 = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'hello' });
  assert.equal(res1.status, 200);
  assert.equal(mcp.calls[0].submit, true);

  const res2 = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'multi\nline', submit: false });
  assert.equal(res2.status, 200);
  assert.equal(mcp.calls[1].submit, false);

  const bad = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 42 });
  assert.equal(bad.status, 400);
  assert.equal(mcp.calls.length, 2);
});

test('C6: adapter TIMEOUT surfaces as ambiguous with exactly one adapter call', async (t) => {
  const mcp = new RecordingMcp();
  mcp.writeError = new McpToolError('TIMEOUT', 'write_text request timed out');
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const res = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'hi' });
  assert.equal(res.status, 504);
  const body = await res.json();
  assert.equal(body.error.code, 'TIMEOUT');
  assert.match(body.error.message, /ambiguous/i);
  assert.equal(mcp.calls.length, 1, 'no automatic retry after ambiguous timeout');
});

test('C8: exactly one user-turn event per delivered or ambiguous send; none for rejected', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const ok = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'turn one', submit: false });
  assert.equal(ok.status, 200);
  assert.equal(ctx.events.length, 1);
  const event = ctx.events[0];
  assert.equal(event.type, 'user-turn');
  assert.equal(event.channel_id, CHANNEL);
  if (event.type === 'user-turn') {
    assert.equal(event.text, 'turn one');
    assert.equal(event.submit, false);
    assert.equal(event.transport_result, 'delivered');
  }
  assert.ok(typeof event.sent_at === 'string' && event.sent_at.length > 0);

  const control = await post(ctx, `/api/channels/${CHANNEL}/control`, { control: 'ESCAPE' });
  assert.equal(control.status, 200);
  assert.equal(ctx.events.length, 2);
  const controlEvent = ctx.events[1];
  assert.equal(controlEvent.type, 'control');
  if (controlEvent.type === 'control') {
    assert.equal(controlEvent.control, 'ESCAPE');
    assert.equal(controlEvent.transport_result, 'delivered');
  }

  mcp.writeError = new McpToolError('TIMEOUT', 'timeout');
  const ambiguous = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'maybe' });
  assert.equal(ambiguous.status, 504);
  assert.equal(ctx.events.length, 3);
  assert.equal(ctx.events[2].transport_result, 'ambiguous');

  mcp.writeError = new McpToolError('INVALID_ARGUMENT', 'rejected Cc control');
  const rejected = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'bad' });
  assert.equal(rejected.status, 400);
  assert.equal(ctx.events.length, 3, 'rejected send emits no event');
});

test('rejected MCP errors map to HTTP status without an event', async (t) => {
  const mcp = new RecordingMcp();
  mcp.writeError = new McpToolError('CHANNEL_NOT_FOUND', 'channel not found');
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const res = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'hi' });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'CHANNEL_NOT_FOUND');
  assert.equal(ctx.events.length, 0);
});

test('C7: mutation logs never contain the sent text', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const res = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: TEXT_MARKER });
  assert.equal(res.status, 200);
  assert.ok(ctx.logs.length >= 2);
  for (const line of ctx.logs) {
    assert.ok(!line.includes(TEXT_MARKER), `log leaked text payload: ${line}`);
  }
  const mutationLog = ctx.logs.map((line) => JSON.parse(line)).find((r) => r.event === 'mutation');
  assert.equal(mutationLog.route, 'text');
  assert.equal(mutationLog.result, 'delivered');
  assert.equal(typeof mutationLog.bytes, 'number');
});

test('malformed and oversized bodies are rejected', async (t) => {
  const mcp = new RecordingMcp();
  const ctx = await startServer(mcp);
  t.after(() => closeServer(ctx));

  const malformed = await post(ctx, `/api/channels/${CHANNEL}/text`, '{not json');
  assert.equal(malformed.status, 400);

  const nonObject = await post(ctx, `/api/channels/${CHANNEL}/text`, '[1,2,3]');
  assert.equal(nonObject.status, 400);

  const huge = await post(ctx, `/api/channels/${CHANNEL}/text`, { text: 'x'.repeat(3 * 1024 * 1024) });
  assert.equal(huge.status, 413);
  assert.equal(mcp.calls.length, 0);
});
