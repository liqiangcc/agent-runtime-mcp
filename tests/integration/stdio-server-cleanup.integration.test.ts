import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
type EvidenceEvent = { event: string; active: number };
type RpcResponse = { id?: number; result?: { structuredContent?: unknown }; error?: unknown };

async function tmux(socket: string, ...args: string[]) {
  return execFileAsync('tmux', ['-L', socket, ...args], { env: getDefaultEnvironment(), encoding: 'utf8', timeout: 5000 });
}

async function evidenceChannel(socketPath: string) {
  const events: EvidenceEvent[] = [];
  let resolveAdmitted!: () => void; let resolveCleaned!: () => void;
  const admitted = new Promise<void>((resolve) => { resolveAdmitted = resolve; });
  const cleaned = new Promise<void>((resolve) => { resolveCleaned = resolve; });
  const server = createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const event = JSON.parse(buffer.slice(0, newline)) as EvidenceEvent;
        buffer = buffer.slice(newline + 1); events.push(event);
        if (event.event === 'admitted') resolveAdmitted();
        if (event.event === 'cleaned') resolveCleaned();
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  return { events, admitted, cleaned, server };
}

function waitForExit(child: ChildProcess, timeoutMs = 3000) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('stdio production child did not exit')), timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

async function runProductionWait(mode: 'eof' | 'sigterm') {
  const socket = `agent-runtime-mcp-attempt6-${mode}-${process.pid}-${Date.now()}`;
  const session = `attempt6-${mode}-${process.pid}-${Date.now()}`;
  const evidencePath = `/tmp/agent-runtime-mcp-attempt6-${mode}-${process.pid}-${Date.now()}.sock`;
  await tmux(socket, 'new-session', '-d', '-s', session, 'sleep 70');
  const evidence = await evidenceChannel(evidencePath);
  const child = spawn(process.execPath, [join(process.cwd(), 'dist', 'src', 'server.js')], {
    cwd: process.cwd(), env: { ...getDefaultEnvironment(), TMUX_SOCKET_NAME: socket, TMUX_ALLOWED_SESSIONS: session, TMUX_TIMEOUT_MS: '5000', AGENT_RUNTIME_MCP_TEST_EVIDENCE_SOCKET: evidencePath },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: child.stdout! });
  const responses = new Map<number, (response: RpcResponse) => void>();
  lines.on('line', (line) => { try { const response = JSON.parse(line) as RpcResponse; if (response.id !== undefined) responses.get(response.id)?.(response); } catch { /* protocol diagnostics stay off stdout */ } });
  let nextId = 1;
  const call = (method: string, params: Record<string, unknown> = {}) => new Promise<RpcResponse>((resolve, reject) => {
    const id = nextId++; const timer = setTimeout(() => { responses.delete(id); reject(new Error(`RPC ${method} timed out`)); }, 5000);
    responses.set(id, (response) => { clearTimeout(timer); responses.delete(id); resolve(response); });
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'attempt6', version: '1' } });
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const listed = await call('tools/call', { name: 'list_channels', arguments: {} });
    const channelId = (listed.result?.structuredContent as { channels: Array<{ channel_id: string }> }).channels[0].channel_id;
    const observed = await call('tools/call', { name: 'get_channel', arguments: { channel_id: channelId, observe: true } });
    const cursor = (observed.result?.structuredContent as { observation: { cursor: string } }).observation.cursor;
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: 'wait_channel_event', arguments: { channel_id: channelId, after_cursor: cursor, idle_ms: 250, timeout_ms: 60000 } } })}\n`);
    await Promise.race([evidence.admitted, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('production waiter admission not observed')), 3000))]);
    if (mode === 'eof') child.stdin!.end(); else child.kill('SIGTERM');
    await Promise.race([evidence.cleaned, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('production waiter cleanup not observed')), 3000))]);
    await waitForExit(child);
    assert.deepEqual(evidence.events.map((event) => event.event), ['admitted', 'cleaned']);
    assert.equal(evidence.events.at(-1)?.active, 0);
    console.log(`STDIO_${mode.toUpperCase()}_CLEANUP_EVIDENCE`, JSON.stringify({ admitted: true, cleaned: true, events: evidence.events, trigger: mode }));
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    lines.close();
    await new Promise<void>((resolve) => evidence.server.close(() => resolve()));
    await tmux(socket, 'kill-server').catch(() => undefined);
  }
}

test('production stdio EOF closes admitted waiter through shared shutdown path', { timeout: 12000 }, async () => runProductionWait('eof'));
test('production stdio SIGTERM closes admitted waiter through shared shutdown path', { timeout: 12000 }, async () => runProductionWait('sigterm'));
