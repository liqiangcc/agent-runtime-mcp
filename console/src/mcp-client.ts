import { Client, SdkError, SdkErrorCode } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { Logger } from './logger.js';

/**
 * MCP client adapter: the only coupling between the Console and
 * agent-runtime-mcp is the public seven-tool contract over stdio.
 */

export type ToolPayload = Record<string, unknown>;

export type TerminalControl = 'ENTER' | 'INTERRUPT' | 'ESCAPE';

export class McpUnavailableError extends Error {
  readonly code = 'MCP_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'McpUnavailableError';
  }
}

export class McpToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
  }
}

export interface ConsoleMcp {
  health(): Promise<ToolPayload>;
  listChannels(): Promise<ToolPayload>;
  getChannel(channelId: string, observe?: boolean): Promise<ToolPayload>;
  readChannel(channelId: string, options?: { lines?: number; bytes?: number }): Promise<ToolPayload>;
  writeText(channelId: string, text: string, submit: boolean): Promise<ToolPayload>;
  sendControl(channelId: string, control: TerminalControl): Promise<ToolPayload>;
  waitChannelEvent(
    channelId: string,
    afterCursor: string,
    options?: { idle_ms?: number; timeout_ms?: number },
  ): Promise<ToolPayload>;
  close(): Promise<void>;
}

export interface StdioMcpOptions {
  entry: string;
  env?: Record<string, string>;
  requestTimeoutMs?: number;
  reconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectCooldownMs?: number;
  logger?: Logger;
  clientName?: string;
}

const noop = () => undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StdioMcpClient implements ConsoleMcp {
  private readonly entry: string;
  private readonly env: Record<string, string>;
  private readonly requestTimeoutMs: number;
  private readonly reconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectCooldownMs: number;
  private readonly logger: Logger;
  private readonly clientName: string;

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting: Promise<Client> | null = null;
  private unavailableUntil = 0;

  constructor(options: StdioMcpOptions) {
    this.entry = options.entry;
    this.env = options.env ?? {};
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.reconnectAttempts = options.reconnectAttempts ?? 3;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 250;
    this.reconnectCooldownMs = options.reconnectCooldownMs ?? 5_000;
    this.logger = options.logger ?? noop;
    this.clientName = options.clientName ?? 'agent-runtime-mcp-console';
  }

  private async ensureClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    if (Date.now() < this.unavailableUntil) {
      throw new McpUnavailableError('agent-runtime-mcp unavailable; reconnect cooling down');
    }
    this.connecting = this.connectWithRetry().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connectWithRetry(): Promise<Client> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.reconnectAttempts; attempt += 1) {
      try {
        return await this.connectOnce();
      } catch (error) {
        lastError = error;
        this.logger('mcp_connect_error', { attempt, outcome: 'error' });
        if (attempt < this.reconnectAttempts) {
          await delay(this.reconnectBaseDelayMs * 2 ** (attempt - 1));
        }
      }
    }
    this.unavailableUntil = Date.now() + this.reconnectCooldownMs;
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new McpUnavailableError(`agent-runtime-mcp connect failed after ${this.reconnectAttempts} attempts: ${detail}`);
  }

  private async connectOnce(): Promise<Client> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.entry],
      env: { ...getDefaultEnvironment(), ...this.env },
    });
    const client = new Client({ name: this.clientName, version: '0.1.0' });
    transport.onclose = () => {
      if (this.transport === transport) {
        this.transport = null;
        this.client = null;
        this.logger('mcp_disconnected', {});
      }
    };
    try {
      await client.connect(transport);
    } catch (error) {
      await transport.close().catch(noop);
      throw error;
    }
    this.transport = transport;
    this.client = client;
    this.logger('mcp_connected', {});
    return client;
  }

  private async call(name: string, args: Record<string, unknown>, timeoutMs = this.requestTimeoutMs): Promise<ToolPayload> {
    const client = await this.ensureClient();
    let result: Awaited<ReturnType<Client['callTool']>>;
    try {
      result = await client.callTool({ name, arguments: args }, { timeout: timeoutMs });
    } catch (error) {
      if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
        throw new McpToolError('TIMEOUT', `${name} request timed out after ${timeoutMs}ms; the mutation may have been delivered`);
      }
      if (!this.client) {
        throw new McpUnavailableError(`agent-runtime-mcp connection lost during ${name}`);
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new McpToolError('MCP_REQUEST_FAILED', `${name} request failed: ${detail}`);
    }
    if (result.isError === true) {
      const structured = isRecord(result.structuredContent) ? result.structuredContent : {};
      const toolError = isRecord(structured.error) ? structured.error : {};
      const code = typeof toolError.code === 'string' ? toolError.code : 'MCP_TOOL_ERROR';
      const message = typeof toolError.message === 'string' ? toolError.message : `${name} returned an error`;
      throw new McpToolError(code, message);
    }
    return isRecord(result.structuredContent) ? result.structuredContent : {};
  }

  health(): Promise<ToolPayload> {
    return this.call('health', {});
  }

  listChannels(): Promise<ToolPayload> {
    return this.call('list_channels', {});
  }

  getChannel(channelId: string, observe = false): Promise<ToolPayload> {
    return this.call('get_channel', { channel_id: channelId, observe });
  }

  readChannel(channelId: string, options: { lines?: number; bytes?: number } = {}): Promise<ToolPayload> {
    return this.call('read_channel', { channel_id: channelId, ...options });
  }

  writeText(channelId: string, text: string, submit: boolean): Promise<ToolPayload> {
    return this.call('write_text', { channel_id: channelId, text, submit });
  }

  sendControl(channelId: string, control: TerminalControl): Promise<ToolPayload> {
    return this.call('send_control', { channel_id: channelId, control });
  }

  waitChannelEvent(
    channelId: string,
    afterCursor: string,
    options: { idle_ms?: number; timeout_ms?: number } = {},
  ): Promise<ToolPayload> {
    const waitBudget = (options.timeout_ms ?? 30_000) + this.requestTimeoutMs;
    return this.call('wait_channel_event', { channel_id: channelId, after_cursor: afterCursor, ...options }, waitBudget);
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.transport = null;
    if (client) await client.close().catch(noop);
  }
}
