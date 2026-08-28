import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import type { ChannelBackend } from './backend.js';
import { ChannelError } from './errors.js';
import { validateOrdinaryText, validateTerminalControl } from './input.js';
import type {
  BackendHealth,
  Channel,
  ChannelRead,
  ReadChannelOptions,
  SendControlResult,
  TerminalControl,
  WriteTextOptions,
  WriteTextResult,
} from './types.js';

const PANE_FORMAT = [
  '#{pane_id}',
  '#{session_name}',
  '#{window_id}',
  '#{window_index}',
  '#{pane_index}',
  '#{pane_title}',
  '#{pane_current_path}',
].join('\t');

const CONTROL_KEYS: Readonly<Record<TerminalControl, string>> = {
  ENTER: 'Enter',
  INTERRUPT: 'C-c',
  ESCAPE: 'Escape',
};
const WRITE_BUFFER_PREFIX = 'agent-runtime-mcp-write-';

export const HARD_MAX_READ_LINES = 5000;
export const HARD_MAX_READ_BYTES = 1024 * 1024;

export interface TmuxBackendConfig {
  tmuxExecutable?: string;
  socketName?: string;
  socketPath?: string;
  allowedSessions?: string[];
  timeoutMs?: number;
  maxChannels?: number;
  defaultReadLines?: number;
  maxReadLines?: number;
  maxReadBytes?: number;
}

interface ResolvedTmuxBackendConfig {
  tmuxExecutable: string;
  socketName?: string;
  socketPath?: string;
  allowedSessions?: Set<string>;
  timeoutMs: number;
  maxChannels: number;
  defaultReadLines: number;
  maxReadLines: number;
  maxReadBytes: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunOptions {
  timeoutMs: number;
  maxBufferBytes: number;
  stdin?: string;
}

export interface CommandRunner {
  run(executable: string, args: string[], options: CommandRunOptions): Promise<CommandResult>;
}

type ExecFailure = NodeJS.ErrnoException & {
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
};

interface RunTmuxOptions {
  stdin?: string;
  terminalMutation?: boolean;
}

export class NodeCommandRunner implements CommandRunner {
  async run(executable: string, args: string[], options: CommandRunOptions): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        args,
        {
          encoding: 'utf8',
          timeout: options.timeoutMs,
          maxBuffer: options.maxBufferBytes,
          shell: false,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            const failure = error as ExecFailure;
            failure.stdout = stdout;
            failure.stderr = stderr;
            reject(failure);
            return;
          }
          resolve({ stdout, stderr });
        },
      );

      if (options.stdin !== undefined && child.stdin) {
        child.stdin.on('error', () => {
          // The execFile callback remains the authority for the primary process failure.
        });
        child.stdin.end(options.stdin, 'utf8');
      }
    });
  }
}

interface TmuxPane {
  paneId: string;
  sessionName: string;
  windowId: string;
  windowIndex: string;
  paneIndex: string;
  title?: string;
  cwd?: string;
}

export class TmuxBackend implements ChannelBackend {
  private readonly config: ResolvedTmuxBackendConfig;
  private readonly runner: CommandRunner;
  private readonly scopeFingerprint: string;

  constructor(config: TmuxBackendConfig = {}, runner: CommandRunner = new NodeCommandRunner()) {
    this.config = resolveConfig(config);
    this.runner = runner;
    this.scopeFingerprint = createHash('sha256').update(this.scopeKey()).digest('hex').slice(0, 12);
  }

  async listChannels(): Promise<Channel[]> {
    const panes = await this.listVisiblePanes();
    return panes.map((pane) => this.toChannel(pane));
  }

  async getChannel(channelId: string): Promise<Channel> {
    const paneId = this.parseChannelId(channelId);
    const panes = await this.listVisiblePanes();
    const pane = panes.find((candidate) => candidate.paneId === paneId);
    if (!pane) {
      throw new ChannelError('CHANNEL_NOT_FOUND', 'Channel does not exist in the configured tmux scope', {
        channel_id: channelId,
      });
    }
    return this.toChannel(pane);
  }

