import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { ChannelBackend } from './backend.js';
import { toStructuredError } from './errors.js';
import { getChannel, listChannels, readChannel } from './handlers.js';
import { HARD_MAX_READ_BYTES, HARD_MAX_READ_LINES } from './tmux-backend.js';

export const MVP_001_TOOL_NAMES = ['list_channels', 'get_channel', 'read_channel'] as const;

export function createMcpServer(backend: ChannelBackend): McpServer {
  const server = new McpServer({ name: 'agent-runtime-mcp', version: '0.1.0' });

  server.registerTool(
    'list_channels',
    {
      description: 'List existing terminal channels visible in the configured backend scope.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runReadOnlyTool(() => listChannels(backend)),
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
    async ({ channel_id }) => runReadOnlyTool(() => getChannel(backend, channel_id)),
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
      runReadOnlyTool(() =>
        readChannel(backend, channel_id, {
          ...(lines !== undefined ? { lines } : {}),
          ...(bytes !== undefined ? { bytes } : {}),
        }),
      ),
  );

  return server;
}

async function runReadOnlyTool(action: () => Promise<object>) {
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
