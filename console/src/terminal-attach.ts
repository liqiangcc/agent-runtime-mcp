/**
 * Terminal attach adapter — the ONLY Console module that may invoke tmux
 * `attach-session` (static boundary guard exception point, Guard B).
 *
 * Deployment-layer authority, default off (CONSOLE_TERMINAL_ENABLED). Spawns
 * one node-pty client per viewer running `tmux attach-session` on the
 * configured socket — executable + argv, never a shell. The attach target is
 * derived mechanically from get_channel backend_metadata.tmux (session name +
 * window/pane IDs); user-typed tmux target grammar is never accepted.
 * The MCP has no attach capability; this adapter talks to the same tmux
 * socket and enforces the same TMUX_ALLOWED_SESSIONS scope.
 */
import { createRequire } from 'node:module';
import type { ConsoleConfig } from './config.js';
import type { Logger } from './logger.js';
import { SESSION_NAME_RE } from './session-lifecycle.js';

const WINDOW_ID_RE = /^@[0-9]+$/;
const PANE_ID_RE = /^%[0-9]+$/;
export const MIN_COLS = 20;
export const MAX_COLS = 400;
export const MIN_ROWS = 5;
export const MAX_ROWS = 120;

/** tmux pane identity resolved from public get_channel backend_metadata. */
export interface TmuxTarget {
  session_name: string;
  window_id?: string;
  pane_id?: string;
}

export interface AttachInput {
  tmux: TmuxTarget;
  cols: number;
  rows: number;
  /** Mechanically derived peer address from the HTTP boundary. */
  actor: string;
}

/** Minimal PTY surface (node-pty IPty) — injectable for tests. */
export interface PtyProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number }) => void): void;
}

export type PtySpawner = (argv: string[], opts: { cols: number; rows: number }) => PtyProcess;

export class TerminalRefusal extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'TerminalRefusal';
    this.reason = reason;
  }
}

export class TerminalUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalUnavailable';
  }
}

export interface AttachedTerminal {
  readonly session: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number }) => void): void;
  /** Terminates the pty/tmux client; idempotent; releases the cap slot. */
  dispose(): void;
}

export interface TerminalDeps {
  config: ConsoleConfig;
  logger?: Logger;
  spawner?: PtySpawner;
}

/**
 * One-shot cap-slot reservation: validates and holds a slot without spawning.
 * commit() consumes it and spawns exactly one PTY; dispose() releases it.
 * Reserved + active slots together count against CONSOLE_MAX_ATTACH, so a
 * held reservation still caps concurrent attaches.
 */
export interface AttachReservation {
  commit(): AttachedTerminal;
  dispose(): void;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function clampGeometry(cols: number, rows: number): { cols: number; rows: number } {
  return { cols: clamp(Math.floor(cols) || 80, MIN_COLS, MAX_COLS), rows: clamp(Math.floor(rows) || 24, MIN_ROWS, MAX_ROWS) };
}

export class TerminalAttach {
  private readonly enabled: boolean;
  readonly maxAttach: number;
  private readonly allowedSessions: string[];
  private readonly socketArgs: string[];
  private readonly logger: Logger;
  private readonly spawner: PtySpawner;
  private active = 0;
  private reserved = 0;

