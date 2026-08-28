import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const RESPONSE_TIMEOUT_MS = 5000;
const EXIT_TIMEOUT_MS = 5000;
const EXPECTED_TOOLS = ['get_channel', 'health', 'list_channels', 'read_channel', 'send_control', 'write_text'];

type JsonRpcMessage = Record<string, unknown>;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function writeMessage(stream: NodeJS.WritableStream, message: JsonRpcMessage): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const payload = `${JSON.stringify(message)}\n`;
    stream.write(payload, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test('stale pre-initialize tools/list preserves the real stdio child for same-connection initialize', { timeout: 20000 }, async () => {
  const serverPath = join(process.cwd(), 'dist', 'src', 'server.js');
  const socketName = `agent-runtime-mcp-preinit-${process.pid}-${Date.now()}`;
  const child = spawn(process.execPath, [serverPath], {
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: `never-present-${process.pid}`,
      TMUX_TIMEOUT_MS: '2000',
    },
  });

  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk: string) => {
    if (stderr.length < 16 * 1024) stderr += chunk;
  });

  const stdoutLines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = stdoutLines[Symbol.asyncIterator]();

  const receiveMessage = async (label: string): Promise<JsonRpcMessage> => {
    const next = await withTimeout(iterator.next(), RESPONSE_TIMEOUT_MS, label);
    if (next.done) {
      assert.fail(`${label}: server stdout closed before a response; stderr=${stderr.trim()}`);
    }
    return asRecord(JSON.parse(next.value), label);
  };

  const assertAlive = async (label: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(child.exitCode, null, `${label}: child exited with code ${child.exitCode}; stderr=${stderr.trim()}`);
    assert.equal(child.signalCode, null, `${label}: child exited via signal ${child.signalCode}; stderr=${stderr.trim()}`);
  };

  const waitForExit = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return { code: child.exitCode, signal: child.signalCode };
    }
    return withTimeout(
      new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
      }),
      EXIT_TIMEOUT_MS,
      'clean stdio child exit',
    );
  };

  let closedCleanly = false;
  try {
    await writeMessage(child.stdin, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const staleResponse = await receiveMessage('pre-initialize tools/list response');
    assert.equal(staleResponse.jsonrpc, '2.0');
    assert.equal(staleResponse.id, 1);
    const staleResponseShape = Object.hasOwn(staleResponse, 'result')
      ? 'result'
      : Object.hasOwn(staleResponse, 'error')
        ? 'error'
        : 'invalid';
    assert.notEqual(staleResponseShape, 'invalid', 'stale request must receive a bounded JSON-RPC result or error');
    await assertAlive('after stale pre-initialize tools/list');

    await writeMessage(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stdio-stale-preinitialize-compat', version: '0.1.0' },
      },
    });
    const initializeResponse = await receiveMessage('same-connection initialize response');
    assert.equal(initializeResponse.jsonrpc, '2.0');
    assert.equal(initializeResponse.id, 2);
    const initializeResult = asRecord(initializeResponse.result, 'initialize.result');
    const serverInfo = asRecord(initializeResult.serverInfo, 'initialize.result.serverInfo');
    assert.equal(serverInfo.name, 'agent-runtime-mcp');
    assert.equal(serverInfo.version, '0.1.0');
    assert.equal(typeof initializeResult.protocolVersion, 'string');
    await assertAlive('after same-connection initialize');

    await writeMessage(child.stdin, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    await writeMessage(child.stdin, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
    const toolListResponse = await receiveMessage('post-initialize tools/list response');
    assert.equal(toolListResponse.jsonrpc, '2.0');
    assert.equal(toolListResponse.id, 3);
    const toolListResult = asRecord(toolListResponse.result, 'tools/list.result');
    assert.ok(Array.isArray(toolListResult.tools), 'tools/list.result.tools must be an array');
    const toolNames = toolListResult.tools.map((tool, index) => {
      const record = asRecord(tool, `tools/list.result.tools[${index}]`);
      assert.equal(typeof record.name, 'string');
      return record.name as string;
    });
    assert.deepEqual([...toolNames].sort(), EXPECTED_TOOLS);

    await writeMessage(child.stdin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'health', arguments: {} },
    });
    const healthResponse = await receiveMessage('post-initialize health response');
    assert.equal(healthResponse.jsonrpc, '2.0');
    assert.equal(healthResponse.id, 4);
    const healthResult = asRecord(healthResponse.result, 'tools/call health.result');
    assert.notEqual(healthResult.isError, true, 'health must remain a successful public Tool dispatch');
    const structuredContent = asRecord(healthResult.structuredContent, 'health.result.structuredContent');
    const health = asRecord(structuredContent.health, 'health.result.structuredContent.health');
    assert.equal(health.backend_kind, 'tmux');
    assert.equal(typeof health.available, 'boolean');
    await assertAlive('after post-initialize health call');

    console.log(
      `STDIO_STALE_PREINITIALIZE_EVIDENCE ${JSON.stringify({
        stale_request: 'tools/list',
        stale_response_shape: staleResponseShape,
        child_alive_after_stale: true,
        initialize_protocol: initializeResult.protocolVersion,
        same_connection_initialize: true,
        post_init_tools: [...toolNames].sort(),
        health: { backend_kind: health.backend_kind, available: health.available },
        child_alive_after_health: true,
      })}`,
    );

    child.stdin.end();
    const exit = await waitForExit();
    assert.equal(exit.signal, null, `stdio child should not require a signal to stop; stderr=${stderr.trim()}`);
    assert.equal(exit.code, 0, `stdio child should exit cleanly after stdin closes; stderr=${stderr.trim()}`);
    closedCleanly = true;
  } finally {
    stdoutLines.close();
    if (!closedCleanly && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await waitForExit().catch(() => undefined);
    }
  }
});
