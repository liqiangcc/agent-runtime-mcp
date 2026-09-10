import { serveStdio } from '@modelcontextprotocol/server/stdio';
import net from 'node:net';
import { createMcpServer } from './mcp.js';
import { TmuxBackend, tmuxConfigFromEnv } from './tmux-backend.js';
import { installStdioShutdown } from './stdio-shutdown.js';

const evidenceSocket = process.env.AGENT_RUNTIME_MCP_TEST_EVIDENCE_SOCKET ? net.createConnection(process.env.AGENT_RUNTIME_MCP_TEST_EVIDENCE_SOCKET) : undefined;
const backend = new TmuxBackend(tmuxConfigFromEnv(), undefined, evidenceSocket ? { onWaiterCountChange: (active) => evidenceSocket.write(`${JSON.stringify({ event: active > 0 ? 'admitted' : 'cleaned', active })}\n`) } : undefined);
const handle = serveStdio(() => createMcpServer(backend));
const removeShutdown = installStdioShutdown({ close: async () => { await handle.close(); evidenceSocket?.end(); } });

process.on('exit', removeShutdown);
