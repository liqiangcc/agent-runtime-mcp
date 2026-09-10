import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createMcpServer } from '../../src/mcp.js';
import type { ChannelBackend } from '../../src/backend.js';
import type { Channel } from '../../src/types.js';

test('in-memory server harness observes waiter cleanup on disconnect', async () => {
  let active = 0; let cleaned = 0;
  const channel: Channel = { channel_id: 'harness:1', backend_kind: 'tmux', state: 'available', capabilities: ['read', 'write-text', 'control', 'observe'] };
  const backend: ChannelBackend = {
    listChannels: async () => [channel], getChannel: async () => channel,
    readChannel: async () => ({ channel_id: channel.channel_id, captured_at: new Date().toISOString(), text: '', truncated: false, line_count: 0, byte_count: 0 }),
    writeText: async () => ({ channel_id: channel.channel_id, submitted: false }), sendControl: async () => ({ channel_id: channel.channel_id, control: 'ENTER' as const }),
    health: async () => ({ backend_kind: 'tmux' as const, available: true }),
    observeChannel: async () => ({ channel, observation: { cursor: 'harness-cursor', channel_instance: 'harness-instance', model: 'snapshot_change' as const, issued_at: new Date().toISOString(), valid_until: new Date(Date.now() + 60000).toISOString(), continuity: 'complete' as const } }),
    waitChannelEvent: async (_input: unknown, signal?: AbortSignal) => new Promise((resolve, reject) => { active += 1; const done = () => { if (active > 0) active -= 1; cleaned += 1; reject(new Error('cancelled')); }; signal?.addEventListener('abort', done, { once: true }); }),
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(backend); await server.connect(serverTransport);
  const client = new Client({ name: 'cleanup-harness', version: '0.2.0' }); await client.connect(clientTransport);
  await client.callTool({ name: 'get_channel', arguments: { channel_id: channel.channel_id, observe: true } });
  const pending = client.callTool({ name: 'wait_channel_event', arguments: { channel_id: channel.channel_id, after_cursor: 'harness-cursor', idle_ms: 250, timeout_ms: 60000 } }).catch(() => undefined);
  for (let i = 0; i < 20 && active === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(active, 1);
  await client.close(); await pending;
  assert.equal(cleaned, 1); assert.equal(active, 0);
  console.log('SERVER_DISCONNECT_CLEANUP_EVIDENCE', JSON.stringify({ admitted: true, cleaned, active }));
});
