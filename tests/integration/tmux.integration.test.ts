import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { ChannelError, type ChannelErrorCode } from '../../src/errors.js';
import { TmuxBackend } from '../../src/tmux-backend.js';

const execFileAsync = promisify(execFile);
const socketName = `agent-runtime-mcp-${process.pid}-${Date.now()}`;
const readSession = 'mvp002-read';
const recorderA = 'mvp002-input-a';
const recorderB = 'mvp002-input-b';
const hiddenRecorder = 'mvp002-hidden';
const tempRoot = mkdtempSync(join(tmpdir(), 'agent-runtime-mcp-'));
const recorderFiles = new Map<string, string>();

async function tmux(...args: string[]): Promise<string> {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return result.stdout;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out waiting for integration fixture');
}

async function createRecorderSession(sessionName: string): Promise<void> {
  const outputPath = join(tempRoot, `${sessionName}.bin`);
  recorderFiles.set(sessionName, outputPath);
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'terminal-recorder.mjs');
  const command = `${shellQuote(process.execPath)} ${shellQuote(fixturePath)} ${shellQuote(outputPath)}`;
  await tmux('new-session', '-d', '-s', sessionName, command);
  await waitFor(async () => (await tmux('capture-pane', '-p', '-t', sessionName)).includes('READY'));
}

function recorderPath(sessionName: string): string {
  const path = recorderFiles.get(sessionName);
  assert.ok(path);
  return path;
}

function clearRecorder(sessionName: string): void {
  writeFileSync(recorderPath(sessionName), Buffer.alloc(0));
}

function readRecorder(sessionName: string): Buffer {
  return readFileSync(recorderPath(sessionName));
}

async function waitForRecorderBytes(sessionName: string, minimumBytes: number): Promise<Buffer> {
  await waitFor(() => readRecorder(sessionName).length >= minimumBytes);
  return readRecorder(sessionName);
}

async function paneId(sessionName: string): Promise<string> {
  return (await tmux('list-panes', '-t', sessionName, '-F', '#{pane_id}')).trim();
}

async function assertRejectCode(promise: Promise<unknown>, code: ChannelErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof ChannelError && error.code === code);
}

