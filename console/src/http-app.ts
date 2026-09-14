import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { isIP } from 'node:net';
import type { ConsoleEventBus } from './events.js';
import type { HistoryHub, HubUpdate } from './observer.js';
import type { Logger } from './logger.js';
import { McpToolError, McpUnavailableError, type ConsoleMcp, type TerminalControl } from './mcp-client.js';

export interface HttpAppDeps {
  mcp: ConsoleMcp;
  events: ConsoleEventBus;
  history: HistoryHub;
  expectedHost: string;
  publicDir: string;
  logger: Logger;
}

const STATIC_FILES = new Set(['/index.html', '/app.js', '/style.css']);
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const CONTROLS: ReadonlySet<string> = new Set(['ENTER', 'INTERRUPT', 'ESCAPE']);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MUTATION_ROUTE = /^\/api\/channels\/([^/]+)\/(text|control)$/;
const HISTORY_ROUTE = /^\/api\/channels\/([^/]+)\/(history|events)$/;
const SSE_HEARTBEAT_MS = 15_000;

export function expectedAuthority(bind: string, port: number): string {
  return isIP(bind) === 6 ? `[${bind}]:${port}` : `${bind}:${port}`;
}

export type AuthorityCheck = { ok: true } | { ok: false; reason: string };

/**
 * Host must match the bound address:port exactly; when an Origin header is
 * present it must resolve to the same authority. This is the only Console-side
 * request check — access control itself is the tailnet's job.
 */
export function checkRequestAuthority(req: IncomingMessage, expectedHost: string): AuthorityCheck {
  const host = req.headers.host;
  if (typeof host !== 'string' || host.toLowerCase() !== expectedHost.toLowerCase()) {
    return { ok: false, reason: 'Host does not match the bound address' };
  }
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return { ok: false, reason: 'Origin is not a valid URL' };
    }
    if (originHost.toLowerCase() !== expectedHost.toLowerCase()) {
      return { ok: false, reason: 'Origin does not match the bound address' };
    }
  }
  return { ok: true };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message } });
}

function mapError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof McpUnavailableError) {
    return { status: 503, code: 'MCP_UNAVAILABLE', message: 'agent-runtime-mcp is unavailable' };
  }
  if (error instanceof McpToolError) {
    switch (error.code) {
      case 'CHANNEL_NOT_FOUND':
        return { status: 404, code: error.code, message: error.message };
      case 'CHANNEL_UNAVAILABLE':
      case 'BACKEND_UNAVAILABLE':
        return { status: 503, code: error.code, message: error.message };
      case 'INVALID_ARGUMENT':
      case 'WAIT_ARGUMENT_INVALID':
      case 'CURSOR_INVALID':
      case 'CURSOR_EXPIRED':
      case 'OBSERVATION_GAP':
      case 'CHANNEL_INSTANCE_CHANGED':
        return { status: 400, code: error.code, message: error.message };
      case 'TIMEOUT':
        return { status: 504, code: error.code, message: error.message };
      case 'WAITER_LIMIT':
      case 'RESOURCE_EXHAUSTED':
        return { status: 429, code: error.code, message: error.message };
      default:
        return { status: 502, code: error.code, message: error.message };
    }
  }
  return { status: 500, code: 'INTERNAL', message: 'unexpected console error' };
}

async function serveStatic(
  res: ServerResponse,
  publicDir: string,
  name: string,
  headOnly: boolean,
): Promise<number> {
  const filePath = join(publicDir, name);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    sendError(res, 404, 'NOT_FOUND', 'not found');
    return 404;
  }
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(name)] ?? 'application/octet-stream',
    'content-length': fileStat.size,
    'cache-control': 'no-store',
  });
  if (headOnly) {
    res.end();
    return 200;
  }
  createReadStream(filePath).pipe(res);
  return 200;
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; message: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      tooLarge = true;
      continue;
    }
    if (!tooLarge) {
      chunks.push(chunk as Buffer);
    }
  }
  if (tooLarge) {
    return { ok: false, status: 413, message: 'request body too large' };
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, status: 400, message: 'request body must be valid JSON' };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAmbiguousTimeout(error: unknown): boolean {
  return error instanceof McpToolError && error.code === 'TIMEOUT';
}

