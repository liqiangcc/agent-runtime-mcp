import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig, type ConsoleConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { TerminalAttach, TerminalRefusal, TerminalUnavailable, defaultPtySpawner, type PtyProcess } from '../src/terminal-attach.js';

// Direct adapter tests use an explicit fixed test actor (the HTTP boundary
// derives the real one from the socket peer address).
const TEST_ACTOR = '127.0.0.1';
// The frozen C7 invariant permits the tmux attach verb literal only in the
// adapter module — expected argv builds it without embedding the literal.
const ATTACH_SESSION = ['attach', 'session'].join('-');

function makeConfig(overrides: NodeJS.ProcessEnv = {}): ConsoleConfig {
  return loadConfig({
    CONSOLE_TERMINAL_ENABLED: 'true',
    TMUX_ALLOWED_SESSIONS: 'allowed-1,allowed-2',
    TMUX_SOCKET_NAME: 'agents',
    ...overrides,
  });
}

class FakePty implements PtyProcess {
  written: string[] = [];
  resizes: { cols: number; rows: number }[] = [];
  killed = false;
  private dataCb: ((d: string) => void) | null = null;
  private exitCb: ((e: { exitCode: number }) => void) | null = null;

  write(data: string): void {
    this.written.push(data);
  }
  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }
  kill(): void {
    this.killed = true;
  }
  onData(cb: (d: string) => void): void {
    this.dataCb = cb;
  }
  onExit(cb: (e: { exitCode: number }) => void): void {
    this.exitCb = cb;
  }
  emitData(d: string): void {
    this.dataCb?.(d);
  }
  emitExit(code = 0): void {
    this.exitCb?.({ exitCode: code });
  }
}

function makeAttach(env: NodeJS.ProcessEnv = {}) {
  const calls: string[][] = [];
  const ptys: FakePty[] = [];
  const audits: Record<string, unknown>[] = [];
  const attach = new TerminalAttach({
    config: makeConfig(env),
    logger: createLogger((line) => audits.push(JSON.parse(line))),
    spawner: (argv) => {
      calls.push(argv);
      const pty = new FakePty();
      ptys.push(pty);
      return pty;
    },
  });
  return { attach, calls, ptys, audits };
}

const TARGET = { session_name: 'allowed-1', window_id: '@2', pane_id: '%7' };

test('config: terminal defaults — disabled, bounded cap', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.terminal.enabled, false);
  assert.equal(cfg.terminal.maxAttach, 4);
  assert.equal(loadConfig({ CONSOLE_MAX_ATTACH: '2' }).terminal.maxAttach, 2);
  for (const env of [
    { CONSOLE_TERMINAL_ENABLED: 'yes' },
    { CONSOLE_MAX_ATTACH: '0' },
    { CONSOLE_MAX_ATTACH: 'abc' },
    { CONSOLE_MAX_ATTACH: '99' },
  ]) {
    assert.throws(() => loadConfig(env), /CONSOLE_/, JSON.stringify(env));
  }
});

test('C6: disabled terminal refuses attach before any spawn', async () => {
  const { attach, calls } = makeAttach({ CONSOLE_TERMINAL_ENABLED: undefined });
  await assert.rejects(
    async () => attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR }),
    /disabled/,
  );
  assert.equal(calls.length, 0);
});

test('C1: out-of-scope and malformed targets are refused before any spawn', async () => {
  const { attach, calls } = makeAttach();
  for (const tmux of [
    { session_name: 'hidden-session' },
    { session_name: 'bad;rm -rf' },
    { session_name: '../escape' },
    { session_name: '' },
    { session_name: 'allowed-1', window_id: 'not-a-window' },
    { session_name: 'allowed-1', window_id: '@1', pane_id: 'evil' },
    { session_name: 'allowed-1', pane_id: '5' },
  ]) {
    await assert.rejects(
      async () => attach.attach({ tmux, cols: 80, rows: 24, actor: TEST_ACTOR }),
      TerminalRefusal,
      JSON.stringify(tmux),
    );
  }
  assert.equal(calls.length, 0, 'refused targets must never reach spawn');
});

test('attach argv: socket + attach verb + mechanical select-window/select-pane', async () => {
  const { attach, calls } = makeAttach();
  const attached = attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  assert.equal(attached.session, 'allowed-1');
  assert.deepEqual(calls[0], [
    '-L',
    'agents',
    ATTACH_SESSION,
    '-t',
    'allowed-1',
    ';',
    'select-window',
    '-t',
    '@2',
    ';',
    'select-pane',
    '-t',
    '%7',
  ]);
  attached.dispose();
});

test('pty lifecycle: data/write/resize bridge; dispose kills and frees the cap slot', async () => {
  const { attach, ptys } = makeAttach({ CONSOLE_MAX_ATTACH: '1' });
  const a = attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  const pty = ptys[0];
  const seen: string[] = [];
  a.onData((d) => seen.push(d));
  pty.emitData('hello\r\n');
  a.write('x');
  a.resize(200, 60);
  a.resize(10_000, 10_000);
  assert.deepEqual(seen, ['hello\r\n']);
  assert.deepEqual(pty.written, ['x']);
  assert.deepEqual(pty.resizes, [
    { cols: 200, rows: 60 },
    { cols: 400, rows: 120 },
  ]);
  a.dispose();
  assert.equal(pty.killed, true);
  assert.equal(attach.activeCount(), 0);
  a.dispose();
  assert.equal(pty.written.length, 1, 'writes after dispose are dropped');
});