  async readChannel(channelId: string, options: ReadChannelOptions = {}): Promise<ChannelRead> {
    const lines = options.lines ?? this.config.defaultReadLines;
    const bytes = options.bytes ?? this.config.maxReadBytes;
    this.validateReadBounds(lines, bytes);

    const paneId = this.parseChannelId(channelId);
    await this.getChannel(channelId);

    const captureLines = Math.min(lines + 1, this.config.maxReadLines + 1);
    const stdout = await this.runTmux(
      ['capture-pane', '-p', '-t', paneId, '-S', `-${captureLines}`],
      'capture-pane',
      Math.min(HARD_MAX_READ_BYTES * 2, this.config.maxReadBytes * 2 + 64 * 1024),
    );

    const captured = splitCapturedLines(stdout);
    let truncated = captured.length > lines;
    const selectedLines = truncated ? captured.slice(-lines) : captured;
    let text = selectedLines.join('\n');

    const byteBounded = takeLastUtf8Bytes(text, bytes);
    if (byteBounded.truncated) {
      truncated = true;
      text = byteBounded.text;
    }

    return {
      channel_id: channelId,
      captured_at: new Date().toISOString(),
      text,
      truncated,
      line_count: text.length === 0 ? 0 : text.split('\n').length,
      byte_count: Buffer.byteLength(text, 'utf8'),
    };
  }

  async writeText(channelId: string, text: string, options: WriteTextOptions): Promise<WriteTextResult> {
    validateOrdinaryText(text);
    if (typeof options?.submit !== 'boolean') {
      throw new ChannelError('INVALID_ARGUMENT', 'submit must be a boolean');
    }

    const paneId = this.parseChannelId(channelId);
    await this.getChannel(channelId);

    const bufferName = `${WRITE_BUFFER_PREFIX}${process.pid}-${randomUUID()}`;
    try {
      await this.runTmux(['load-buffer', '-b', bufferName, '-'], 'load-buffer', 64 * 1024, { stdin: text });
      await this.runTmux(
        ['paste-buffer', '-p', '-r', '-d', '-b', bufferName, '-t', paneId],
        'paste-buffer',
        64 * 1024,
        { terminalMutation: true },
      );
    } catch (error) {
      await this.cleanupBuffer(bufferName);
      throw error;
    }

    if (options.submit) {
      try {
        await this.sendControlToPane(paneId, 'ENTER');
      } catch (error) {
        if (error instanceof ChannelError) {
          throw new ChannelError(error.code, error.message, {
            ...error.details,
            text_delivered: true,
            submit_outcome: error.code === 'TIMEOUT' ? 'unknown' : 'failed',
          });
        }
        throw error;
      }
    }

    return { channel_id: channelId, submitted: options.submit };
  }

  async sendControl(channelId: string, control: TerminalControl): Promise<SendControlResult> {
    validateTerminalControl(control);
    const paneId = this.parseChannelId(channelId);
    await this.getChannel(channelId);
    await this.sendControlToPane(paneId, control);
    return { channel_id: channelId, control };
  }

  async health(): Promise<BackendHealth> {
    try {
      await this.runTmux(['list-panes', '-a', '-F', '#{pane_id}'], 'health', 256 * 1024);
      return { backend_kind: 'tmux', available: true };
    } catch (error) {
      if (error instanceof ChannelError) {
        return { backend_kind: 'tmux', available: false, detail: error.code };
      }
      return { backend_kind: 'tmux', available: false, detail: 'BACKEND_OPERATION_FAILED' };
    }
  }

  channelIdForPane(paneId: string): string {
    const match = /^%(\d+)$/.exec(paneId);
    if (!match) {
      throw new ChannelError('BACKEND_OPERATION_FAILED', 'Tmux returned an invalid pane identity');
    }
    return `tmux:${this.scopeFingerprint}:${match[1]}`;
  }

  private async listVisiblePanes(): Promise<TmuxPane[]> {
    const stdout = await this.runTmux(['list-panes', '-a', '-F', PANE_FORMAT], 'list-panes', 2 * 1024 * 1024);
    const panes = stdout
      .split('\n')
      .filter((line) => line.length > 0)
      .map(parsePaneLine)
      .filter((pane) => this.isSessionAllowed(pane.sessionName));

    return panes.slice(0, this.config.maxChannels);
  }

  private toChannel(pane: TmuxPane): Channel {
    const channelId = this.channelIdForPane(pane.paneId);
    return {
      channel_id: channelId,
      backend_kind: 'tmux',
      backend_locator: channelId,
      state: 'available',
      capabilities: ['read', 'write-text', 'control'],
      ...(pane.title ? { title: pane.title } : {}),
      ...(pane.cwd ? { cwd: pane.cwd } : {}),
    };
  }

