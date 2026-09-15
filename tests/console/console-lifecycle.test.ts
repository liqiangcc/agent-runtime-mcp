import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const consoleEntry = join(repoRoot, 'console', 'dist', 'src', 'server.js');
const mcpEntry = join(repoRoot, 'dist', 'src', 'server.js');

async function tmux(socketName: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], { encoding: 'utf8', timeout: 5000 });
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

function spawnConsole(env: NodeJS.ProcessEnv): { child: ChildProcess; stderr: () => string } {
  let stderr = '';
  const child = spawn(process.execPath, [consoleEntry], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.on('data', (chunk) => (stderr += chunk));
  return { child, stderr: () => stderr };
}

async function post(authority: string, path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://${authority}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function channelNames(authority: string): Promise<string[]> {
  const res = await fetch(`http://${authority}/api/channels`, { cache: 'no-store' });
  const body = await res.json();
  return (body.channels ?? []).map(
    (c: { backend_metadata?: { tmux?: { session_name?: string } } }) => c.backend_metadata?.tmux?.session_name,
  );
}

test(
  'C2: lifecycle API creates an in-scope session visible via MCP list_channels, kills it, and never kills the protected keeper',
  { timeout: 90_000 },
  async (t) => {
    const socketName = `console-lc-${process.pid}-${Date.now()}`;
    const keeper = 'agent-runtime-keeper';
    const createdName = `conlc-new-${process.pid}`;
    const port = 30_000 + (process.pid % 15_000);
    const authority = `127.0.0.1:${port}`;
    const consoleEnv: NodeJS.ProcessEnv = {
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      CONSOLE_LIFECYCLE_ENABLED: 'true',
      CONSOLE_LIFECYCLE_PROFILES: JSON.stringify({ shell: { argv: ['sleep', '300'] } }),
      CONSOLE_ALLOWED_CWD_ROOTS: JSON.stringify([repoRoot]),
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: `${keeper},${createdName}`,
    };

    await tmux(socketName, 'new-session', '-d', '-s', keeper);

    const { child: consoleChild, stderr: consoleStderr } = spawnConsole(consoleEnv);
    t.after(() => {
      consoleChild.kill('SIGTERM');
    });
    t.after(async () => {
      await tmux(socketName, 'kill-server').catch(() => undefined);
    });

    await waitFor(async () => {
      try {
        const res = await fetch(`http://${authority}/api/health`);
        return res.ok;
      } catch {
        return false;
      }
    });
    assert.ok(consoleChild.exitCode === null, `console exited early: ${consoleStderr()}`);

    // Capability probe: enabled lifecycle exposes the operator profile set.
    const probe = await fetch(`http://${authority}/api/lifecycle`);
    assert.equal(probe.status, 200);
    const probeBody = await probe.json();
    assert.equal(probeBody.enabled, true);
    assert.deepEqual(probeBody.profiles, ['shell']);

    // Out-of-scope names are refused before tmux runs.
    const outOfScope = await post(authority, '/api/lifecycle/sessions', {
      name: 'not-in-scope',
      cwd: repoRoot,
      profile: 'shell',
    });
    assert.equal(outOfScope.status, 422);
    assert.equal(await sessionExists(socketName, 'not-in-scope'), false);

    // Create: in-scope name + allowed cwd + allowlisted profile -> real session.
    const created = await post(authority, '/api/lifecycle/sessions', {
      name: createdName,
      cwd: repoRoot,
      profile: 'shell',
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.session, createdName);
    assert.equal(await sessionExists(socketName, createdName), true);

    // The created session is a first-class channel via public MCP inventory.
    await waitFor(async () => (await channelNames(authority)).includes(createdName));

    // Kill without explicit confirmation is refused; the session survives.
    const unconfirmed = await post(authority, '/api/lifecycle/kill', { name: createdName });
    assert.equal(unconfirmed.status, 400);
    assert.equal(await sessionExists(socketName, createdName), true);

    // The protected keeper is refused even inside the allowlist scope.
    const protectedKill = await post(authority, '/api/lifecycle/kill', { name: keeper, confirm: true });
    assert.equal(protectedKill.status, 422);
    assert.equal(protectedKill.body.error?.code, 'LIFECYCLE_REFUSED');
    assert.equal(await sessionExists(socketName, keeper), true, 'protected keeper must survive');

    // Confirmed kill destroys the session; MCP inventory drops it.
    const killed = await post(authority, '/api/lifecycle/kill', { name: createdName, confirm: true });
    assert.equal(killed.status, 200, JSON.stringify(killed.body));
    assert.equal(await sessionExists(socketName, createdName), false);
    await waitFor(async () => !(await channelNames(authority)).includes(createdName));

    // The keeper is still alive at the end.
    assert.equal(await sessionExists(socketName, keeper), true);
  },
);

test('C4: lifecycle routes 404 end-to-end when the deployment flag is off', { timeout: 60_000 }, async (t) => {
  const socketName = `console-lcoff-${process.pid}-${Date.now()}`;
  const sessionName = `conlc-off-${process.pid}`;
  const port = 30_000 + ((process.pid + 7_777) % 15_000);
  const authority = `127.0.0.1:${port}`;
  const consoleEnv: NodeJS.ProcessEnv = {
    CONSOLE_BIND: '127.0.0.1',
    CONSOLE_PORT: String(port),
    CONSOLE_MCP_ENTRY: mcpEntry,
    TMUX_SOCKET_NAME: socketName,
    TMUX_ALLOWED_SESSIONS: sessionName,
  };

  await tmux(socketName, 'new-session', '-d', '-s', sessionName);

  const { child: consoleChild, stderr: consoleStderr } = spawnConsole(consoleEnv);
  t.after(() => {
    consoleChild.kill('SIGTERM');
  });
  t.after(async () => {
    await tmux(socketName, 'kill-server').catch(() => undefined);
  });

  await waitFor(async () => {
    try {
      const res = await fetch(`http://${authority}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  });
  assert.ok(consoleChild.exitCode === null, `console exited early: ${consoleStderr()}`);

  assert.equal((await fetch(`http://${authority}/api/lifecycle`)).status, 404);
  const created = await post(authority, '/api/lifecycle/sessions', { name: 's', cwd: repoRoot, profile: 'shell' });
  assert.equal(created.status, 404);
  const killed = await post(authority, '/api/lifecycle/kill', { name: sessionName, confirm: true });
  assert.equal(killed.status, 404);
  assert.equal(await sessionExists(socketName, sessionName), true, 'a 404 surface must not mutate tmux');

  // Served UI hides the lifecycle controls when disabled.
  const index = await (await fetch(`http://${authority}/`)).text();
  assert.match(index, /id="lifecycle"[^>]*hidden/);
});
