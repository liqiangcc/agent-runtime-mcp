import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { isIP } from 'node:net';
import type { ConsoleEventBus } from './events.js';
import type { HistoryHub, HubUpdate } from './observer.js';
import type { Logger } from './logger.js';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { McpToolError, McpUnavailableError, type ConsoleMcp, type TerminalControl } from './mcp-client.js';
import { LifecycleRefusal, LifecycleTmuxError, type CreateInput, type KillInput, type LifecycleResult } from './session-lifecycle.js';
import {
  TerminalRefusal,
  clampGeometry,
  type AttachInput,
  type AttachedTerminal,
  type AttachReservation,
} from './terminal-attach.js';

/** Narrow deployment-layer port the HTTP surface needs from the adapter. */
export interface LifecyclePort {
  createSession(input: CreateInput): Promise<LifecycleResult>;
  killSession(input: KillInput): Promise<LifecycleResult>;
  profileLabels(): string[];
}

/** Narrow deployment-layer port for the terminal attach adapter. */
export interface TerminalPort {
  /** Validates enabled/scope/cap/target and holds a cap slot — never spawns. */
  reserve(input: AttachInput): AttachReservation;
  maxAttach: number;
}

export interface HttpAppDeps {
  mcp: ConsoleMcp;
  events: ConsoleEventBus;
  history: HistoryHub;
  expectedHost: string;
  publicDir: string;
  logger: Logger;
  lifecycle?: LifecyclePort;
  terminal?: TerminalPort;
}

