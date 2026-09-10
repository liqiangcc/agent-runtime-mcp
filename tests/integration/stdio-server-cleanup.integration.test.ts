import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('actual stdio transport EOF observes production waiter cleanup before harness shutdown', { timeout: 10000 }, async () => {
  const socketPath = `/tmp/agent-runtime-mcp-cleanup-${process.pid}-${Date.now()}.sock`;
  const events: Array<{ event: string; active: number }> = [];
  let resolveAdmitted!: () => void; let resolveCleaned!: () => void;
  const admitted = new Promise<void>((resolve) => { resolveAdmitted = resolve; });
  const cleaned = new Promise<void>((resolve) => { resolveCleaned = resolve; });
  const evidenceServer = createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const event = JSON.parse(buffer.slice(0, newline)) as { event: string; active: number };
        buffer = buffer.slice(newline + 1); events.push(event);
        if (event.event === 'admitted') resolveAdmitted();
        if (event.event === 'cleaned') resolveCleaned();
      }
    });
  });
  await new Promise<void>((resolve, reject) => { evidenceServer.once('error', reject); evidenceServer.listen(socketPath, () => resolve()); });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), 'tests', 'fixtures', 'stdio-cleanup-child.mjs')],
    cwd: process.cwd(),
    env: { ...getDefaultEnvironment(), CLEANUP_SOCKET: socketPath },
    stderr: 'inherit',
  });
  const client = new Client({ name: 'stdio-cleanup-evidence', version: '0.2.0' });
  try {
    await client.connect(transport);
    const observed = await client.callTool({ name: 'get_channel', arguments: { channel_id: 'stdio-cleanup:1', observe: true } });
    const cursor = (observed.structuredContent as { observation: { cursor: string } }).observation.cursor;
    const pending = client.callTool({ name: 'wait_channel_event', arguments: { channel_id: 'stdio-cleanup:1', after_cursor: cursor, idle_ms: 250, timeout_ms: 60000 } }).catch(() => undefined);
    await Promise.race([admitted, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('stdio waiter admission not observed')), 2000))]);
    await transport.close();
    await Promise.race([cleaned, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('server cleanup not observed before shutdown')), 2000))]);
    await pending;
    assert.deepEqual(events.map((event) => event.event), ['admitted', 'cleaned']);
    assert.equal(events.at(-1)?.active, 0);
    console.log('STDIO_SERVER_CLEANUP_EVIDENCE', JSON.stringify({ admitted: true, cleaned: true, events }));
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    await new Promise<void>((resolve) => evidenceServer.close(() => resolve()));
  }
});
