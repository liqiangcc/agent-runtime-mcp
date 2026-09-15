import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ConsoleEventBus } from '../src/events.js';
import { createRequestHandler, expectedAuthority, type LifecyclePort } from '../src/http-app.js';
import { HistoryHub } from '../src/observer.js';
import { createLogger } from '../src/logger.js';
import { LifecycleRefusal, LifecycleTmuxError, type CreateInput, type KillInput, type LifecycleResult } from '../src/session-lifecycle.js';
import { McpToolError, type ConsoleMcp, type TerminalControl, type ToolPayload } from '../src/mcp-client.js';

class StubMcp implements ConsoleMcp {
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

class StubLifecycle implements LifecyclePort {
  calls: { op: 'create' | 'kill'; input: unknown }[] = [];
  createError: unknown = null;
  killError: unknown = null;
  labels = ['shell'];

  createSession(input: CreateInput): Promise<LifecycleResult> {
    this.calls.push({ op: 'create', input });
    return this.createError ? Promise.reject(this.createError) : Promise.resolve({ ok: true, session: input.name });
  }
  killSession(input: KillInput): Promise<LifecycleResult> {
    this.calls.push({ op: 'kill', input });
    return this.killError ? Promise.reject(this.killError) : Promise.resolve({ ok: true, session: input.name });
  }
  profileLabels(): string[] {
    return this.labels;
  }
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

interface Ctx {
  server: Server;
  port: number;
  authority: string;
  logs: string[];
}

async function startServer(lifecycle: LifecyclePort | undefined): Promise<Ctx> {
  const logs: string[] = [];
  const logger = createLogger((line) => logs.push(line));
  const ctx: Ctx = { server: null as unknown as Server, port: 0, authority: '', logs };
  const mcp = new StubMcp();
  const history = new HistoryHub({ mcp, events: new ConsoleEventBus() });
  const server = createServer((req, res) => {
    void createRequestHandler({ mcp, events: new ConsoleEventBus(), history, expectedHost: ctx.authority, publicDir, logger, lifecycle })(req, res);
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

function post(ctx: Ctx, path: string, body: unknown) {
  return fetch(`http://127.0.0.1:${ctx.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

test('C4: lifecycle disabled exposes no surface — all lifecycle routes 404', async (t) => {
  const ctx = await startServer(undefined);
  t.after(() => closeServer(ctx));

  const probe = await fetch(`http://127.0.0.1:${ctx.port}/api/lifecycle`);
  assert.equal(probe.status, 404);
  const create = await post(ctx, '/api/lifecycle/sessions', { name: 's', cwd: '/tmp', profile: 'shell' });
  assert.equal(create.status, 404);
  const kill = await post(ctx, '/api/lifecycle/kill', { name: 's', confirm: true });
  assert.equal(kill.status, 404);
});

test('enabled lifecycle exposes profile labels on the capability probe', async (t) => {
  const lifecycle = new StubLifecycle();
  lifecycle.labels = ['shell', 'claude'];
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/lifecycle`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.enabled, true);
  assert.deepEqual(body.profiles, ['shell', 'claude']);
});

test('create accepts name/cwd/profile only and reaches the adapter verbatim', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  const res = await post(ctx, '/api/lifecycle/sessions', { name: 's1', cwd: '/tmp', profile: 'shell' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { session: 's1', created: true });
  assert.equal(lifecycle.calls.length, 1);
  const input = lifecycle.calls[0].input as CreateInput;
  assert.equal(input.name, 's1');
  assert.equal(input.cwd, '/tmp');
  assert.equal(input.profile, 'shell');
  assert.equal(input.actor, '127.0.0.1', 'actor is the socket peer address, not a body field');
});

test('C7: request body cannot spoof actor — extra keys 400; adapter gets the socket address', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  for (const body of [
    { name: 's1', cwd: '/tmp', profile: 'shell', actor: 'spoofed-admin' },
    { name: 's1', confirm: true, actor: 'spoofed-admin' },
  ]) {
    const route = 'cwd' in body ? '/api/lifecycle/sessions' : '/api/lifecycle/kill';
    const res = await post(ctx, route, body);
    assert.equal(res.status, 400, `actor field must be rejected: ${JSON.stringify(body)}`);
  }
  assert.equal(lifecycle.calls.length, 0, 'spoofed bodies never reach the adapter');

  const ok = await post(ctx, '/api/lifecycle/kill', { name: 's1', confirm: true });
  assert.equal(ok.status, 200);
  const input = lifecycle.calls[0].input as KillInput;
  assert.equal(input.actor, '127.0.0.1', 'audit actor is the mechanical socket peer address');
  assert.deepEqual(Object.keys(input).sort(), ['actor', 'name'], 'adapter receives only name + mechanical actor');
});

test('create rejects free-form command fields before the adapter', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  for (const extra of ['command', 'cmd', 'args', 'argv', 'shell', 'text']) {
    const res = await post(ctx, '/api/lifecycle/sessions', {
      name: 's1',
      cwd: '/tmp',
      profile: 'shell',
      [extra]: 'rm -rf /',
    });
    assert.equal(res.status, 400, `field ${extra} must be rejected`);
  }
  assert.equal(lifecycle.calls.length, 0);
});

test('create rejects missing or non-string fields before the adapter', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  for (const body of [
    {},
    { name: 's1' },
    { name: 's1', cwd: '/tmp' },
    { name: 's1', cwd: '/tmp', profile: 3 },
    { name: 's1', cwd: ['x'], profile: 'shell' },
    'not-an-object',
  ]) {
    const res = await post(ctx, '/api/lifecycle/sessions', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(lifecycle.calls.length, 0);
});

test('kill requires an explicit confirm:true before the adapter runs', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  for (const body of [
    { name: 's1' },
    { name: 's1', confirm: false },
    { name: 's1', confirm: 'yes' },
    { name: 's1', confirm: 1 },
    { name: 's1', confirm: true, extra: 1 },
  ]) {
    const res = await post(ctx, '/api/lifecycle/kill', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(lifecycle.calls.length, 0);

  const ok = await post(ctx, '/api/lifecycle/kill', { name: 's1', confirm: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(lifecycle.calls, [{ op: 'kill', input: { name: 's1', actor: '127.0.0.1' } }]);
});

test('adapter refusals map to 422 and tmux failures to 502', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  lifecycle.createError = new LifecycleRefusal('profile_not_allowlisted', 'profile "x" is not configured');
  const refused = await post(ctx, '/api/lifecycle/sessions', { name: 's1', cwd: '/tmp', profile: 'x' });
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).error.code, 'LIFECYCLE_REFUSED');

  lifecycle.createError = null;
  lifecycle.killError = new LifecycleRefusal('protected_session', 'session is protected');
  const protectedKill = await post(ctx, '/api/lifecycle/kill', { name: 'agent-runtime-keeper', confirm: true });
  assert.equal(protectedKill.status, 422);

  lifecycle.killError = new LifecycleTmuxError('exit 1');
  const failed = await post(ctx, '/api/lifecycle/kill', { name: 's1', confirm: true });
  assert.equal(failed.status, 502);
  const body = await failed.json();
  assert.equal(body.error.code, 'TMUX_ERROR');
  assert.equal(body.error.message, 'session operation failed', 'tmux stderr must not leak into the response');
});

test('lifecycle routes honor the same Origin/Host authority boundary', async (t) => {
  const lifecycle = new StubLifecycle();
  const ctx = await startServer(lifecycle);
  t.after(() => closeServer(ctx));

  const badHost = await postRaw(ctx, '/api/lifecycle/sessions', { name: 's', cwd: '/tmp', profile: 'shell' }, { host: 'evil.example' });
  assert.equal(badHost.status, 403);
  const badOrigin = await postRaw(ctx, '/api/lifecycle/kill', { name: 's', confirm: true }, { origin: 'http://evil.example' });
  assert.equal(badOrigin.status, 403);
  assert.equal(lifecycle.calls.length, 0, 'rejected requests must not reach the adapter');
});
