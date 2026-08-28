import { describe, expect, it } from 'vitest';
import { ChannelError } from '../../src/errors.js';
import {
  type CommandResult,
  type CommandRunOptions,
  type CommandRunner,
  TmuxBackend,
  takeLastUtf8Bytes,
} from '../../src/tmux-backend.js';

class QueueRunner implements CommandRunner {
  readonly calls: Array<{ executable: string; args: string[]; options: CommandRunOptions }> = [];
  private readonly queue: Array<CommandResult | Error>;

  constructor(...queue: Array<CommandResult | Error>) {
    this.queue = [...queue];
  }

  async run(executable: string, args: string[], options: CommandRunOptions): Promise<CommandResult> {
    this.calls.push({ executable, args, options });
    const next = this.queue.shift();
    if (!next) return { stdout: '', stderr: '' };
    if (next instanceof Error) throw next;
    return next;
  }
}

describe('TmuxBackend', () => {
  it('discovers only allowed sessions and derives opaque scoped channel ids', async () => {
    const runner = new QueueRunner({
      stdout: [
        '%1\tvisible\t@1\t0\t0\tVisible pane\t/work/visible',
        '%2\thidden\t@2\t0\t0\tHidden pane\t/work/hidden',
      ].join('\n'),
      stderr: '',
    });
    const backend = new TmuxBackend({ socketName: 'isolated', allowedSessions: ['visible'] }, runner);

    const channels = await backend.listChannels();

    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      backend_kind: 'tmux',
      state: 'available',
      capabilities: ['read'],
      title: 'Visible pane',
      cwd: '/work/visible',
    });
    expect(channels[0].channel_id).toMatch(/^tmux:[a-f0-9]{12}:1$/);
    expect(runner.calls[0].executable).toBe('tmux');
    expect(runner.calls[0].args.slice(0, 3)).toEqual(['-L', 'isolated', 'list-panes']);
  });

  it('rejects channel ids from another configured tmux scope', async () => {
    const first = new TmuxBackend({ socketName: 'first' }, new QueueRunner());
    const second = new TmuxBackend({ socketName: 'second' }, new QueueRunner());
    const channelId = first.channelIdForPane('%7');

    await expect(second.getChannel(channelId)).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' });
  });

  it('returns CHANNEL_NOT_FOUND when a scoped pane is absent', async () => {
    const runner = new QueueRunner({ stdout: '%1\tvisible\t@1\t0\t0\tPane\t/tmp\n', stderr: '' });
    const backend = new TmuxBackend({ socketName: 'isolated' }, runner);
    const missingId = backend.channelIdForPane('%99');

    await expect(backend.getChannel(missingId)).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' });
  });

  it('maps a missing tmux executable to BACKEND_UNAVAILABLE', async () => {
    const failure = new Error('spawn tmux ENOENT') as NodeJS.ErrnoException;
    failure.code = 'ENOENT';
    const backend = new TmuxBackend({}, new QueueRunner(failure));

    await expect(backend.listChannels()).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });

  it('enforces configured read bounds before invoking capture-pane', async () => {
    const backend = new TmuxBackend({ maxReadLines: 10, maxReadBytes: 100 }, new QueueRunner());
    const channelId = backend.channelIdForPane('%1');

    await expect(backend.readChannel(channelId, { lines: 11, bytes: 50 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('truncates UTF-8 from the front without producing replacement characters', () => {
    const result = takeLastUtf8Bytes('alpha-世界', 7);
    expect(result.truncated).toBe(true);
    expect(result.text).not.toContain('\uFFFD');
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(7);
  });

  it('does not accept malformed pane identities from tmux', () => {
    const backend = new TmuxBackend({}, new QueueRunner());
    expect(() => backend.channelIdForPane('session:0.0')).toThrow(ChannelError);
  });
});
