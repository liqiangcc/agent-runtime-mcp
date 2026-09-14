import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { isIP } from 'node:net';
import type { Logger } from './logger.js';
import { McpToolError, McpUnavailableError, type ConsoleMcp } from './mcp-client.js';

export interface HttpAppDeps {
  mcp: ConsoleMcp;
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

export function createRequestHandler(deps: HttpAppDeps) {
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
      if (method !== 'GET' && method !== 'HEAD') {
        status = 405;
        sendError(res, status, 'METHOD_NOT_ALLOWED', 'only GET is supported');
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
