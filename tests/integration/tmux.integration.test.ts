import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { ChannelError, type ChannelErrorCode } from '../../src/errors.js';
import { TmuxBackend } from '../../src/tmux-backend.js';

const execFileAsync = promisify(execFile);
const socketName = `agent-runtime-mcp-${process.pid}-${Date.now()}`;
const visibleSession = 'mvp001-visible';
const hiddenSession = 'mvp001-hidden';

async function tmux(...args: string[]): Promise<string> {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertRejectCode(promise: Promise<unknown>, code: ChannelErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof ChannelError && error.code === code);
}

describe('real tmux Channel backend', () => {
  before(async () => {
    await tmux('new-session', '-d', '-s', visibleSession);
    await tmux('new-session', '-d', '-s', hiddenSession);

    await tmux('send-keys', '-t', visibleSession, '-l', "printf 'alpha\\nbeta\\ngamma\\n世界\\n'");
    await tmux('send-keys', '-t', visibleSession, 'Enter');
    await tmux('send-keys', '-t', visibleSession, '-l', 'seq 1 30');
    await tmux('send-keys', '-t', visibleSession, 'Enter');
    await sleep(400);
  });

  after(async () => {
    try {
      await tmux('kill-server');
    } catch {
      // The missing-pane test may already leave no server in unusual tmux configurations.
    }
  });

  it('discovers only the configured session scope and exposes mechanical metadata', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [visibleSession] });
    const channels = await backend.listChannels();

    assert.equal(channels.length, 1);
    assert.equal(channels[0].backend_kind, 'tmux');
    assert.equal(channels[0].state, 'available');
    assert.deepEqual(channels[0].capabilities, ['read']);
    assert.match(channels[0].channel_id, /^tmux:[a-f0-9]{12}:\d+$/);

    const inspected = await backend.getChannel(channels[0].channel_id);
    assert.equal(inspected.channel_id, channels[0].channel_id);
    assert.ok(inspected.cwd);
  });

  it('reads recent output with finite line bounds and explicit truncation', async () => {
    const backend = new TmuxBackend({
      socketName,
      allowedSessions: [visibleSession],
      defaultReadLines: 12,
      maxReadLines: 50,
      maxReadBytes: 64 * 1024,
    });
    const [channel] = await backend.listChannels();
    const read = await backend.readChannel(channel.channel_id, { lines: 12, bytes: 4096 });

    assert.ok(read.line_count <= 12);
    assert.ok(read.byte_count <= 4096);
    assert.equal(read.truncated, true);
    assert.match(read.text, /(30|世界)/);
  });

  it('applies a byte bound without corrupting UTF-8 text', async () => {
    const backend = new TmuxBackend({
      socketName,
      allowedSessions: [visibleSession],
      maxReadLines: 50,
      maxReadBytes: 64 * 1024,
    });
    const [channel] = await backend.listChannels();
    const read = await backend.readChannel(channel.channel_id, { lines: 20, bytes: 64 });

    assert.ok(read.byte_count <= 64);
    assert.equal(read.truncated, true);
    assert.equal(read.text.includes('\uFFFD'), false);
  });

  it('returns BACKEND_UNAVAILABLE for a configured tmux server that is not running', async () => {
    const backend = new TmuxBackend({ socketName: `${socketName}-missing` });
    await assertRejectCode(backend.listChannels(), 'BACKEND_UNAVAILABLE');
  });

  it('returns CHANNEL_NOT_FOUND after the externally prepared pane is destroyed', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [visibleSession] });
    const [channel] = await backend.listChannels();
    const paneNumber = channel.channel_id.split(':').at(-1);
    assert.match(paneNumber ?? '', /^\d+$/);

    await tmux('kill-pane', '-t', `%${paneNumber}`);

    await assertRejectCode(backend.getChannel(channel.channel_id), 'CHANNEL_NOT_FOUND');
  });
});