export function createRequestHandler(deps: HttpAppDeps) {
  async function handleMutation(
    req: IncomingMessage,
    res: ServerResponse,
    kind: 'text' | 'control',
    channelId: string,
  ): Promise<number> {
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendError(res, body.status, 'INVALID_ARGUMENT', body.message);
      return body.status;
    }
    const value = body.value;
    if (!isRecord(value)) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'request body must be a JSON object');
      return 400;
    }

    if (kind === 'text') {
      const { text } = value;
      if (typeof text !== 'string') {
        sendError(res, 400, 'INVALID_ARGUMENT', 'body must contain "text": string');
        return 400;
      }
      if ('submit' in value && typeof value.submit !== 'boolean') {
        sendError(res, 400, 'INVALID_ARGUMENT', '"submit" must be a boolean');
        return 400;
      }
      const submit = value.submit === undefined ? true : (value.submit as boolean);
      const bytes = Buffer.byteLength(text, 'utf8');
      try {
        const result = await deps.mcp.writeText(channelId, text, submit);
        deps.events.emit({
          type: 'user-turn',
          channel_id: channelId,
          text,
          submit,
          sent_at: new Date().toISOString(),
          transport_result: 'delivered',
        });
        deps.logger('mutation', { route: 'text', channel_id: channelId, result: 'delivered', bytes });
        sendJson(res, 200, { transport_result: 'delivered', result });
        return 200;
      } catch (error) {
        if (isAmbiguousTimeout(error)) {
          deps.events.emit({
            type: 'user-turn',
            channel_id: channelId,
            text,
            submit,
            sent_at: new Date().toISOString(),
            transport_result: 'ambiguous',
          });
          deps.logger('mutation', { route: 'text', channel_id: channelId, result: 'ambiguous', bytes });
          sendError(res, 504, 'TIMEOUT', 'ambiguous: the text may have been delivered');
          return 504;
        }
        deps.logger('mutation', { route: 'text', channel_id: channelId, result: 'rejected', bytes });
        throw error;
      }
    }

    const { control } = value;
    if (typeof control !== 'string' || !CONTROLS.has(control)) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'control must be one of ENTER|INTERRUPT|ESCAPE');
      return 400;
    }
    const terminalControl = control as TerminalControl;
    try {
      const result = await deps.mcp.sendControl(channelId, terminalControl);
      deps.events.emit({
        type: 'control',
        channel_id: channelId,
        control: terminalControl,
        sent_at: new Date().toISOString(),
        transport_result: 'delivered',
      });
      deps.logger('mutation', { route: 'control', channel_id: channelId, control, result: 'delivered' });
      sendJson(res, 200, { transport_result: 'delivered', result });
      return 200;
    } catch (error) {
      if (isAmbiguousTimeout(error)) {
        deps.events.emit({
          type: 'control',
          channel_id: channelId,
          control: terminalControl,
          sent_at: new Date().toISOString(),
          transport_result: 'ambiguous',
        });
        deps.logger('mutation', { route: 'control', channel_id: channelId, control, result: 'ambiguous' });
        sendError(res, 504, 'TIMEOUT', 'ambiguous: the control may have been delivered');
        return 504;
      }
      deps.logger('mutation', { route: 'control', channel_id: channelId, control, result: 'rejected' });
      throw error;
    }
  }

  function handleHistory(req: IncomingMessage, res: ServerResponse, channelId: string): number {
    let format: string | null = null;
    try {
      format = new URL(req.url ?? '/', 'http://console.internal').searchParams.get('format');
    } catch {
      format = null;
    }
    if (format === 'raw') {
      const body = deps.history.rawTranscript(channelId);
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
      });
      res.end(body);
      return 200;
    }
    sendJson(res, 200, deps.history.snapshot(channelId));
    return 200;
  }

  /**
   * Read-only SSE push of ring updates. This is a plain HTTP/1.1 GET — no
   * WebSocket upgrade — and runs after the same Origin/Host authority check
   * as every other route. The connection stays open until the client leaves;
   * the last viewer detaching stops the Channel's observe loop.
   */
  function handleEvents(req: IncomingMessage, res: ServerResponse, channelId: string): number {
    const pending: string[] = [];
    let headersSent = false;
    const listener = (update: HubUpdate): void => {
      const frame = `event: ${update.type}\ndata: ${JSON.stringify(update)}\n\n`;
      if (headersSent) {
        res.write(frame);
      } else {
        pending.push(frame);
      }
    };
    let detach: (() => void) | undefined;
    try {
      detach = deps.history.addViewer(channelId, listener);
    } catch (error) {
      const mapped = mapError(error);
      sendError(res, mapped.status, mapped.code, mapped.message);
      return mapped.status;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    headersSent = true;
    res.write('retry: 3000\n\n');
    for (const frame of pending) res.write(frame);
    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, SSE_HEARTBEAT_MS);
    let closed = false;
    res.on('close', () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      detach?.();
    });
    deps.logger('sse_open', { channel_id: channelId });
    return 200;
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = Date.now();
    const method = req.method ?? 'GET';
    const path = safePath(req.url);
    let status = 500;
    try {
      const authority = checkRequestAuthority(req, deps.expectedHost);
      if (!authority.ok) {
        status = 403;
        sendError(res, status, 'FORBIDDEN', authority.reason);
        return;
      }

      const mutationMatch = method === 'POST' ? MUTATION_ROUTE.exec(path) : null;
      if (mutationMatch) {
        let channelId: string;
        try {
          channelId = decodeURIComponent(mutationMatch[1]);
        } catch {
          status = 400;
          sendError(res, status, 'INVALID_ARGUMENT', 'invalid channel id encoding');
          return;
        }
        status = await handleMutation(req, res, mutationMatch[2] as 'text' | 'control', channelId);
        return;
      }
      if (method !== 'GET' && method !== 'HEAD') {
        status = 405;
        sendError(res, status, 'METHOD_NOT_ALLOWED', 'unsupported method');
        return;
      }

      if (path === '/api/health') {
        status = 200;
        sendJson(res, status, await deps.mcp.health());
        return;
      }
      if (path === '/api/channels') {
        status = 200;
        sendJson(res, status, await deps.mcp.listChannels());
        return;
      }

      const historyMatch = HISTORY_ROUTE.exec(path);
      if (historyMatch) {
        let channelId: string;
        try {
          channelId = decodeURIComponent(historyMatch[1]);
        } catch {
          status = 400;
          sendError(res, status, 'INVALID_ARGUMENT', 'invalid channel id encoding');
          return;
        }
        if (historyMatch[2] === 'events') {
          status = handleEvents(req, res, channelId);
        } else {
          status = handleHistory(req, res, channelId);
        }
        return;
      }

      if (path.startsWith('/api/channels/')) {
        let channelId: string;
        try {
          channelId = decodeURIComponent(path.slice('/api/channels/'.length));
        } catch {
          status = 400;
          sendError(res, status, 'INVALID_ARGUMENT', 'invalid channel id encoding');
          return;
        }
        if (channelId.length === 0 || channelId.includes('/')) {
          status = 404;
          sendError(res, status, 'NOT_FOUND', 'not found');
          return;
        }
        status = 200;
        sendJson(res, status, await deps.mcp.getChannel(channelId));
        return;
      }

      const staticName = path === '/' ? '/index.html' : path;
      if (STATIC_FILES.has(staticName)) {
        status = await serveStatic(res, deps.publicDir, staticName, method === 'HEAD');
        return;
      }
      status = 404;
      sendError(res, status, 'NOT_FOUND', 'not found');
    } catch (error) {
      const mapped = mapError(error);
      status = mapped.status;
      sendError(res, status, mapped.code, mapped.message);
    } finally {
      deps.logger('http_request', { method, path, status, duration_ms: Date.now() - started });
    }
  };
}

function safePath(rawUrl: string | undefined): string {
  try {
    return new URL(rawUrl ?? '/', 'http://console.internal').pathname;
  } catch {
    return '/';
  }
}

/**
 * There are no WebSocket endpoints in this slice; every upgrade attempt is
 * refused after the same Origin/Host authority check.
 */
export function rejectUpgrade(
  req: IncomingMessage,
  socket: { end(data: string): void },
  expectedHost: string,
  logger: Logger,
): void {
  const check = checkRequestAuthority(req, expectedHost);
  logger('upgrade_rejected', {
    path: typeof req.url === 'string' ? req.url : '/',
    reason: check.ok ? 'no websocket endpoints in this build' : check.reason,
  });
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
}
