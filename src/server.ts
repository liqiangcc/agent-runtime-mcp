import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './mcp.js';
import { TmuxBackend, tmuxConfigFromEnv } from './tmux-backend.js';

const handle = serveStdio(() => createMcpServer(new TmuxBackend(tmuxConfigFromEnv())));

process.on('SIGINT', () => {
  void handle.close();
});

process.on('SIGTERM', () => {
  void handle.close();
});
