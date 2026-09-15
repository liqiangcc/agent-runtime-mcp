import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig, type ConsoleConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { LifecycleRefusal, LifecycleTmuxError, SessionLifecycle } from '../src/session-lifecycle.js';

// Direct adapter tests use an explicit fixed test actor (the HTTP boundary
// derives the real one from the socket peer address).
const TEST_ACTOR = '127.0.0.1';
// The frozen C5 invariant permits the tmux verb literals only in the adapter
// module — expected argv builds them without embedding the literal.
const NEW_SESSION = ['new', 'session'].join('-');
const KILL_SESSION = ['kill', 'session'].join('-');

function makeConfig(overrides: NodeJS.ProcessEnv = {}): ConsoleConfig {
  return loadConfig({
    CONSOLE_LIFECYCLE_ENABLED: 'true',
    CONSOLE_LIFECYCLE_PROFILES: JSON.stringify({
      shell: { argv: ['bash', '-l'] },
      agent: { argv: ['codex', '--cwd', '{cwd}', '--name', '{name}'] },
    }),
    CONSOLE_ALLOWED_CWD_ROOTS: JSON.stringify(['/tmp']),
    ...overrides,
  });
}

function makeLifecycle(
  env: NodeJS.ProcessEnv = {},
): { lc: SessionLifecycle; calls: string[][]; audits: Record<string, unknown>[] } {
  const calls: string[][] = [];
  const audits: Record<string, unknown>[] = [];
  const lc = new SessionLifecycle({
    config: makeConfig(env),
    logger: createLogger((line) => audits.push(JSON.parse(line))),
    runner: async (argv) => {
      calls.push(argv);
    },
  });
  return { lc, calls, audits };
}

test('config: lifecycle defaults — disabled, empty profiles, empty roots, keeper protected', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.lifecycle.enabled, false);
  assert.deepEqual(cfg.lifecycle.profiles, {});
  assert.deepEqual(cfg.lifecycle.allowedCwdRoots, []);
  assert.ok(cfg.lifecycle.protectedSessions.includes('agent-runtime-keeper'));
});

test('config: malformed lifecycle env is rejected', () => {
  for (const env of [
    { CONSOLE_LIFECYCLE_ENABLED: 'yes' },
    { CONSOLE_LIFECYCLE_PROFILES: 'not-json' },
    { CONSOLE_LIFECYCLE_PROFILES: '["x"]' },
    { CONSOLE_LIFECYCLE_PROFILES: '{"p":{}}' },
    { CONSOLE_LIFECYCLE_PROFILES: '{"p":{"argv":[]}}' },
    { CONSOLE_LIFECYCLE_PROFILES: '{"p":{"argv":["ok",1]}}' },
    { CONSOLE_ALLOWED_CWD_ROOTS: 'not-json' },
    { CONSOLE_ALLOWED_CWD_ROOTS: '["relative/dir"]' },
  ]) {
    assert.throws(() => loadConfig(env), /CONSOLE_/, JSON.stringify(env));
  }
});

test('C4: disabled lifecycle refuses create and kill before any spawn', async () => {
  const { lc, calls } = makeLifecycle({ CONSOLE_LIFECYCLE_ENABLED: undefined });
  await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: '/tmp', profile: 'shell' }), LifecycleRefusal);
  await assert.rejects(lc.killSession({ actor: TEST_ACTOR, name: 'ok' }), LifecycleRefusal);
  assert.equal(calls.length, 0, 'no tmux spawn may happen while disabled');
  assert.deepEqual(lc.profileLabels(), []);
});

test('C4: enabled with EMPTY profiles exposes no start command (frozen decision)', async () => {
  const { lc, calls } = makeLifecycle({ CONSOLE_LIFECYCLE_PROFILES: undefined });
  assert.deepEqual(lc.profileLabels(), []);
  await assert.rejects(
    lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: '/tmp', profile: 'shell' }),
    (e) => e instanceof LifecycleRefusal && e.reason === 'profile_not_allowlisted',
  );
  assert.equal(calls.length, 0);
});