describe('real tmux Channel backend', () => {
  before(async () => {
    await tmux('new-session', '-d', '-s', readSession);
    await tmux('send-keys', '-t', readSession, '-l', "printf 'alpha\\nbeta\\ngamma\\n世界\\n'");
    await tmux('send-keys', '-t', readSession, 'Enter');
    await tmux('send-keys', '-t', readSession, '-l', 'seq 1 30');
    await tmux('send-keys', '-t', readSession, 'Enter');
    await createRecorderSession(recorderA);
    await createRecorderSession(recorderB);
    await createRecorderSession(hiddenRecorder);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  after(async () => {
    try {
      await tmux('kill-server');
    } catch {
      // The server may already be absent after a failing fixture; cleanup remains best effort.
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('keeps discovery/read compatible while advertising read/write-text/control', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [readSession] });
    const channels = await backend.listChannels();

    assert.equal(channels.length, 1);
    assert.deepEqual(channels[0].capabilities, ['read', 'write-text', 'control']);
    const read = await backend.readChannel(channels[0].channel_id, { lines: 12, bytes: 4096 });
    assert.ok(read.line_count <= 12);
    assert.ok(read.byte_count <= 4096);
    assert.equal(read.truncated, true);
    assert.match(read.text, /(30|世界)/);
  });

  it('reports backend healthy while the configured allowlist exposes zero Channels', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: ['mvp0025-no-visible-session'] });
    const panesBefore = await tmux('list-panes', '-a', '-F', '#{pane_id}');

    assert.deepEqual(await backend.listChannels(), []);
    assert.deepEqual(await backend.health(), { backend_kind: 'tmux', available: true });
    assert.equal(await tmux('list-panes', '-a', '-F', '#{pane_id}'), panesBefore);
  });

  it('delivers Unicode/multiline/TAB/metacharacter ordinary text literally to only the selected pane', async () => {
    clearRecorder(recorderA);
    clearRecorder(recorderB);
    const backend = new TmuxBackend({ socketName, allowedSessions: [recorderA, recorderB] });
    const channelId = backend.channelIdForPane(await paneId(recorderA));
    const text = "世界\nline two\t'\"`$;|&&\n  leading and trailing  ";

    await backend.writeText(channelId, text, { submit: false });
    const received = await waitForRecorderBytes(recorderA, Buffer.byteLength(text));

    assert.deepEqual(received, Buffer.from(text));
    assert.equal(readRecorder(recorderB).length, 0);
  });

  it('distinguishes submit=false from submit=true and reuses explicit ENTER semantics', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [recorderA] });
    const channelId = backend.channelIdForPane(await paneId(recorderA));

    clearRecorder(recorderA);
    await backend.writeText(channelId, 'plain', { submit: false });
    assert.deepEqual(await waitForRecorderBytes(recorderA, 5), Buffer.from('plain'));

    clearRecorder(recorderA);
    await backend.writeText(channelId, 'submit', { submit: true });
    const submitted = await waitForRecorderBytes(recorderA, 7);
    assert.deepEqual(submitted, Buffer.concat([Buffer.from('submit'), Buffer.from([0x0d])]));
  });

  it('maps ENTER / INTERRUPT / ESCAPE to the fixed terminal controls', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [recorderA] });
    const channelId = backend.channelIdForPane(await paneId(recorderA));
    clearRecorder(recorderA);

    await backend.sendControl(channelId, 'ENTER');
    await backend.sendControl(channelId, 'INTERRUPT');
    await backend.sendControl(channelId, 'ESCAPE');

    assert.deepEqual(await waitForRecorderBytes(recorderA, 3), Buffer.from([0x0d, 0x03, 0x1b]));
  });

  it('rejects non-LF/TAB Cc controls before pane mutation', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [recorderA] });
    const channelId = backend.channelIdForPane(await paneId(recorderA));
    clearRecorder(recorderA);

    for (const invalid of ['\u0000', '\r', '\u0003', '\u001b', '\u0085']) {
      await assertRejectCode(backend.writeText(channelId, invalid, { submit: false }), 'INVALID_ARGUMENT');
    }
    assert.equal(readRecorder(recorderA).length, 0);
  });

  it('does not let a same-socket hidden pane bypass the configured session allowlist', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [recorderA] });
    const hiddenId = backend.channelIdForPane(await paneId(hiddenRecorder));
    clearRecorder(recorderA);
    clearRecorder(hiddenRecorder);

    await assertRejectCode(backend.writeText(hiddenId, 'must-not-arrive', { submit: false }), 'CHANNEL_NOT_FOUND');
    assert.equal(readRecorder(recorderA).length, 0);
    assert.equal(readRecorder(hiddenRecorder).length, 0);
  });

  it('keeps concurrent write payloads and targets isolated and leaves no temporary write buffers', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [recorderA, recorderB] });
    const channelA = backend.channelIdForPane(await paneId(recorderA));
    const channelB = backend.channelIdForPane(await paneId(recorderB));
    const payloadA = 'A-世界-'.repeat(128);
    const payloadB = 'B-\t-$;|&&-'.repeat(128);
    clearRecorder(recorderA);
    clearRecorder(recorderB);

    await Promise.all([
      backend.writeText(channelA, payloadA, { submit: false }),
      backend.writeText(channelB, payloadB, { submit: false }),
    ]);

    assert.deepEqual(await waitForRecorderBytes(recorderA, Buffer.byteLength(payloadA)), Buffer.from(payloadA));
    assert.deepEqual(await waitForRecorderBytes(recorderB, Buffer.byteLength(payloadB)), Buffer.from(payloadB));

    const buffers = await tmux('list-buffers', '-F', '#{buffer_name}').catch(() => '');
    assert.equal(buffers.split('\n').some((name) => name.startsWith('agent-runtime-mcp-write-')), false);
  });

  it('returns CHANNEL_NOT_FOUND after an externally prepared pane is destroyed instead of recreating it', async () => {
    const doomed = 'mvp002-doomed';
    await createRecorderSession(doomed);
    const backend = new TmuxBackend({ socketName, allowedSessions: [doomed] });
    const [channel] = await backend.listChannels();
    await tmux('kill-session', '-t', doomed);

    await assertRejectCode(backend.writeText(channel.channel_id, 'no recreation', { submit: false }), 'CHANNEL_NOT_FOUND');
  });

  it('returns BACKEND_UNAVAILABLE for a configured tmux server that is not running', async () => {
    const backend = new TmuxBackend({ socketName: `${socketName}-missing` });
    await assertRejectCode(backend.listChannels(), 'BACKEND_UNAVAILABLE');
  });

  it('reports mechanical health unavailable for a configured tmux server that is not running', async () => {
    const backend = new TmuxBackend({ socketName: `${socketName}-health-missing` });
    assert.deepEqual(await backend.health(), {
      backend_kind: 'tmux',
      available: false,
      detail: 'BACKEND_UNAVAILABLE',
    });
  });
});
