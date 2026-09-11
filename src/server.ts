import { serveStdio } from '@modelcontextprotocol/server/stdio';
import net from 'node:net';
import { createMcpServer } from './mcp.js';
import { TmuxBackend, tmuxConfigFromEnv } from './tmux-backend.js';
import { installStdioShutdown } from './stdio-shutdown.js';
import { createPhaseDiagnostics } from './phase-diagnostics.js';

const evidenceSocket = process.env.AGENT_RUNTIME_MCP_TEST_EVIDENCE_SOCKET ? net.createConnection(process.env.AGENT_RUNTIME_MCP_TEST_EVIDENCE_SOCKET) : undefined;
const backend = new TmuxBackend(tmuxConfigFromEnv(), undefined, evidenceSocket ? { onWaiterCountChange: (active) => evidenceSocket.write(`${JSON.stringify({ event: active > 0 ? 'admitted' : 'cleaned', active })}\n`) } : undefined);
const diagnostics = createPhaseDiagnostics();
const handle = serveStdio(() => createMcpServer(backend, diagnostics));
const removeShutdown = installStdioShutdown({ close: async () => { await handle.close(); evidenceSocket?.end(); } });

process.on('exit', removeShutdown);
