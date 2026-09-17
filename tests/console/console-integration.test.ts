import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

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
    assert.match(html, /agent-runtime-mcp Console/);
    assert.match(html, /Sessions/);
    for (const id of ['id="drawer"', 'id="composer"', 'id="recovery"', 'id="raw-toggle"', 'id="composer-plus"']) {
      assert.ok(html.includes(id), `required element ${id} missing`);
    }

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

test(
  'console text and control routes drive a real tmux pane (submit, no-submit, INTERRUPT)',
  { timeout: 90_000 },
  async (t) => {
    const socketName = `console-io-${process.pid}-${Date.now()}`;
    const sessionName = `conit-io-${process.pid}`;
    const port = 45_000 + (process.pid % 15_000);
    const authority = `127.0.0.1:${port}`;
    const consoleEnv: NodeJS.ProcessEnv = {
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: sessionName,
    };

    // The harness (not the Console) prepares a real interactive pane with echo
    // off, so read_channel assertions show command output only.
    await tmux(socketName, 'new-session', '-d', '-s', sessionName);
    await tmux(socketName, 'send-keys', '-t', sessionName, '-l', 'exec bash --noprofile --norc');
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');
    await waitFor(
      async () => (await tmux(socketName, 'list-panes', '-t', sessionName, '-F', '#{pane_current_command}')).trim() === 'bash',
    );
    await tmux(socketName, 'send-keys', '-t', sessionName, '-l', 'stty -echo');
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');

    const { child: consoleChild, stderr: consoleStderr } = spawnConsole(consoleEnv);
    t.after(() => {
      consoleChild.kill('SIGTERM');
    });
    t.after(async () => {
      await tmux(socketName, 'kill-server').catch(() => undefined);
    });

    // A second, direct MCP client supplies read_channel read-back evidence.
    const mcp = new Client({ name: 'console-it-readback', version: '0.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpEntry],
      cwd: repoRoot,
      env: { ...getDefaultEnvironment(), TMUX_SOCKET_NAME: socketName, TMUX_ALLOWED_SESSIONS: sessionName },
    });
    await mcp.connect(transport);
    t.after(() => mcp.close().catch(() => undefined));

    async function readText(): Promise<string> {
      const result = await mcp.callTool({ name: 'read_channel', arguments: { channel_id: channelId, lines: 50, bytes: 8192 } });
      const payload = result.structuredContent as { read?: { text?: string } };
      return payload?.read?.text ?? '';
    }

    async function waitForMarker(marker: string, present = true, timeoutMs = 10_000): Promise<void> {
      await waitFor(async () => (await readText()).includes(marker) === present, timeoutMs);
    }

    await waitFor(async () => {
      try {
        const res = await fetch(`http://${authority}/api/channels`);
        if (!res.ok) return false;
        const body = await res.json();
        return Array.isArray(body.channels) && body.channels.length === 1;
      } catch {
        return false;
      }
    });
    assert.ok(consoleChild.exitCode === null, `console exited early: ${consoleStderr()}`);

    const listBody = await (await fetch(`http://${authority}/api/channels`)).json();
    const channelId = listBody.channels[0].channel_id as string;

    async function post(route: string, body: unknown): Promise<{ status: number; body: { transport_result?: string; error?: { code?: string } } }> {
      const res = await fetch(`http://${authority}/api/channels/${encodeURIComponent(channelId)}/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }

    // C4a: submit=true delivers text plus one Enter; read_channel shows output.
    const sent = await post('text', { text: "printf 'C63_SUBMIT_OK\\n'", submit: true });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.transport_result, 'delivered');
    await waitForMarker('C63_SUBMIT_OK');

    // C4b: submit=false leaves the input unexecuted (no extra newline); the
    // explicit ENTER control then runs the pending line.
    const noSubmit = await post('text', { text: "printf 'C63_NOSUBMIT_OK\\n'", submit: false });
    assert.equal(noSubmit.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(!(await readText()).includes('C63_NOSUBMIT_OK'), 'submit=false must not execute the line');

    const enter = await post('control', { control: 'ENTER' });
    assert.equal(enter.status, 200);
    await waitForMarker('C63_NOSUBMIT_OK');

    // C5: INTERRUPT returns a sleeping pane to the prompt.
    const sleep = await post('text', { text: 'sleep 30', submit: true });
    assert.equal(sleep.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const interrupt = await post('control', { control: 'INTERRUPT' });
    assert.equal(interrupt.status, 200);
    const after = await post('text', { text: "printf 'C63_AFTER_INTERRUPT_OK\\n'", submit: true });
    assert.equal(after.status, 200);
    await waitForMarker('C63_AFTER_INTERRUPT_OK');

    // C5b (UI evidence): the served composer requires confirmation for INTERRUPT.
    const appJs = await (await fetch(`http://${authority}/app.js`)).text();
    assert.match(appJs, /confirm\(/);
    assert.match(appJs, /INTERRUPT/);
  },
);

test(
  'console chat history observes a real tmux pane (attach dedupe, block rules, viewer lifecycle)',
  { timeout: 120_000 },
  async (t) => {
    const socketName = `console-hist-${process.pid}-${Date.now()}`;
    const sessionName = `conit-hist-${process.pid}`;
    const port = 52_000 + (process.pid % 8_000);
    const authority = `127.0.0.1:${port}`;
    const consoleEnv: NodeJS.ProcessEnv = {
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      CONSOLE_OBSERVE_IDLE_MS: '400',
      CONSOLE_OBSERVE_TIMEOUT_MS: '2500',
      CONSOLE_OBSERVE_POLL_MS: '800',
      CONSOLE_TAIL_LINES: '200',
      CONSOLE_TAIL_BYTES: '65536',
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: sessionName,
    };

    await tmux(socketName, 'new-session', '-d', '-s', sessionName);
    await tmux(socketName, 'send-keys', '-t', sessionName, '-l', 'exec bash --noprofile --norc');
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');
    await waitFor(
      async () => (await tmux(socketName, 'list-panes', '-t', sessionName, '-F', '#{pane_current_command}')).trim() === 'bash',
    );
    await tmux(socketName, 'send-keys', '-t', sessionName, '-l', 'stty -echo');
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');

    const { child: consoleChild, stderr: consoleStderr } = spawnConsole(consoleEnv);
    t.after(() => {
      consoleChild.kill('SIGTERM');
    });
    t.after(async () => {
      await tmux(socketName, 'kill-server').catch(() => undefined);
    });

    await waitFor(async () => {
      try {
        const res = await fetch(`http://${authority}/api/channels`);
        if (!res.ok) return false;
        const body = await res.json();
        return Array.isArray(body.channels) && body.channels.length === 1;
      } catch {
        return false;
      }
    });
    assert.ok(consoleChild.exitCode === null, `console exited early: ${consoleStderr()}`);

    const listBody = await (await fetch(`http://${authority}/api/channels`)).json();
    const channelId = listBody.channels[0].channel_id as string;

    async function history(): Promise<{ state: string; ring: { entries: any[] } }> {
      const res = await fetch(`http://${authority}/api/channels/${encodeURIComponent(channelId)}/history`, { cache: 'no-store' });
      assert.equal(res.status, 200);
      return res.json();
    }

    async function waitHistory(pred: (h: { state: string; ring: { entries: any[] } }) => boolean, timeoutMs = 15_000): Promise<void> {
      await waitFor(async () => pred(await history()), timeoutMs);
    }

    function outputText(h: { ring: { entries: any[] } }): string {
      return h.ring.entries
        .filter((e) => e.kind === 'earlier_output' || e.kind === 'output_block')
        .map((e) => e.text)
        .join('\n');
    }

    function openEvents(): { close: () => void } {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: `/api/channels/${encodeURIComponent(channelId)}/events`, method: 'GET', headers: { host: authority } },
        (res) => {
          res.resume();
        },
      );
      req.end();
      return { close: () => req.destroy() };
    }

    async function post(route: string, body: unknown): Promise<number> {
      const res = await fetch(`http://${authority}/api/channels/${encodeURIComponent(channelId)}/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      await res.text();
      return res.status;
    }

    // ---- C2: attach while output is flowing; every marker lands exactly once ----
    await tmux(
      socketName,
      'send-keys',
      '-t',
      sessionName,
      '-l',
      'for i in 1 2 3 4 5 6 7 8 9 10; do printf "ATTACH_%s\\n" "$i"; sleep 0.2; done',
    );
    await tmux(socketName, 'send-keys', '-t', sessionName, 'Enter');

    const stream = openEvents();
    t.after(() => stream.close());

    await waitHistory((h) => h.state === 'live');
    await waitHistory((h) => {
      const text = outputText(h);
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((i) => text.includes(`ATTACH_${i}`));
    }, 20_000);

    const seen = outputText(await history());
    for (let i = 1; i <= 10; i += 1) {
      const count = seen.match(new RegExp(`ATTACH_${i}(?![0-9])`, 'g'))?.length ?? 0;
      assert.equal(count, 1, `ATTACH_${i} must appear exactly once (dedupe, no gap) — got ${count}`);
    }
    const kinds = (await history()).ring.entries.map((e) => e.kind);
    assert.ok(kinds.includes('earlier_output'), 'pre-attach output forms the earlier-output block');

    // ---- C3: send -> user turn -> output block -> paused; timeout is not a boundary ----
    assert.equal(await post('text', { text: "printf 'C62_TURN1_OUT\\n'", submit: true }), 200);
    await waitHistory((h) => h.ring.entries.some((e) => e.kind === 'user_turn' && e.text.includes('C62_TURN1_OUT')));
    await waitHistory((h) =>
      h.ring.entries.some((e) => e.kind === 'output_block' && e.text.includes('C62_TURN1_OUT')),
    );
    await waitHistory((h) =>
      h.ring.entries.some((e) => e.kind === 'output_block' && e.text.includes('C62_TURN1_OUT') && e.state === 'paused'),
    );

    // >2 observe timeouts pass: a wait timeout alone must not close the block.
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    const mid = await history();
    const block1 = mid.ring.entries.find((e) => e.kind === 'output_block' && e.text.includes('C62_TURN1_OUT'));
    assert.ok(block1 && block1.state !== 'closed', 'wait timeout must not close an output block');

    assert.equal(await post('text', { text: "printf 'C62_TURN2_OUT\\n'", submit: true }), 200);
    await waitHistory((h) => {
      const blocks = h.ring.entries.filter((e) => e.kind === 'output_block');
      const b1 = blocks.find((e) => e.text.includes('C62_TURN1_OUT'));
      const b2 = blocks.find((e) => e.text.includes('C62_TURN2_OUT'));
      return b1?.state === 'closed' && b2 !== undefined;
    });
    const afterSecond = await history();
    const turns = afterSecond.ring.entries.filter((e) => e.kind === 'user_turn');
    assert.equal(turns.length, 2, 'each Console send is one user turn');
    await waitHistory((h) =>
      h.ring.entries.some((e) => e.kind === 'output_block' && e.text.includes('C62_TURN2_OUT') && e.state === 'paused'),
    );

    // UI evidence: served composer/page wire SSE + block lifecycle state
    // (paused/closed is exposed on .block elements via data-state) + raw toggle.
    const appJs = await (await fetch(`http://${authority}/app.js`)).text();
    assert.match(appJs, /EventSource/);
    const readingJs = await (await fetch(`http://${authority}/reading.js`)).text();
    assert.match(readingJs, /dataset\.state/);
    const index = await (await fetch(`http://${authority}/`)).text();
    assert.match(index, /raw-toggle|Raw transcript/);

    // ---- C5: last viewer leaving stops the loop; re-attach resumes ----
    stream.close();
    await waitHistory((h) => h.state === 'idle', 10_000);

    assert.equal(await post('text', { text: "printf 'C62_UNSEEN_OUT\\n'", submit: true }), 200);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const unseen = await history();
    assert.ok(
      unseen.ring.entries.some((e) => e.kind === 'user_turn' && e.text.includes('C62_UNSEEN_OUT')),
      'the Console still records its own send while unobserved',
    );
    assert.ok(
      !outputText(unseen).includes('C62_UNSEEN_OUT'),
      'no output reads happen after the last viewer leaves',
    );

    const stream2 = openEvents();
    t.after(() => stream2.close());
    await waitHistory((h) => h.state === 'live');
    await waitHistory((h) => outputText(h).includes('C62_UNSEEN_OUT'), 15_000);
  },
);
