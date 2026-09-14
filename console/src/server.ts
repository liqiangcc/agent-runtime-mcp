import { createServer } from 'node:http';
import { collectInterfaceAddresses, evaluateBindAddress } from './bind-guard.js';
import { ConfigError, loadConfig } from './config.js';
import { ConsoleEventBus } from './events.js';
import { createRequestHandler, expectedAuthority, rejectUpgrade } from './http-app.js';
import { createLogger } from './logger.js';
import { StdioMcpClient } from './mcp-client.js';

function fatal(message: string): never {
  process.stderr.write(`agent-runtime-mcp-console: ${message}\n`);
  process.exit(1);
}

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  fatal(error instanceof ConfigError ? error.message : `invalid configuration: ${String(error)}`);
}

const verdict = evaluateBindAddress(config.bind, collectInterfaceAddresses());
if (!verdict.allowed) {
  fatal(
    `refusing to listen on ${config.bind}: ${verdict.reason}. ` +
      'CONSOLE_BIND accepts only a loopback address or a Tailscale address assigned to a local interface.',
  );
}

const logger = createLogger();
const expectedHost = expectedAuthority(config.bind, config.port);
const mcp = new StdioMcpClient({
  entry: config.mcpEntry,
  env: config.tmuxEnv,
  requestTimeoutMs: config.requestTimeoutMs,
  logger,
});

const events = new ConsoleEventBus();
const server = createServer(createRequestHandler({ mcp, events, expectedHost, publicDir: config.publicDir, logger }));

server.on('upgrade', (req, socket) => rejectUpgrade(req, socket, expectedHost, logger));

server.on('error', (error) => {
  fatal(`unable to listen on ${config.bind}:${config.port}: ${error.message}`);
});

server.listen(config.port, config.bind, () => {
  logger('console_listen', { bind: config.bind, port: config.port });
});

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  logger('console_shutdown', { signal });
  const force = setTimeout(() => process.exit(0), 2_000);
  force.unref();
  server.close(() => {
    void mcp.close().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
