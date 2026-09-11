import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { ChannelBackend } from '../../src/backend.js';
import { createMcpServer } from '../../src/mcp.js';
import { createPhaseDiagnostics, type PhaseDiagnosticRecord } from '../../src/phase-diagnostics.js';
import type { Channel, ChannelRead } from '../../src/types.js';

test('read_channel backend_end precedes result serialization', { timeout: 10000 }, async () => {
  const events: string[] = [];
  const channel: Channel = {
    channel_id: 'phase-order:1',
    backend_kind: 'tmux',
    state: 'available',
    capabilities: ['read'],
  };
  const read = {} as ChannelRead;
  Object.defineProperties(read, {
    channel_id: { enumerable: true, value: channel.channel_id },
    captured_at: { enumerable: true, value: '2026-09-11T00:00:00.000Z' },
    text: {
      enumerable: true,
      get: () => {
        events.push('serialize');
        return 'safe fixture output';
      },
    },
    truncated: { enumerable: true, value: false },
    line_count: { enumerable: true, value: 1 },
    byte_count: { enumerable: true, value: 19 },
  });
  const backend: ChannelBackend = {
    listChannels: async () => [channel],
    getChannel: async () => channel,
    readChannel: async () => {
      events.push('action');
      return read;
    },
    writeText: async () => ({ channel_id: channel.channel_id, submitted: false }),
    sendControl: async () => ({ channel_id: channel.channel_id, control: 'ENTER' }),
    health: async () => ({ backend_kind: 'tmux', available: true }),
  };
  const records: PhaseDiagnosticRecord[] = [];
  const diagnostics = createPhaseDiagnostics(
    { AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS: '1' },
    process.stderr,
    { emit: (record) => { records.push(record); events.push(record.phase); } },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(backend, diagnostics);
  const client = new Client({ name: 'phase-order-test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: 'read_channel', arguments: { channel_id: channel.channel_id, lines: 1, bytes: 64 } });
    assert.equal(response.isError, undefined);
  } finally {
    await client.close();
    await server.close();
  }

  const backendEnd = events.indexOf('backend_end');
  const serialization = events.indexOf('serialize');
  const methodEnd = events.indexOf('method_end');
  assert.ok(backendEnd >= 0);
  assert.ok(serialization >= 0);
  assert.ok(methodEnd >= 0);
  assert.ok(backendEnd < serialization);
  assert.ok(serialization < methodEnd);
  assert.deepEqual(records.map((record) => record.phase), ['method_start', 'backend_start', 'backend_end', 'method_end']);
});
