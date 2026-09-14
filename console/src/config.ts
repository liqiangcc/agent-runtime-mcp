import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ConsoleConfig {
  bind: string;
  port: number;
  mcpEntry: string;
  requestTimeoutMs: number;
  publicDir: string;
  tmuxEnv: Record<string, string>;
}

const DEFAULT_BIND = '127.0.0.1';
const DEFAULT_PORT = 8080;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_TIMEOUT_MS = 120_000;

export function consolePackageDir(): string {
  // dist/src/config.js -> console/dist -> console/
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  if (!/^[0-9]+$/.test(raw.trim())) {
    throw new ConfigError(`CONSOLE_PORT must be an integer 1-65535, got ${JSON.stringify(raw)}`);
  }
  const port = Number(raw.trim());
  if (port < 1 || port > 65535) {
    throw new ConfigError(`CONSOLE_PORT must be an integer 1-65535, got ${port}`);
  }
  return port;
}

function parseRequestTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_REQUEST_TIMEOUT_MS;
  if (!/^[0-9]+$/.test(raw.trim())) {
    throw new ConfigError(`CONSOLE_MCP_REQUEST_TIMEOUT_MS must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  const ms = Number(raw.trim());
  if (ms < 1 || ms > MAX_REQUEST_TIMEOUT_MS) {
    throw new ConfigError(`CONSOLE_MCP_REQUEST_TIMEOUT_MS must be 1-${MAX_REQUEST_TIMEOUT_MS}, got ${ms}`);
  }
  return ms;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ConsoleConfig {
  const consoleDir = consolePackageDir();
  const bind = env.CONSOLE_BIND?.trim() || DEFAULT_BIND;
  const tmuxEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('TMUX_') && value !== undefined) tmuxEnv[key] = value;
  }
  return {
    bind,
    port: parsePort(env.CONSOLE_PORT),
    mcpEntry: env.CONSOLE_MCP_ENTRY ? resolve(env.CONSOLE_MCP_ENTRY) : join(consoleDir, '..', 'dist', 'src', 'server.js'),
    requestTimeoutMs: parseRequestTimeout(env.CONSOLE_MCP_REQUEST_TIMEOUT_MS),
    publicDir: env.CONSOLE_PUBLIC_DIR ? resolve(env.CONSOLE_PUBLIC_DIR) : join(consoleDir, 'public'),
    tmuxEnv,
  };
}
