import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFileAsync = promisify(execFile);
test('real stdio wait honors an uncancelled 60-second server deadline', { timeout: 70000 }, async () => {
  const socket = `agent-runtime-mcp-window-${process.pid}-${Date.now()}`;
  const session = `window-${process.pid}-${Date.now()}`;
  const tmux = async (...args: string[]) => execFileAsync('tmux', ['-L', socket, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  await tmux('new-session', '-d', '-s', session, 'sleep 70');
  const serverPath = join(process.cwd(), 'dist', 'src', 'server.js');
  const client = new Client({ name: 'timeout-window-evidence', version: '0.2.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], cwd: process.cwd(), env: { ...getDefaultEnvironment(), TMUX_SOCKET_NAME: socket, TMUX_ALLOWED_SESSIONS: session } });
  try {
    await client.connect(transport);
    const listed = await client.callTool({ name: 'list_channels', arguments: {} });
    const channel = (listed.structuredContent as { channels: Array<{ channel_id: string }> }).channels[0];
    const observed = await client.callTool({ name: 'get_channel', arguments: { channel_id: channel.channel_id, observe: true } });
    const cursor = (observed.structuredContent as { observation: { cursor: string } }).observation.cursor;
    const started = Date.now();
    const waited = await client.callTool({ name: 'wait_channel_event', arguments: { channel_id: channel.channel_id, after_cursor: cursor, idle_ms: 60000, timeout_ms: 60000 } }, { timeout: 65000 });
    const elapsed = Date.now() - started;
    const payload = waited.structuredContent as { reason?: string; next_cursor?: string };
    assert.equal(waited.isError, undefined);
    assert.equal(payload.reason, 'timeout');
    assert.equal(payload.next_cursor, cursor);
    assert.ok(elapsed >= 59000 && elapsed < 65000);
    console.log('STDIO_60S_TIMEOUT_EVIDENCE', JSON.stringify({ reason: payload.reason, elapsed_ms: elapsed, timeout_ms: 60000, cursor_preserved: payload.next_cursor === cursor }));
  } finally {
    await client.close().catch(() => undefined);
    await tmux('kill-server').catch(() => undefined);
  }
});