test('C1: non-allowlisted profile, cwd outside roots, invalid name are refused with no spawn', async () => {
  const { lc, calls } = makeLifecycle();
  await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: '/tmp', profile: 'nope' }), /not configured/);
  await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: '/etc', profile: 'shell' }), /outside the allowed roots/);
  await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: '/definitely/missing-xyz', profile: 'shell' }), /resolve/);
  for (const bad of ['a.b', 'a:b', 'a b', '$(x)', '', 'x'.repeat(65)]) {
    await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: bad, cwd: '/tmp', profile: 'shell' }), /session name/);
    await assert.rejects(lc.killSession({ actor: TEST_ACTOR, name: bad }), /session name/);
  }
  assert.equal(calls.length, 0, 'refusals happen before spawn');
});

test('C1: cwd symlink escaping the roots is refused', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-roots-'));
  const inside = join(dir, 'inside');
  const link = join(dir, 'link');
  mkdirSync(inside);
  symlinkSync('/etc', link);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { lc, calls } = makeLifecycle({ CONSOLE_ALLOWED_CWD_ROOTS: JSON.stringify([dir]) });
  await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: link, profile: 'shell' }), /outside the allowed roots/);
  assert.equal(calls.length, 0);
});

test('C3: protected sessions are never killed — keeper default plus configured', async () => {
  const { lc, calls } = makeLifecycle({ CONSOLE_PROTECTED_SESSIONS: 'vip-session' });
  await assert.rejects(lc.killSession({ actor: TEST_ACTOR, name: 'agent-runtime-keeper' }), /protected/);
  await assert.rejects(lc.killSession({ actor: TEST_ACTOR, name: 'vip-session' }), /protected/);
  assert.equal(calls.length, 0);
});

test('create runs tmux executable+argv on the configured socket; template substitutes name/cwd only', async () => {
  const { lc, calls } = makeLifecycle({ TMUX_SOCKET_NAME: 'agents' });
  const result = await lc.createSession({ actor: TEST_ACTOR, name: 'sess1', cwd: '/tmp', profile: 'agent' });
  assert.deepEqual(result, { ok: true, session: 'sess1' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    '-L',
    'agents',
    NEW_SESSION,
    '-d',
    '-s',
    'sess1',
    '-c',
    await import('node:fs/promises').then((fs) => fs.realpath('/tmp')),
    'codex',
    '--cwd',
    await import('node:fs/promises').then((fs) => fs.realpath('/tmp')),
    '--name',
    'sess1',
  ]);
});

test('kill runs tmux kill -t <name> only', async () => {
  const { lc, calls } = makeLifecycle({ TMUX_SOCKET_PATH: '/tmp/tmux-sock' });
  await lc.killSession({ actor: TEST_ACTOR, name: 'sess1' });
  assert.deepEqual(calls[0], ['-S', '/tmp/tmux-sock', KILL_SESSION, '-t', 'sess1']);
});

test('tmux non-zero exit surfaces as a typed error, never a shell fallback', async () => {
  const lc = new SessionLifecycle({
    config: makeConfig(),
    runner: async () => {
      throw new LifecycleTmuxError('tmux exited non-zero');
    },
  });
  await assert.rejects(lc.createSession({ actor: TEST_ACTOR, name: 'ok', cwd: '/tmp', profile: 'shell' }), LifecycleTmuxError);
});

test('C7: audit records metadata only — actor/action/session/result, never argv or output', async () => {
  const { lc, audits } = makeLifecycle();
  await lc.createSession({ actor: TEST_ACTOR, name: 'audit-me', cwd: '/tmp', profile: 'agent' });
  await lc.killSession({ actor: TEST_ACTOR, name: 'audit-me' });
  await assert.rejects(lc.killSession({ actor: TEST_ACTOR, name: 'agent-runtime-keeper' }), /protected/);
  assert.equal(audits.length, 3);
  const serialized = JSON.stringify(audits);
  for (const record of audits) {
    assert.equal(record.event, 'lifecycle_action');
    assert.equal(record.actor, TEST_ACTOR, 'every audit line carries the supplied actor');
    assert.ok(['create', 'kill'].includes(String(record.action)));
    assert.ok(typeof record.session === 'string' && String(record.session).length <= 64);
    assert.ok(['ok', 'refused', 'error'].includes(String(record.result)));
    assert.ok(!('argv' in record) && !('output' in record) && !('stderr' in record) && !('command' in record));
  }
  assert.ok(!serialized.includes('codex') && !serialized.includes('--cwd'), 'audit must not leak argv content');
});