const STATIC_FILES = new Set([
  '/index.html',
  '/app.js',
  '/transfer.js',
  '/style.css',
  '/markdown.js',
  '/viewport.js',
  '/reading.js',
  '/terminal.html',
  '/terminal.js',
  '/vendor/xterm.js',
  '/vendor/xterm.css',
  '/vendor/addon-fit.js',
  // #128: compiled pure data-path modules (build-time copies from dist/src)
  '/modules/projection.js',
  '/modules/adapter.js',
  '/modules/devin-adapter.js',
  // generated build marker (#134 stale standalone-resume self-heal); static
  // allowlist addition only — no semantic change
  '/modules/build-stamp.js',
]);
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const CONTROLS: ReadonlySet<string> = new Set(['ENTER', 'INTERRUPT', 'ESCAPE']);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MUTATION_ROUTE = /^\/api\/channels\/([^/]+)\/(text|control)$/;
const HISTORY_ROUTE = /^\/api\/channels\/([^/]+)\/(history|events)$/;
const LIFECYCLE_ROUTE = /^\/api\/lifecycle\/(sessions|kill)$/;
const LIFECYCLE_CREATE_KEYS = new Set(['name', 'cwd', 'profile']);
const LIFECYCLE_KILL_KEYS = new Set(['name', 'confirm']);
const TERMINAL_ROUTE = /^\/api\/channels\/([^/]+)\/terminal$/;
const SSE_HEARTBEAT_MS = 15_000;
// Terminal WS bounds: the ws layer already enforces a 64 KiB frame bound
// (maxPayload); single input messages are additionally capped well below it —
// terminal traffic is keystrokes, not bulk transfer. Oversized input is
// dropped, never logged.
const MAX_INPUT_DATA = 16 * 1024;
// The upgrade query may carry geometry only — target identity comes solely
// from channel_id -> get_channel backend_metadata.tmux; any other key
// (session/pane/target/tmux-shaped or not) is refused outright.
const TERMINAL_QUERY_KEYS = new Set(['cols', 'rows']);

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

  /**
   * Deployment-layer session lifecycle. Present only when the operator opted
   * in; with lifecycle disabled every route below 404s — no surface exists.
   * Bodies are strictly whitelisted: create takes name/cwd/profile only
   * (no free-form command), kill takes name + explicit confirm:true.
   */
  async function handleLifecycle(
    req: IncomingMessage,
    res: ServerResponse,
    action: 'sessions' | 'kill',
  ): Promise<number> {
    const lifecycle = deps.lifecycle;
    if (!lifecycle) {
      sendError(res, 404, 'NOT_FOUND', 'not found');
      return 404;
    }
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
    const allowed = action === 'sessions' ? LIFECYCLE_CREATE_KEYS : LIFECYCLE_KILL_KEYS;
    if (Object.keys(value).some((key) => !allowed.has(key))) {
      sendError(res, 400, 'INVALID_ARGUMENT', `body may only contain: ${[...allowed].join(', ')}`);
      return 400;
    }
    // Audit actor is mechanical: the socket peer address, never a body field.
    const actor = req.socket.remoteAddress ?? 'unknown';
    try {
      if (action === 'sessions') {
        const { name, cwd, profile } = value;
        if (typeof name !== 'string' || typeof cwd !== 'string' || typeof profile !== 'string') {
          sendError(res, 400, 'INVALID_ARGUMENT', 'body must contain "name", "cwd" and "profile" strings');
          return 400;
        }
        const result = await lifecycle.createSession({ name, cwd, profile, actor });
        sendJson(res, 200, { session: result.session, created: true });
        return 200;
      }
      const { name, confirm } = value;
      if (typeof name !== 'string' || confirm !== true) {
        sendError(res, 400, 'INVALID_ARGUMENT', 'body must contain "name": string and "confirm": true');
        return 400;
      }
      const result = await lifecycle.killSession({ name, actor });
      sendJson(res, 200, { session: result.session, killed: true });
      return 200;
    } catch (error) {
      if (error instanceof LifecycleRefusal) {
        sendError(res, 422, 'LIFECYCLE_REFUSED', error.message);
        return 422;
      }
      if (error instanceof LifecycleTmuxError) {
        sendError(res, 502, 'TMUX_ERROR', 'session operation failed');
        return 502;
      }
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

      const lifecycleMatch = method === 'POST' ? LIFECYCLE_ROUTE.exec(path) : null;
      if (lifecycleMatch) {
        status = await handleLifecycle(req, res, lifecycleMatch[1] as 'sessions' | 'kill');
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
      if (path === '/api/lifecycle') {
        const lifecycle = deps.lifecycle;
        if (!lifecycle) {
          status = 404;
          sendError(res, status, 'NOT_FOUND', 'not found');
          return;
        }
        status = 200;
        sendJson(res, status, { enabled: true, profiles: lifecycle.profileLabels() });
        return;
      }
      if (path === '/api/terminal') {
        const terminal = deps.terminal;
        if (!terminal) {
          status = 404;
          sendError(res, status, 'NOT_FOUND', 'not found');
          return;
        }
        status = 200;
        sendJson(res, status, { enabled: true, maxAttach: terminal.maxAttach });
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
 * Upgrade requests are refused after the same Origin/Host authority check.
 * With terminal attach enabled, exactly one path upgrades —
 * GET /api/channels/:id/terminal — resolved to a tmux pane only through the
 * public get_channel backend_metadata. Everything else gets a plain 403.
 */
export function rejectUpgrade(
  req: IncomingMessage,
  socket: { end(data: string): void },
  expectedHost: string,
  logger: Logger,
  reason = 'no websocket endpoints in this build',
): void {
  const check = checkRequestAuthority(req, expectedHost);
  logger('upgrade_rejected', {
    path: typeof req.url === 'string' ? req.url : '/',
    reason: check.ok ? reason : check.reason,
  });
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
}

function endUpgrade(socket: Duplex, status: number, text: string): void {
  const reason = text.replace(/[^\w -]/g, '_').slice(0, 64) || 'error';
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
}

/**
 * Bridges one WebSocket to one pty-attached tmux client. Client→server frames
 * are JSON control messages only: {type:'input',data} and
 * {type:'resize',cols,rows}. Server→client frames are raw pty output text.
 * The pty dies with the socket (and vice versa) — never outliving it.
 */
function bridgeTerminal(ws: WebSocket, attached: AttachedTerminal): void {
  attached.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  attached.onExit(() => {
    try {
      ws.close();
    } catch {
      // already closing
    }
  });
  ws.on('message', (raw: Buffer, isBinary: boolean) => {
    void isBinary;
    let msg: { type?: unknown; data?: unknown; cols?: unknown; rows?: unknown };
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (msg?.type === 'input' && typeof msg.data === 'string') {
      if (msg.data.length <= MAX_INPUT_DATA) attached.write(msg.data);
    } else if (msg?.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
      attached.resize(msg.cols, msg.rows);
    }
  });
  ws.on('close', () => attached.dispose());
  ws.on('error', () => attached.dispose());
}

export function createUpgradeHandler(deps: HttpAppDeps) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  return async (req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> => {
    const path = safePath(req.url);
    const check = checkRequestAuthority(req, deps.expectedHost);
    const match = TERMINAL_ROUTE.exec(path);
    if (!check.ok) {
      rejectUpgrade(req, socket, deps.expectedHost, deps.logger);
      return;
    }
    if (!match) {
      rejectUpgrade(req, socket, deps.expectedHost, deps.logger, 'unsupported upgrade path');
      return;
    }
    const terminal = deps.terminal;
    if (!terminal) {
      rejectUpgrade(req, socket, deps.expectedHost, deps.logger, 'terminal attach is disabled');
      return;
    }
    let channelId: string;
    try {
      channelId = decodeURIComponent(match[1]);
    } catch {
      deps.logger('upgrade_rejected', { path, reason: 'invalid channel id encoding' });
      endUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://console.internal');
    if ([...url.searchParams.keys()].some((key) => !TERMINAL_QUERY_KEYS.has(key))) {
      deps.logger('upgrade_rejected', { path, reason: 'unexpected query key' });
      endUpgrade(socket, 400, 'only cols/rows query keys are accepted');
      return;
    }
    let tmux: unknown;
    try {
      const payload = await deps.mcp.getChannel(channelId);
      tmux = (payload?.channel as Record<string, unknown> | undefined)?.backend_metadata;
      tmux = (tmux as Record<string, unknown> | undefined)?.tmux;
    } catch (error) {
      const mapped = mapError(error);
      deps.logger('upgrade_rejected', { path, reason: `get_channel: ${mapped.code}` });
      endUpgrade(socket, mapped.status, mapped.code);
      return;
    }
    const { cols, rows } = clampGeometry(
      Number(url.searchParams.get('cols')) || 80,
      Number(url.searchParams.get('rows')) || 24,
    );
    const actor = req.socket.remoteAddress ?? 'unknown';
    // Preflight reserves a cap slot WITHOUT spawning — refusal statuses stay
    // plain HTTP (403 target/scope, 429 cap) because the socket has not
    // upgraded yet.
    let reservation: AttachReservation;
    try {
      reservation = terminal.reserve({ tmux: tmux as AttachInput['tmux'], cols, rows, actor });
    } catch (error) {
      if (error instanceof TerminalRefusal) {
        const status = error.reason === 'attach_cap' ? 429 : 403;
        deps.logger('upgrade_rejected', { path, reason: error.reason });
        endUpgrade(socket, status, error.reason);
      } else {
        deps.logger('upgrade_rejected', { path, reason: 'attach check failed' });
        endUpgrade(socket, 500, 'attach check failed');
      }
      return;
    }
    // The PTY spawns only inside the successful-upgrade callback. If ws aborts
    // the handshake it destroys the socket — the reservation is released and
    // pty count stays exactly zero: no spawn, no orphan, cap slot freed.
    let upgraded = false;
    const release = (): void => {
      if (!upgraded) reservation.dispose();
    };
    socket.once('close', release);
    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        upgraded = true;
        socket.removeListener('close', release);
        let attached: AttachedTerminal;
        try {
          attached = reservation.commit();
        } catch {
          // native-pty load/spawn failure after a good handshake — the slot was
          // already released by commit; close the fresh socket, no orphan.
          deps.logger('upgrade_rejected', { path, reason: 'pty_unavailable' });
          ws.close(1011, 'attach failed');
          return;
        }
        bridgeTerminal(ws, attached);
      });
    } catch {
      release();
      socket.destroy();
    }
  };
}
