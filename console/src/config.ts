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
  history: {
    maxLines: number;
    maxBytes: number;
    maxObservedChannels: number;
    observeIdleMs: number;
    observeTimeoutMs: number;
    pollMs: number;
    tailLines: number;
    tailBytes: number;
  };
  lifecycle: {
    enabled: boolean;
    profiles: Record<string, { argv: string[] }>;
    allowedCwdRoots: string[];
    protectedSessions: string[];
  };
  terminal: {
    enabled: boolean;
    maxAttach: number;
  };
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

function boundedInt(raw: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^[0-9]+$/.test(raw.trim())) {
    throw new ConfigError(`${name} must be an integer ${min}-${max}, got ${JSON.stringify(raw)}`);
  }
  const value = Number(raw.trim());
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be ${min}-${max}, got ${value}`);
  }
  return value;
}

function parseEnabledFlag(raw: string | undefined, name: string): boolean {
  if (raw === undefined || raw.trim() === '') return false;
  const value = raw.trim();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new ConfigError(`${name} must be true/1 or false/0, got ${JSON.stringify(raw)}`);
}

function parseLifecycleProfiles(raw: string | undefined): Record<string, { argv: string[] }> {
  // Frozen Coordinator decision: the repository default profile set is EMPTY —
  // operators must configure CONSOLE_LIFECYCLE_PROFILES explicitly.
  if (raw === undefined || raw.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('CONSOLE_LIFECYCLE_PROFILES must be a JSON object of label -> {argv: string[]}');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError('CONSOLE_LIFECYCLE_PROFILES must be a JSON object of label -> {argv: string[]}');
  }
  const profiles: Record<string, { argv: string[] }> = {};
  for (const [label, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (label.trim() === '' || value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConfigError(`CONSOLE_LIFECYCLE_PROFILES entry ${JSON.stringify(label)} must be {argv: string[]}`);
    }
    const argv = (value as Record<string, unknown>).argv;
    if (!Array.isArray(argv) || argv.length === 0 || argv.some((a) => typeof a !== 'string' || a === '')) {
      throw new ConfigError(`CONSOLE_LIFECYCLE_PROFILES entry ${JSON.stringify(label)} must have a non-empty argv string array`);
    }
    profiles[label] = { argv: [...(argv as string[])] };
  }
  return profiles;
}

function parseCwdRoots(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('CONSOLE_ALLOWED_CWD_ROOTS must be a JSON array of absolute paths');
  }
  if (!Array.isArray(parsed) || parsed.some((p) => typeof p !== 'string' || !p.startsWith('/'))) {
    throw new ConfigError('CONSOLE_ALLOWED_CWD_ROOTS must be a JSON array of absolute paths');
  }
  return parsed.map((p) => resolve(p as string));
}

function parseProtectedSessions(raw: string | undefined): string[] {
  const sessions = new Set<string>(['agent-runtime-keeper']);
  if (raw !== undefined && raw.trim() !== '') {
    for (const name of raw.split(',')) {
      const trimmed = name.trim();
      if (trimmed !== '') sessions.add(trimmed);
    }
  }
  return [...sessions];
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
    history: {
      // MCP §7 bounds: idle_ms 250..60000, timeout_ms 100..60000.
      maxLines: boundedInt(env.CONSOLE_HISTORY_MAX_LINES, 'CONSOLE_HISTORY_MAX_LINES', 5_000, 10, 100_000),
      maxBytes: boundedInt(env.CONSOLE_HISTORY_MAX_BYTES, 'CONSOLE_HISTORY_MAX_BYTES', 2 * 1024 * 1024, 4_096, 64 * 1024 * 1024),
      maxObservedChannels: boundedInt(env.CONSOLE_HISTORY_MAX_CHANNELS, 'CONSOLE_HISTORY_MAX_CHANNELS', 4, 1, 8),
      observeIdleMs: boundedInt(env.CONSOLE_OBSERVE_IDLE_MS, 'CONSOLE_OBSERVE_IDLE_MS', 1_000, 250, 60_000),
      observeTimeoutMs: boundedInt(env.CONSOLE_OBSERVE_TIMEOUT_MS, 'CONSOLE_OBSERVE_TIMEOUT_MS', 15_000, 100, 60_000),
      pollMs: boundedInt(env.CONSOLE_OBSERVE_POLL_MS, 'CONSOLE_OBSERVE_POLL_MS', 2_500, 500, 60_000),
      tailLines: boundedInt(env.CONSOLE_TAIL_LINES, 'CONSOLE_TAIL_LINES', 400, 10, 2_000),
      // Single read_channel request bound: the MCP's public per-read bytes
      // limit is 1 MiB (HARD_MAX_READ_BYTES); the ring total stays separate.
      tailBytes: boundedInt(env.CONSOLE_TAIL_BYTES, 'CONSOLE_TAIL_BYTES', 256 * 1024, 4_096, 1024 * 1024),
    },
    lifecycle: {
      enabled: parseEnabledFlag(env.CONSOLE_LIFECYCLE_ENABLED, 'CONSOLE_LIFECYCLE_ENABLED'),
      profiles: parseLifecycleProfiles(env.CONSOLE_LIFECYCLE_PROFILES),
      allowedCwdRoots: parseCwdRoots(env.CONSOLE_ALLOWED_CWD_ROOTS),
      protectedSessions: parseProtectedSessions(env.CONSOLE_PROTECTED_SESSIONS),
    },
    terminal: {
      enabled: parseEnabledFlag(env.CONSOLE_TERMINAL_ENABLED, 'CONSOLE_TERMINAL_ENABLED'),
      maxAttach: boundedInt(env.CONSOLE_MAX_ATTACH, 'CONSOLE_MAX_ATTACH', 4, 1, 16),
    },
  };
}