  private parseChannelId(channelId: string): string {
    const match = /^tmux:([a-f0-9]{12}):(\d+)$/.exec(channelId);
    if (!match || match[1] !== this.scopeFingerprint) {
      throw new ChannelError('CHANNEL_NOT_FOUND', 'Channel does not belong to the configured tmux scope', {
        channel_id: channelId,
      });
    }
    return `%${match[2]}`;
  }

  private async sendControlToPane(paneId: string, control: TerminalControl): Promise<void> {
    const key = CONTROL_KEYS[control];
    await this.runTmux(['send-keys', '-t', paneId, key], `send-control-${control.toLowerCase()}`, 64 * 1024, {
      terminalMutation: true,
    });
  }

  private async cleanupBuffer(bufferName: string): Promise<void> {
    try {
      await this.runTmux(['delete-buffer', '-b', bufferName], 'delete-buffer', 64 * 1024);
    } catch {
      // Cleanup is best effort and must not replace the primary mutation result.
    }
  }

  private isSessionAllowed(sessionName: string): boolean {
    return this.config.allowedSessions === undefined || this.config.allowedSessions.has(sessionName);
  }

  private validateReadBounds(lines: number, bytes: number): void {
    if (!Number.isInteger(lines) || lines <= 0 || lines > this.config.maxReadLines) {
      throw new ChannelError('INVALID_ARGUMENT', `lines must be an integer between 1 and ${this.config.maxReadLines}`);
    }
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > this.config.maxReadBytes) {
      throw new ChannelError('INVALID_ARGUMENT', `bytes must be an integer between 1 and ${this.config.maxReadBytes}`);
    }
  }

  private scopeKey(): string {
    if (this.config.socketPath) return `socket-path:${this.config.socketPath}`;
    if (this.config.socketName) return `socket-name:${this.config.socketName}`;
    return 'default-server';
  }

  private scopeArgs(): string[] {
    if (this.config.socketPath) return ['-S', this.config.socketPath];
    if (this.config.socketName) return ['-L', this.config.socketName];
    return [];
  }

  private async runTmux(
    commandArgs: string[],
    operation: string,
    maxBufferBytes: number,
    options: RunTmuxOptions = {},
  ): Promise<string> {
    try {
      const result = await this.runner.run(
        this.config.tmuxExecutable,
        [...this.scopeArgs(), ...commandArgs],
        {
          timeoutMs: this.config.timeoutMs,
          maxBufferBytes,
          ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
        },
      );
      return result.stdout;
    } catch (error) {
      throw classifyTmuxFailure(error, operation, options.terminalMutation === true);
    }
  }
}

export function tmuxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TmuxBackendConfig {
  const socketName = nonEmpty(env.TMUX_SOCKET_NAME);
  const socketPath = nonEmpty(env.TMUX_SOCKET_PATH);
  if (socketName && socketPath) {
    throw new ChannelError('INVALID_ARGUMENT', 'TMUX_SOCKET_NAME and TMUX_SOCKET_PATH are mutually exclusive');
  }

  const allowedSessions = nonEmpty(env.TMUX_ALLOWED_SESSIONS)
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    ...(socketName ? { socketName } : {}),
    ...(socketPath ? { socketPath } : {}),
    ...(allowedSessions && allowedSessions.length > 0 ? { allowedSessions } : {}),
    ...(parseOptionalPositiveInt(env.TMUX_TIMEOUT_MS, 'TMUX_TIMEOUT_MS') !== undefined
      ? { timeoutMs: parseOptionalPositiveInt(env.TMUX_TIMEOUT_MS, 'TMUX_TIMEOUT_MS') }
      : {}),
    ...(parseOptionalPositiveInt(env.TMUX_MAX_CHANNELS, 'TMUX_MAX_CHANNELS') !== undefined
      ? { maxChannels: parseOptionalPositiveInt(env.TMUX_MAX_CHANNELS, 'TMUX_MAX_CHANNELS') }
      : {}),
    ...(parseOptionalPositiveInt(env.TMUX_READ_DEFAULT_LINES, 'TMUX_READ_DEFAULT_LINES') !== undefined
      ? { defaultReadLines: parseOptionalPositiveInt(env.TMUX_READ_DEFAULT_LINES, 'TMUX_READ_DEFAULT_LINES') }
      : {}),
    ...(parseOptionalPositiveInt(env.TMUX_READ_MAX_LINES, 'TMUX_READ_MAX_LINES') !== undefined
      ? { maxReadLines: parseOptionalPositiveInt(env.TMUX_READ_MAX_LINES, 'TMUX_READ_MAX_LINES') }
      : {}),
    ...(parseOptionalPositiveInt(env.TMUX_READ_MAX_BYTES, 'TMUX_READ_MAX_BYTES') !== undefined
      ? { maxReadBytes: parseOptionalPositiveInt(env.TMUX_READ_MAX_BYTES, 'TMUX_READ_MAX_BYTES') }
      : {}),
  };
}

