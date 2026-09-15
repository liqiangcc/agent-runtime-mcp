/**
 * Session lifecycle adapter — the ONLY Console module that may invoke tmux
 * `new-session` / `kill-session` (static boundary guard exception point).
 *
 * Deployment-layer authority, default off. tmux is executed strictly as
 * executable + argv through execFile — never a shell, never a free-form
 * command string. The MCP has no lifecycle capability; this adapter talks to
 * the same tmux socket the Console is scoped to.
 */
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { ConsoleConfig } from './config.js';
import type { Logger } from './logger.js';

export const SESSION_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface LifecycleResult {
  ok: true;
  session: string;
}

/**
 * `actor` is supplied mechanically by the HTTP boundary from the socket
 * address — the request body can never set it. Audit lines carry only
 * actor/action/session/result/reason: never argv, command output, or secrets.
 */
export interface CreateInput {
  name: string;
  cwd: string;
  profile: string;
  actor: string;
}

export interface KillInput {
  name: string;
  actor: string;
}

export class LifecycleRefusal extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'LifecycleRefusal';
    this.reason = reason;
  }
}

export class LifecycleTmuxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleTmuxError';
  }
}

export type TmuxRunner = (argv: string[]) => Promise<void>;

export interface LifecycleDeps {
  config: ConsoleConfig;
  logger?: Logger;
  runner?: TmuxRunner;
}

function defaultRunner(argv: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile('tmux', argv, { timeout: 10_000 }, (error) => {
      if (error) reject(new LifecycleTmuxError('tmux exited non-zero'));
      else resolvePromise();
    });
  });
}

export class SessionLifecycle {
  private readonly enabled: boolean;
  private readonly profiles: Record<string, { argv: string[] }>;
  private readonly roots: string[];
  private readonly protectedSessions: Set<string>;
  private readonly allowedSessions: string[];
  private readonly socketArgs: string[];
  private readonly logger: Logger;
  private readonly runner: TmuxRunner;

  constructor(deps: LifecycleDeps) {
    const lc = deps.config.lifecycle;
    this.enabled = lc.enabled;
    this.profiles = lc.profiles;
    this.roots = lc.allowedCwdRoots;
    this.protectedSessions = new Set(lc.protectedSessions);
    const tmuxEnv = deps.config.tmuxEnv;
    // Same scope as the MCP: when TMUX_ALLOWED_SESSIONS is configured, only
    // those names may be created or killed here; unset means unrestricted.
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
    this.runner = deps.runner ?? defaultRunner;
  }

  profileLabels(): string[] {
    return this.enabled ? Object.keys(this.profiles) : [];
  }

  private audit(
    actor: string,
    action: 'create' | 'kill',
    session: string,
    result: 'ok' | 'refused' | 'error',
    reason?: string,
  ): void {
    // Metadata only — actor is the mechanically derived peer address (C7).
    this.logger('lifecycle_action', { actor: actor.slice(0, 64), action, session: session.slice(0, 64), result, reason });
  }

  private requireEnabled(): void {
    if (!this.enabled) throw new LifecycleRefusal('disabled', 'session lifecycle is disabled');
  }

  private requireName(name: string): void {
    if (typeof name !== 'string' || !SESSION_NAME_RE.test(name)) {
      throw new LifecycleRefusal('invalid_name', 'session name must match [A-Za-z0-9_-]{1,64}');
    }
  }

  private requireScope(name: string): void {
    if (this.allowedSessions.length > 0 && !this.allowedSessions.includes(name)) {
      throw new LifecycleRefusal('out_of_scope', 'session is outside the configured tmux scope');
    }
  }

  private async resolveCwd(cwd: string): Promise<string> {
    if (typeof cwd !== 'string' || cwd.trim() === '') {
      throw new LifecycleRefusal('cwd_outside_roots', 'cwd is required');
    }
    let real: string;
    try {
      real = await realpath(resolve(cwd));
    } catch {
      throw new LifecycleRefusal('cwd_outside_roots', 'cwd does not resolve');
    }
    for (const root of this.roots) {
      let realRoot: string;
      try {
        realRoot = await realpath(root);
      } catch {
        continue;
      }
      if (real === realRoot || real.startsWith(realRoot + sep)) return real;
    }
    throw new LifecycleRefusal('cwd_outside_roots', 'cwd is outside the allowed roots');
  }

  async createSession(input: CreateInput): Promise<LifecycleResult> {
    try {
      this.requireEnabled();
      this.requireName(input.name);
      this.requireScope(input.name);
      const profile = this.profiles[input.profile];
      if (!profile) {
        throw new LifecycleRefusal('profile_not_allowlisted', `profile ${JSON.stringify(input.profile)} is not configured`);
      }
      const cwd = await this.resolveCwd(input.cwd);
      // Mechanical argv template: only {name} and {cwd} placeholders substitute.
      const argv = profile.argv.map((arg) => arg.replaceAll('{name}', input.name).replaceAll('{cwd}', cwd));
      await this.runner([...this.socketArgs, 'new-session', '-d', '-s', input.name, '-c', cwd, ...argv]);
      this.audit(input.actor, 'create', input.name, 'ok');
      return { ok: true, session: input.name };
    } catch (error) {
      if (error instanceof LifecycleRefusal) {
        this.audit(input.actor, 'create', String(input.name), 'refused', error.reason);
      } else {
        this.audit(input.actor, 'create', String(input.name), 'error');
      }
      throw error;
    }
  }

  async killSession(input: KillInput): Promise<LifecycleResult> {
    try {
      this.requireEnabled();
      this.requireName(input.name);
      this.requireScope(input.name);
      if (this.protectedSessions.has(input.name)) {
        throw new LifecycleRefusal('protected_session', `session ${JSON.stringify(input.name)} is protected`);
      }
      await this.runner([...this.socketArgs, 'kill-session', '-t', input.name]);
      this.audit(input.actor, 'kill', input.name, 'ok');
      return { ok: true, session: input.name };
    } catch (error) {
      if (error instanceof LifecycleRefusal) {
        this.audit(input.actor, 'kill', String(input.name), 'refused', error.reason);
      } else {
        this.audit(input.actor, 'kill', String(input.name), 'error');
      }
      throw error;
    }
  }
}
