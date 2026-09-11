import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import type { PhaseDiagnosticRecord } from '../../src/phase-diagnostics.js';

const execFileAsync = promisify(execFile);
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'wait_channel_event', 'write_text'];
type RpcResponse = { id?: number; result?: { isError?: boolean; structuredContent?: Record<string, unknown>; tools?: Array<{ name: string }> }; error?: unknown };

async function tmux(socket: string, ...args: string[]): Promise<void> {
  await execFileAsync('tmux', ['-L', socket, ...args], { env: getDefaultEnvironment(), encoding: 'utf8', timeout: 5000 });
}

async function waitForFixture(socket: string, session: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const captured = await execFileAsync('tmux', ['-L', socket, 'capture-pane', '-p', '-t', session, '-S', '-100'], {
      env: getDefaultEnvironment(), encoding: 'utf8', timeout: 5000,
    });
    if (captured.stdout.includes('SENSITIVE_PHASE_SENTINEL')) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('isolated fixture did not produce sentinel');
}

async function runProbe(enabled: boolean): Promise<{ stdout: string[]; stderr: string; responses: Map<number, RpcResponse>; readShape?: { line_count?: number; byte_count?: number; truncated?: boolean } }> {
  const socket = `phase-diag-${process.pid}-${Date.now()}-${enabled ? 'on' : 'off'}`;
  const session = `phase-diag-${process.pid}-${Date.now()}`;
  await tmux(socket, 'new-session', '-d', '-s', session, 'bash', '-lc', "for i in 1 2 3 4 5; do printf 'SENSITIVE_PHASE_SENTINEL\\n'; done; sleep 30");
  await waitForFixture(socket, session);
  const child = spawn(process.execPath, [join(process.cwd(), 'dist', 'src', 'server.js')], {
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      TMUX_SOCKET_NAME: socket,
      TMUX_ALLOWED_SESSIONS: session,
      TMUX_TIMEOUT_MS: '5000',
      ...(enabled ? { AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS: '1' } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout: string[] = [];
  let stderr = '';
  const responses = new Map<number, RpcResponse>();
  let readShape: { line_count?: number; byte_count?: number; truncated?: boolean } | undefined;
  const pending = new Map<number, (response: RpcResponse) => void>();
  const lines = createInterface({ input: child.stdout! });
  lines.on('line', (line) => {
    stdout.push(line);
    try {
      const response = JSON.parse(line) as RpcResponse;
      if (response.id !== undefined) {
        responses.set(response.id, response);
        pending.get(response.id)?.(response);
      }
    } catch {
      // A malformed stdout line is asserted by the response parser below.
    }
  });
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  let nextId = 1;
  const call = (method: string, params: Record<string, unknown> = {}) => new Promise<RpcResponse>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} response timeout`)); }, 5000);
    pending.set(id, (response) => { clearTimeout(timer); pending.delete(id); resolve(response); });
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'phase-diagnostics-test', version: '1' } });
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const listed = await call('tools/list');
    assert.deepEqual(listed.result?.tools?.map((tool) => tool.name).sort(), EXPECTED_TOOLS);
    const list = await call('tools/call', { name: 'list_channels', arguments: {} });
    const channelId = ((list.result?.structuredContent as { channels?: Array<{ channel_id: string }> } | undefined)?.channels ?? [])[0]?.channel_id;
    assert.equal(typeof channelId, 'string');
    const observed = await call('tools/call', { name: 'get_channel', arguments: { channel_id: channelId, observe: true } });
    const cursor = (observed.result?.structuredContent as { observation?: { cursor: string } } | undefined)?.observation?.cursor;
    assert.equal(typeof cursor, 'string');
    const read = await call('tools/call', { name: 'read_channel', arguments: { channel_id: channelId, lines: 20, bytes: 4096 } });
    const readPayload = read.result?.structuredContent as { read?: { byte_count?: number; line_count?: number; truncated?: boolean; text?: string } } | undefined;
    assert.equal(typeof readPayload?.read?.byte_count, 'number');
    assert.match(readPayload?.read?.text ?? '', /SENSITIVE_PHASE_SENTINEL/);
    readShape = readPayload?.read;
    await call('tools/call', { name: 'write_text', arguments: { channel_id: channelId, text: 'SENSITIVE_WRITE_SENTINEL', submit: false } });
    await call('tools/call', { name: 'send_control', arguments: { channel_id: channelId, control: 'ESCAPE' } });
    const health = await call('tools/call', { name: 'health', arguments: {} });
    assert.equal(health.result?.structuredContent && typeof health.result.structuredContent.health, 'object');
    const waited = await call('tools/call', { name: 'wait_channel_event', arguments: { channel_id: channelId, after_cursor: cursor, idle_ms: 250, timeout_ms: 100 } });
    assert.equal(typeof waited.result?.structuredContent?.reason, 'string');
    const invalid = await call('tools/call', { name: 'read_channel', arguments: { channel_id: 'tmux:invalid:0', lines: 1, bytes: 1 } });
    assert.equal(invalid.result?.isError, true);
  } finally {
    child.stdin!.end();
    await Promise.race([once(child, 'exit'), new Promise((_, reject) => setTimeout(() => reject(new Error('diagnostic child did not exit')), 5000))]);
    lines.close();
    await tmux(socket, 'kill-server').catch(() => undefined);
  }
  return { stdout, stderr, responses, readShape };
}

function diagnosticRecords(stderr: string): PhaseDiagnosticRecord[] {
  return stderr.split('\n').filter(Boolean).map((line) => JSON.parse(line) as PhaseDiagnosticRecord);
}

test('disabled diagnostics are silent and enabled stdio keeps stdout protocol separate', { timeout: 20000 }, async () => {
  const disabled = await runProbe(false);
  assert.equal(disabled.stderr.trim(), '');
  assert.ok(disabled.stdout.every((line) => { JSON.parse(line); return true; }));

  const enabled = await runProbe(true);
  const records = diagnosticRecords(enabled.stderr);
  assert.ok(records.length > 0);
  assert.equal(enabled.stderr.includes('SENSITIVE_PHASE_SENTINEL'), false);
  assert.equal(enabled.stderr.includes('SENSITIVE_WRITE_SENTINEL'), false);
  assert.ok(enabled.stdout.every((line) => { JSON.parse(line); return true; }));

  const methods = new Set(records.map((record) => record.method));
  assert.deepEqual([...methods].sort(), EXPECTED_TOOLS);
  const groups = new Map<string, PhaseDiagnosticRecord[]>();
  for (const record of records) groups.set(record.correlation_id, [...(groups.get(record.correlation_id) ?? []), record]);
  assert.ok([...groups.values()].every((group) => {
    const phases = group.map((record) => record.phase);
    return phases.length === 2 || phases.length === 4;
  }));
  assert.ok([...groups.values()].filter((group) => group.length === 4).every((group) =>
    group.map((record) => record.phase).join('>') === 'method_start>backend_start>backend_end>method_end'));
  const readSuccess = records.find((record) => record.phase === 'backend_end' && record.outcome === 'success');
  assert.equal(readSuccess?.returned_line_count, enabled.readShape?.line_count);
  assert.equal(readSuccess?.returned_byte_count, enabled.readShape?.byte_count);
  assert.equal(readSuccess?.truncated, enabled.readShape?.truncated);
  const readError = records.find((record) => record.method === 'read_channel' && record.phase === 'method_end' && record.outcome === 'error');
  assert.equal(readError?.error_code, 'CHANNEL_NOT_FOUND');
  assert.ok(records.every((record) => Number.isFinite(record.elapsed_ms) && record.elapsed_ms >= 0));
});
