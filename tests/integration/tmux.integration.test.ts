import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('real tmux Channel backend', () => {
  beforeAll(async () => {
    await tmux('new-session', '-d', '-s', visibleSession);
    await tmux('new-session', '-d', '-s', hiddenSession);

    await tmux('send-keys', '-t', visibleSession, '-l', "printf 'alpha\\nbeta\\ngamma\\n世界\\n'");
    await tmux('send-keys', '-t', visibleSession, 'Enter');
    await tmux('send-keys', '-t', visibleSession, '-l', 'seq 1 30');
    await tmux('send-keys', '-t', visibleSession, 'Enter');
    await sleep(400);
  });

  afterAll(async () => {
    try {
      await tmux('kill-server');
    } catch {
      // The missing-pane test may already leave no server in unusual tmux configurations.
    }
  });

  it('discovers only the configured session scope and exposes mechanical metadata', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [visibleSession] });
    const channels = await backend.listChannels();

    expect(channels).toHaveLength(1);
    expect(channels[0].backend_kind).toBe('tmux');
    expect(channels[0].state).toBe('available');
    expect(channels[0].capabilities).toEqual(['read']);
    expect(channels[0].channel_id).toMatch(/^tmux:[a-f0-9]{12}:\d+$/);

    const inspected = await backend.getChannel(channels[0].channel_id);
    expect(inspected.channel_id).toBe(channels[0].channel_id);
    expect(inspected.cwd).toBeTruthy();
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

    expect(read.line_count).toBeLessThanOrEqual(12);
    expect(read.byte_count).toBeLessThanOrEqual(4096);
    expect(read.truncated).toBe(true);
    expect(read.text).toMatch(/(30|世界)/);
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

    expect(read.byte_count).toBeLessThanOrEqual(64);
    expect(read.truncated).toBe(true);
    expect(read.text).not.toContain('\uFFFD');
  });

  it('returns BACKEND_UNAVAILABLE for a configured tmux server that is not running', async () => {
    const backend = new TmuxBackend({ socketName: `${socketName}-missing` });
    await expect(backend.listChannels()).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });

  it('returns CHANNEL_NOT_FOUND after the externally prepared pane is destroyed', async () => {
    const backend = new TmuxBackend({ socketName, allowedSessions: [visibleSession] });
    const [channel] = await backend.listChannels();
    const paneNumber = channel.channel_id.split(':').at(-1);
    expect(paneNumber).toMatch(/^\d+$/);

    await tmux('kill-pane', '-t', `%${paneNumber}`);

    await expect(backend.getChannel(channel.channel_id)).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' });
  });
});