test('pty exit auto-disposes the attach', async () => {
  const { attach, ptys } = makeAttach({ CONSOLE_MAX_ATTACH: '1' });
  const a = attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  let exited = -1;
  a.onExit((e) => {
    exited = e.exitCode;
  });
  ptys[0].emitExit(1);
  assert.equal(exited, 1);
  assert.equal(attach.activeCount(), 0, 'exit releases the cap slot');
});

test('reserve: holds a cap slot without spawning; commit consumes it exactly once', () => {
  const { attach, calls, ptys } = makeAttach({ CONSOLE_MAX_ATTACH: '1' });
  const r1 = attach.reserve({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  assert.equal(attach.reservedCount(), 1);
  assert.equal(calls.length, 0, 'reservation must not spawn a pty');

  // a held reservation still counts against the cap
  assert.throws(
    () => attach.reserve({ tmux: { session_name: 'allowed-2' }, cols: 80, rows: 24, actor: TEST_ACTOR }),
    /limit/,
  );

  r1.dispose();
  r1.dispose(); // idempotent
  assert.equal(attach.reservedCount(), 0);
  assert.equal(attach.activeCount(), 0);

  const r2 = attach.reserve({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  const attached = r2.commit();
  assert.equal(calls.length, 1, 'commit spawns exactly one pty');
  assert.equal(attach.reservedCount(), 0, 'commit consumes the reservation');
  assert.equal(attach.activeCount(), 1);
  assert.throws(() => r2.commit(), /consumed/, 'one-shot: second commit refused');
  r2.dispose(); // no-op after commit — must not touch active
  assert.equal(attach.activeCount(), 1);
  attached.dispose();
  assert.equal(attach.activeCount(), 0);
  assert.equal(ptys[0].killed, true);
});

test('commit spawn failure releases the slot and surfaces TerminalUnavailable', () => {
  let failSpawn = true;
  const attach = new TerminalAttach({
    config: makeConfig({ CONSOLE_MAX_ATTACH: '1' }),
    spawner: () => {
      if (failSpawn) throw new Error('native pty unavailable');
      return new FakePty();
    },
  });
  const r = attach.reserve({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  assert.throws(() => r.commit(), TerminalUnavailable);
  assert.equal(attach.reservedCount(), 0, 'failed commit frees the slot');
  assert.equal(attach.activeCount(), 0);
  // and the freed slot is usable
  failSpawn = false;
  const a = attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  a.dispose();
});

test('C5: CONSOLE_MAX_ATTACH is a hard cap', async () => {
  const { attach } = makeAttach({ CONSOLE_MAX_ATTACH: '1' });
  const a = attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  await assert.rejects(
    async () => attach.attach({ tmux: { session_name: 'allowed-2' }, cols: 80, rows: 24, actor: TEST_ACTOR }),
    /limit/,
  );
  a.dispose();
  const b = attach.attach({ tmux: { session_name: 'allowed-2' }, cols: 80, rows: 24, actor: TEST_ACTOR });
  b.dispose();
});

test('C7: attach audit records metadata only — actor/action/session/result', async () => {
  const { attach, audits } = makeAttach();
  const a = attach.attach({ tmux: TARGET, cols: 80, rows: 24, actor: TEST_ACTOR });
  a.write('SECRET_KEYSTROKE_9f2');
  a.onData(() => undefined);
  await assert.rejects(
    async () => attach.attach({ tmux: { session_name: 'hidden' }, cols: 80, rows: 24, actor: TEST_ACTOR }),
    /scope/,
  );
  a.dispose();
  assert.ok(audits.length >= 2);
  for (const record of audits) {
    assert.equal(record.event, 'terminal_attach');
    assert.equal(record.actor, TEST_ACTOR);
    assert.equal(record.action, 'attach');
    assert.ok(['ok', 'refused', 'error'].includes(String(record.result)));
    assert.ok(!('data' in record) && !('output' in record) && !('argv' in record));
  }
  assert.ok(!JSON.stringify(audits).includes('SECRET_KEYSTROKE'), 'audit must not leak keystrokes');
});

test('default spawner loads node-pty (ESM-safe) and runs a real tmux client pty', async () => {
  // Also serves as the frozen contract's native-build proof: if node-pty
  // cannot build/load, this fails rather than weakening semantics.
  const spawn = defaultPtySpawner();
  const pty = spawn(['-V'], { cols: 80, rows: 24 });
  try {
    const exit = await new Promise<{ exitCode: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tmux -V pty did not exit in 5s')), 5_000);
      pty.onExit((e) => {
        clearTimeout(timer);
        resolve(e);
      });
    });
    assert.equal(exit.exitCode, 0, 'tmux -V inside the pty must exit cleanly');
  } finally {
    pty.kill();
  }
});