export function takeLastUtf8Bytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return { text, truncated: false };

  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start += 1;
  return { text: buffer.subarray(start).toString('utf8'), truncated: true };
}

function splitCapturedLines(stdout: string): string[] {
  const withoutFinalNewline = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
  return withoutFinalNewline.length === 0 ? [] : withoutFinalNewline.split('\n');
}

function parsePaneLine(line: string): TmuxPane {
  const [paneId, sessionName, windowId, windowIndex, paneIndex, title = '', cwd = ''] = line.split('\t');
  if (!paneId || !sessionName || !windowId || windowIndex === undefined || paneIndex === undefined) {
    throw new ChannelError('BACKEND_OPERATION_FAILED', 'Tmux returned malformed pane metadata');
  }
  return {
    paneId,
    sessionName,
    windowId,
    windowIndex,
    paneIndex,
    ...(title ? { title } : {}),
    ...(cwd ? { cwd } : {}),
  };
}

function classifyTmuxFailure(error: unknown, operation: string, terminalMutation: boolean): ChannelError {
  const failure = error as ExecFailure;
  if (failure?.code === 'ENOENT') {
    return new ChannelError('BACKEND_UNAVAILABLE', 'tmux executable is unavailable', { operation });
  }
  if (failure?.killed || failure?.signal === 'SIGTERM') {
    return new ChannelError('TIMEOUT', 'tmux operation timed out', {
      operation,
      ...(terminalMutation ? { delivery_outcome: 'unknown' } : {}),
    });
  }

  const stderr = typeof failure?.stderr === 'string' ? failure.stderr.toLowerCase() : '';
  if (stderr.includes("can't find pane") || stderr.includes('no such pane')) {
    return new ChannelError('CHANNEL_NOT_FOUND', 'Channel disappeared before the tmux operation completed', { operation });
  }
  if (
    stderr.includes('no server running') ||
    stderr.includes('failed to connect') ||
    stderr.includes('connection refused') ||
    stderr.includes('error connecting')
  ) {
    return new ChannelError('BACKEND_UNAVAILABLE', 'Configured tmux backend is unavailable', { operation });
  }
  return new ChannelError('BACKEND_OPERATION_FAILED', 'tmux operation failed', { operation });
}

function resolveConfig(config: TmuxBackendConfig): ResolvedTmuxBackendConfig {
  if (config.socketName && config.socketPath) {
    throw new ChannelError('INVALID_ARGUMENT', 'socketName and socketPath are mutually exclusive');
  }

  const maxReadLines = boundedPositive(config.maxReadLines ?? 1000, 'maxReadLines', HARD_MAX_READ_LINES);
  const maxReadBytes = boundedPositive(config.maxReadBytes ?? 256 * 1024, 'maxReadBytes', HARD_MAX_READ_BYTES);
  const defaultReadLines = boundedPositive(
    config.defaultReadLines ?? Math.min(200, maxReadLines),
    'defaultReadLines',
    maxReadLines,
  );

  return {
    tmuxExecutable: config.tmuxExecutable ?? 'tmux',
    ...(config.socketName ? { socketName: config.socketName } : {}),
    ...(config.socketPath ? { socketPath: config.socketPath } : {}),
    ...(config.allowedSessions ? { allowedSessions: new Set(config.allowedSessions) } : {}),
    timeoutMs: boundedPositive(config.timeoutMs ?? 3000, 'timeoutMs', 60_000),
    maxChannels: boundedPositive(config.maxChannels ?? 256, 'maxChannels', 5000),
    defaultReadLines,
    maxReadLines,
    maxReadBytes,
  };
}

function boundedPositive(value: number, field: string, maximum: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new ChannelError('INVALID_ARGUMENT', `${field} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function parseOptionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ChannelError('INVALID_ARGUMENT', `${name} must be a positive integer`);
  }
  return parsed;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
