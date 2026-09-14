import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { networkInterfaces } from 'node:os';
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

function tailscaleAssigned(): boolean {
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(info.address)) return true;
    }
  }
  return false;
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

async function expectBindRefused(bind: string, port: number, extraEnv: NodeJS.ProcessEnv): Promise<void> {
  const { child, stderr } = spawnConsole({ ...extraEnv, CONSOLE_BIND: bind, CONSOLE_PORT: String(port) });
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, 10_000);
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  assert.notEqual(code, 0, `CONSOLE_BIND=${bind} must be refused, stderr=${stderr()}`);
  assert.ok(stderr().includes('refusing to listen'), `expected refusal message for ${bind}, got: ${stderr()}`);
}

test(
  'console serves the session list through MCP only and refuses non-tailnet binds',
  { timeout: 90_000 },
  async (t) => {
    const socketName = `console-it-${process.pid}-${Date.now()}`;
    const allowedSession = `conit-ok-${process.pid}`;
    const deniedSession = `conit-hidden-${process.pid}`;
    const port = 20_000 + (process.pid % 20_000);
    const authority = `127.0.0.1:${port}`;
    const consoleEnv: NodeJS.ProcessEnv = {
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: allowedSession,
    };

    await tmux(socketName, 'new-session', '-d', '-s', allowedSession);
    await tmux(socketName, 'new-session', '-d', '-s', deniedSession);

    const { child: console_child, stderr: consoleStderr } = spawnConsole(consoleEnv);
    t.after(() => {
      console_child.kill('SIGTERM');
    });
    t.after(async () => {
      await tmux(socketName, 'kill-server').catch(() => undefined);
    });

    // C1: refused binds — wildcard, unspecified v6, a non-Tailscale LAN address,
    // and a Tailscale-range address that is not assigned to a local interface.
    const refusedBinds = ['0.0.0.0', '::', '192.168.203.17'];
    if (!tailscaleAssigned()) refusedBinds.push('100.64.0.1');
    for (const bind of refusedBinds) {
      await expectBindRefused(bind, port + 1, consoleEnv);
    }

    // Console starts on loopback and answers the JSON API.
    await waitFor(async () => {
      try {
        const res = await fetch(`http://${authority}/api/health`);
        return res.ok;
      } catch {
        return false;
      }
    });
    assert.ok(console_child.exitCode === null, `console exited early: ${consoleStderr()}`);

    const healthRes = await fetch(`http://${authority}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.health.available, true);
    assert.equal(healthBody.health.backend_kind, 'tmux');

    // C2: the list matches tmux inventory inside the allowlist scope.
    const paneSessions = (await tmux(socketName, 'list-panes', '-a', '-F', '#{session_name}'))
      .trim()
      .split('\n')
      .filter(Boolean);
    const expectedVisible = paneSessions.filter((name) => name === allowedSession).length;
    assert.ok(expectedVisible >= 1);

    const listRes = await fetch(`http://${authority}/api/channels`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.channels.length, expectedVisible);
    for (const channel of listBody.channels) {
      assert.equal(channel.backend_metadata.tmux.session_name, allowedSession);
      assert.equal(typeof channel.channel_id, 'string');
    }
    const sessionNames = listBody.channels.map((c: { backend_metadata?: { tmux?: { session_name?: string } } }) => c.backend_metadata?.tmux?.session_name);
    assert.ok(!sessionNames.includes(deniedSession), 'disallowed session must be absent');

    const channelId = listBody.channels[0].channel_id as string;
    const oneRes = await fetch(`http://${authority}/api/channels/${encodeURIComponent(channelId)}`);
    assert.equal(oneRes.status, 200);
    const oneBody = await oneRes.json();
    assert.equal(oneBody.channel.channel_id, channelId);

    const missingRes = await fetch(`http://${authority}/api/channels/${encodeURIComponent('tmux:000000000000:99')}`);
    assert.equal(missingRes.status, 404);

    // Session list page.
    const rootRes = await fetch(`http://${authority}/`);
    assert.equal(rootRes.status, 200);
    const html = await rootRes.text();
    assert.match(html, /Channels/);

    // C3: after the tmux server dies, health flips to unavailable and the
    // Console never recreates endpoints.
    await tmux(socketName, 'kill-server');
    await waitFor(async () => {
      try {
        const res = await fetch(`http://${authority}/api/health`);
        if (!res.ok) return false;
        const body = await res.json();
        return body.health?.available === false;
      } catch {
        return false;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await sessionExists(socketName, allowedSession), false, 'console must not recreate the endpoint');
    assert.ok(console_child.exitCode === null, 'console process must stay alive');
  },
);
