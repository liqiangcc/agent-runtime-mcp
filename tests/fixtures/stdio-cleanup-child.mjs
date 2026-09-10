import net from 'node:net';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from '../../dist/src/mcp.js';
import { ObservationManager } from '../../dist/src/observation.js';

const channelId = 'stdio-cleanup:1';
const evidence = net.createConnection(process.env.CLEANUP_SOCKET);
const emit = (event, active) => evidence.write(`${JSON.stringify({ event, active })}\n`);
const manager = new ObservationManager({
  sample: async () => ({ identity: 'stdio-server-generation:1:pane:1', snapshot: 'stable', state: 'present' }),
}, undefined, undefined, { onWaiterCountChange: (active) => emit(active > 0 ? 'admitted' : 'cleaned', active) });
const channel = { channel_id: channelId, backend_kind: 'tmux', state: 'available', capabilities: ['read', 'write-text', 'control', 'observe'] };
const backend = {
  listChannels: async () => [channel],
  getChannel: async () => channel,
  readChannel: async () => ({ channel_id: channelId, captured_at: new Date().toISOString(), text: '', truncated: false, line_count: 0, byte_count: 0 }),
  writeText: async () => ({ channel_id: channelId, submitted: false }),
  sendControl: async (_id, control) => ({ channel_id: channelId, control }),
  health: async () => ({ backend_kind: 'tmux', available: true }),
  observeChannel: async () => ({ channel, observation: await manager.observe(channelId) }),
  waitChannelEvent: (input, signal) => manager.wait(input, signal),
};
const server = createMcpServer(backend);
const transport = new StdioServerTransport();
await server.connect(transport);
let shuttingDown = false;
process.on('SIGTERM', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  void transport.close().then(() => setTimeout(() => process.exit(0), 25));
});
