import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { ChannelBackend } from './backend.js';
import { toStructuredError } from './errors.js';
import { getChannel, health, listChannels, readChannel, sendControl, writeText } from './handlers.js';
import { TERMINAL_CONTROLS } from './input.js';
import { HARD_MAX_READ_BYTES, HARD_MAX_READ_LINES } from './tmux-backend.js';

export const MVP_001_TOOL_NAMES = ['list_channels', 'get_channel', 'read_channel'] as const;
export const MVP_002_TOOL_NAMES = [...MVP_001_TOOL_NAMES, 'write_text', 'send_control'] as const;
export const MVP_002_5_TOOL_NAMES = [...MVP_002_TOOL_NAMES, 'health'] as const;
export const MUTATION_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
} as const;
export const HEALTH_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
} as const;

export function createMcpServer(backend: ChannelBackend): McpServer {
  const server = new McpServer({ name: 'agent-runtime-mcp', version: '0.1.0' });

  server.registerTool(
    'list_channels',
    {
      description: 'List existing terminal channels visible in the configured backend scope.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(() => listChannels(backend)),
  );

  server.registerTool(
    'get_channel',
    {
      description: 'Inspect mechanical metadata and capabilities for one terminal channel.',
      inputSchema: z.object({
        channel_id: z.string().min(1).max(128).describe('Opaque channel identifier returned by list_channels.'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ channel_id }) => runTool(() => getChannel(backend, channel_id)),
  );

  server.registerTool(
    'read_channel',
    {
      description: 'Read bounded recent terminal output from one channel without waiting for semantic completion.',
      inputSchema: z.object({
        channel_id: z.string().min(1).max(128).describe('Opaque channel identifier returned by list_channels.'),
        lines: z.number().int().min(1).max(HARD_MAX_READ_LINES).optional(),
        bytes: z.number().int().min(1).max(HARD_MAX_READ_BYTES).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ channel_id, lines, bytes }) =>
      runTool(() =>
        readChannel(backend, channel_id, {
          ...(lines !== undefined ? { lines } : {}),
          ...(bytes !== undefined ? { bytes } : {}),
        }),
      ),
  );

  server.registerTool(
    'write_text',
    {
      description:
        'Deliver bounded ordinary Unicode terminal text to one existing channel. LF/TAB are allowed; explicit controls use send_control.',
      inputSchema: z.object({
        channel_id: z.string().min(1).max(128).describe('Opaque channel identifier returned by list_channels.'),
        text: z.string().describe('Ordinary terminal text; maximum 1 MiB UTF-8, excluding non-LF/TAB control characters.'),
        submit: z.boolean().describe('Append one explicit ENTER only after text transport succeeds.'),
      }),
      annotations: MUTATION_TOOL_ANNOTATIONS,
    },
    async ({ channel_id, text, submit }) => runTool(() => writeText(backend, channel_id, text, submit)),
  );

  server.registerTool(
    'send_control',
    {
      description: 'Send one explicit reviewed terminal control to an existing channel.',
      inputSchema: z.object({
        channel_id: z.string().min(1).max(128).describe('Opaque channel identifier returned by list_channels.'),
        control: z.enum(TERMINAL_CONTROLS),
      }),
      annotations: MUTATION_TOOL_ANNOTATIONS,
    },
    async ({ channel_id, control }) => runTool(() => sendControl(backend, channel_id, control)),
  );

  server.registerTool(
    'health',
    {
      description: 'Report mechanical backend/service health independently of Channel inventory or application state.',
      annotations: HEALTH_TOOL_ANNOTATIONS,
    },
    async () => runTool(() => health(backend)),
  );

  return server;
}

async function runTool(action: () => Promise<object>) {
  try {
    const payload = await action();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload as Record<string, unknown>,
    };
  } catch (error) {
    const payload = toStructuredError(error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload as unknown as Record<string, unknown>,
    };
  }
}
