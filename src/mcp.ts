import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { ChannelBackend } from './backend.js';
import { ChannelError, toStructuredError } from './errors.js';
import { getChannel, health, listChannels, readChannel, sendControl, waitChannelEvent, writeText } from './handlers.js';
import { TERMINAL_CONTROLS } from './input.js';
import { HARD_MAX_READ_BYTES, HARD_MAX_READ_LINES } from './tmux-backend.js';
import { createPhaseDiagnostics, type DiagnosticMethod, type PhaseDiagnostics, type ReadShape } from './phase-diagnostics.js';

export const MVP_001_TOOL_NAMES = ['list_channels', 'get_channel', 'read_channel'] as const;
export const MVP_002_TOOL_NAMES = [...MVP_001_TOOL_NAMES, 'write_text', 'send_control'] as const;
export const MVP_002_5_TOOL_NAMES = [...MVP_002_TOOL_NAMES, 'health'] as const;
export const PUBLIC_TOOL_NAMES = [...MVP_002_5_TOOL_NAMES, 'wait_channel_event'] as const;
export const MVP_003_TOOL_NAMES = PUBLIC_TOOL_NAMES;
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

export function createMcpServer(backend: ChannelBackend, diagnostics: PhaseDiagnostics = createPhaseDiagnostics()): McpServer {
  const server = new McpServer({ name: 'agent-runtime-mcp', version: '0.2.1' });

  server.registerTool(
    'list_channels',
    {
      description: 'List existing terminal channels visible in the configured backend scope.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (ctx) => invokeTool(diagnostics, 'list_channels', ctx, () => listChannels(backend)),
  );

  server.registerTool(
    'get_channel',
    {
      description: 'Inspect mechanical metadata and capabilities for one terminal channel.',
      inputSchema: z.object({
        channel_id: z.string().min(1).max(128).describe('Opaque channel identifier returned by list_channels.'),
        observe: z.boolean().optional().describe('Establish a bounded snapshot observation cursor.'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ channel_id, observe }, ctx) => invokeTool(diagnostics, 'get_channel', ctx, () => getChannel(backend, channel_id, observe)),
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
    async ({ channel_id, lines, bytes }, ctx) =>
      invokeTool(
        diagnostics,
        'read_channel',
        ctx,
        () =>
          readChannel(backend, channel_id, {
            ...(lines !== undefined ? { lines } : {}),
            ...(bytes !== undefined ? { bytes } : {}),
          }),
        { ...(lines !== undefined ? { requested_lines: lines } : {}), ...(bytes !== undefined ? { requested_bytes: bytes } : {}) },
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
    async ({ channel_id, text, submit }, ctx) => invokeTool(diagnostics, 'write_text', ctx, () => writeText(backend, channel_id, text, submit)),
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
    async ({ channel_id, control }, ctx) => invokeTool(diagnostics, 'send_control', ctx, () => sendControl(backend, channel_id, control)),
  );

  server.registerTool(
    'health',
    {
      description: 'Report mechanical backend/service health independently of Channel inventory or application state.',
      annotations: HEALTH_TOOL_ANNOTATIONS,
    },
    async (ctx) => invokeTool(diagnostics, 'health', ctx, () => health(backend)),
  );

  server.registerTool(
    'wait_channel_event',
    {
      description: 'Wait for mechanically observed Channel snapshot activity followed by bounded quiet; never infers completion.',
      inputSchema: z.object({
        channel_id: z.string().min(1).max(128),
        after_cursor: z.string().min(1).max(512),
        idle_ms: z.number().int().min(250).max(60000).optional(),
        timeout_ms: z.number().int().min(100).max(60000).optional(),
      }),
      annotations: HEALTH_TOOL_ANNOTATIONS,
    },
    async ({ channel_id, after_cursor, idle_ms, timeout_ms }, ctx) =>
      invokeTool(
        diagnostics,
        'wait_channel_event',
        ctx,
        () =>
          waitChannelEvent(
            backend,
            { channel_id, after_cursor, ...(idle_ms !== undefined ? { idle_ms } : {}), ...(timeout_ms !== undefined ? { timeout_ms } : {}) },
            ctx.mcpReq.signal,
          ),
      ),
  );

  return server;
}

type ToolSettlement =
  | { outcome: 'success'; payload: object }
  | { outcome: 'error'; error: unknown };

async function runTool(action: () => Promise<object>, onSettled?: (settlement: ToolSettlement) => void) {
  let payload: object;
  try {
    payload = await action();
  } catch (error) {
    try {
      onSettled?.({ outcome: 'error', error });
    } catch {
      // Diagnostics must never alter Tool behavior.
    }
    const errorPayload = toStructuredError(error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(errorPayload) }],
      structuredContent: errorPayload as unknown as Record<string, unknown>,
    };
  }

  try {
    onSettled?.({ outcome: 'success', payload });
  } catch {
    // Diagnostics must never alter Tool behavior.
  }
  try {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload as Record<string, unknown>,
    };
  } catch (error) {
    const errorPayload = toStructuredError(error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(errorPayload) }],
      structuredContent: errorPayload as unknown as Record<string, unknown>,
    };
  }
}

type ToolResult = Awaited<ReturnType<typeof runTool>>;

async function invokeTool(
  diagnostics: PhaseDiagnostics,
  method: DiagnosticMethod,
  ctx: { mcpReq: { id: unknown } },
  action: () => Promise<object>,
  readRequest?: ReadShape,
): Promise<ToolResult> {
  const span = diagnostics.start(method, ctx.mcpReq.id);
  const hasBackendPhase = method === 'read_channel';
  try {
    if (hasBackendPhase) span.backendStart(readRequest);
    const result = await runTool(action, hasBackendPhase ? (settlement) => {
      if (settlement.outcome === 'success') {
        span.backendEnd('success', payloadReadShape(settlement.payload, readRequest));
      } else {
        span.backendEnd('error', readRequest, settlement.error instanceof ChannelError ? settlement.error.code : 'INTERNAL_ERROR');
      }
    } : undefined);
    const outcome = result.isError === true ? 'error' : 'success';
    const code = resultErrorCode(result);
    span.methodEnd(outcome, code);
    return result;
  } catch (error) {
    if (hasBackendPhase) span.backendEnd('error', readRequest, 'INTERNAL_ERROR');
    span.methodEnd('error', 'INTERNAL_ERROR');
    throw error;
  }
}

function resultErrorCode(result: ToolResult): string | undefined {
  const payload = result.structuredContent;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

function payloadReadShape(payload: object, requested?: ReadShape): ReadShape {
  const read = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>).read : undefined;
  if (!read || typeof read !== 'object' || Array.isArray(read)) return requested ?? {};
  const value = read as Record<string, unknown>;
  return {
    ...requested,
    ...(Number.isSafeInteger(value.line_count) ? { returned_line_count: value.line_count as number } : {}),
    ...(Number.isSafeInteger(value.byte_count) ? { returned_byte_count: value.byte_count as number } : {}),
    ...(typeof value.truncated === 'boolean' ? { truncated: value.truncated } : {}),
  };
}