  constructor(deps: TerminalDeps) {
    this.enabled = deps.config.terminal.enabled;
    this.maxAttach = deps.config.terminal.maxAttach;
    const tmuxEnv = deps.config.tmuxEnv;
    // Same scope as the MCP: when TMUX_ALLOWED_SESSIONS is configured, only
    // those session names may be attached; unset means unrestricted.
    this.allowedSessions = (tmuxEnv.TMUX_ALLOWED_SESSIONS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    this.socketArgs = tmuxEnv.TMUX_SOCKET_PATH
      ? ['-S', tmuxEnv.TMUX_SOCKET_PATH]
      : tmuxEnv.TMUX_SOCKET_NAME
        ? ['-L', tmuxEnv.TMUX_SOCKET_NAME]
        : [];
    this.logger = deps.logger ?? (() => undefined);
    this.spawner = deps.spawner ?? defaultPtySpawner();
  }

  activeCount(): number {
    return this.active;
  }

  /** Outstanding reservations — held cap slots that have not spawned yet. */
  reservedCount(): number {
    return this.reserved;
  }

  /** Validates the backend_metadata.tmux payload into a checked target. */
  private resolveTarget(tmux: TmuxTarget): { session: string; argv: string[] } {
    const session = tmux?.session_name;
    if (typeof session !== 'string' || !SESSION_NAME_RE.test(session)) {
      throw new TerminalRefusal('invalid_target', 'channel has no valid tmux session identity');
    }
    if (this.allowedSessions.length > 0 && !this.allowedSessions.includes(session)) {
      throw new TerminalRefusal('out_of_scope', 'session is outside the configured tmux scope');
    }
    // Mechanical argv: attach the session, then select the channel's own
    // window/pane by their stable tmux IDs. Optional — absent IDs degrade to
    // session-level attach; malformed IDs are refused, never interpolated.
    const argv = ['attach-session', '-t', session];
    const windowId = tmux.window_id;
    const paneId = tmux.pane_id;
    if (windowId !== undefined) {
      if (typeof windowId !== 'string' || !WINDOW_ID_RE.test(windowId)) {
        throw new TerminalRefusal('invalid_target', 'channel has a malformed tmux window id');
      }
      argv.push(';', 'select-window', '-t', windowId);
    }
    if (paneId !== undefined) {
      if (typeof paneId !== 'string' || !PANE_ID_RE.test(paneId)) {
        throw new TerminalRefusal('invalid_target', 'channel has a malformed tmux pane id');
      }
      argv.push(';', 'select-pane', '-t', paneId);
    }
    return { session, argv };
  }

  /**
   * Validates the target and takes a cap slot WITHOUT spawning — the HTTP
   * boundary uses this so refusals keep status semantics (403 target/scope,
   * 429 cap) before the socket upgrades. commit() is the only spawn point,
   * called only after the WebSocket handshake succeeds; a failed handshake
   * releases the slot with pty count untouched.
   */
  reserve(input: AttachInput): AttachReservation {
    try {
      if (!this.enabled) throw new TerminalRefusal('disabled', 'terminal attach is disabled');
      if (this.active + this.reserved >= this.maxAttach) {
        throw new TerminalRefusal('attach_cap', 'concurrent attach limit reached');
      }
      const { session, argv } = this.resolveTarget(input.tmux);
      const { cols, rows } = clampGeometry(input.cols, input.rows);
      this.reserved += 1;
      let consumed = false;
      const self = this;
      return {
        commit(): AttachedTerminal {
          if (consumed) {
            throw new TerminalRefusal('reservation_consumed', 'reservation already consumed');
          }
          consumed = true;
          self.reserved -= 1;
          return self.spawnAttached(input.actor, session, argv, cols, rows);
        },
        dispose(): void {
          if (consumed) return;
          consumed = true;
          self.reserved -= 1;
        },
      };
    } catch (error) {
      const session = typeof input?.tmux?.session_name === 'string' ? input.tmux.session_name : '';
      if (error instanceof TerminalRefusal) {
        this.audit(input?.actor ?? '', session, 'refused', error.reason);
      } else {
        this.audit(input?.actor ?? '', session, 'error');
      }
      throw error;
    }
  }

  /** Convenience: reserve + commit in one step (direct-use/tests). */
  attach(input: AttachInput): AttachedTerminal {
    return this.reserve(input).commit();
  }

  private spawnAttached(actor: string, session: string, argv: string[], cols: number, rows: number): AttachedTerminal {
    let pty: PtyProcess;
    try {
      pty = this.spawner([...this.socketArgs, ...argv], { cols, rows });
    } catch {
      this.audit(actor, session, 'error');
      throw new TerminalUnavailable('pty attach failed');
    }
    this.active += 1;
    const self = this;
    let disposed = false;
    const attached: AttachedTerminal = {
      session,
      write(data: string): void {
        if (!disposed) pty.write(data);
      },
      resize(nextCols: number, nextRows: number): void {
        if (disposed) return;
        const g = clampGeometry(nextCols, nextRows);
        pty.resize(g.cols, g.rows);
      },
      onData(cb: (data: string) => void): void {
        pty.onData(cb);
      },
      onExit(cb: (event: { exitCode: number }) => void): void {
        pty.onExit((event) => {
          attached.dispose();
          cb(event);
        });
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        self.active -= 1;
        try {
          pty.kill();
        } catch {
          // already dead — kill is best-effort
        }
      },
    };
    this.audit(actor, session, 'ok');
    return attached;
  }

  private audit(actor: string, session: string, result: 'ok' | 'refused' | 'error', reason?: string): void {
    // Metadata only — actor/action/session/result; never byte streams or secrets.
    this.logger('terminal_attach', { actor: actor.slice(0, 64), action: 'attach', session: session.slice(0, 64), result, reason });
  }
}

/**
 * The real node-pty spawner — exported for a focused native-build test. The
 * module is ESM, so the native dependency loads through createRequire, lazily,
 * so the Console still starts (with attach refused) on hosts where the native
 * module is unavailable. The PTY child inherits the host's string environment
 * (the tmux client needs it) with TERM overridden — env is never logged.
 */
export function defaultPtySpawner(): PtySpawner {
  const load = createRequire(import.meta.url);
  let mod: typeof import('node-pty') | null = null;
  return (argv, opts) => {
    if (!mod) {
      mod = load('node-pty') as typeof import('node-pty');
    }
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value;
    }
    env.TERM = 'xterm-256color';
    return mod.spawn('tmux', argv, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: process.cwd(),
      env,
    });
  };
}
