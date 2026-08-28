import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChannelError, type ChannelErrorCode } from '../../src/errors.js';
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

async function assertRejectCode(promise: Promise<unknown>, code: ChannelErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof ChannelError && error.code === code);
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

    assert.equal(channels.length, 1);
    assert.equal(channels[0].backend_kind, 'tmux');
    assert.equal(channels[0].state, 'available');
    assert.deepEqual(channels[0].capabilities, ['read']);
    assert.equal(channels[0].title, 'Visible pane');
    assert.equal(channels[0].cwd, '/work/visible');
    assert.match(channels[0].channel_id, /^tmux:[a-f0-9]{12}:1$/);
    assert.equal(runner.calls[0].executable, 'tmux');
    assert.deepEqual(runner.calls[0].args.slice(0, 3), ['-L', 'isolated', 'list-panes']);
  });

  it('rejects channel ids from another configured tmux scope', async () => {
    const first = new TmuxBackend({ socketName: 'first' }, new QueueRunner());
    const second = new TmuxBackend({ socketName: 'second' }, new QueueRunner());
    const channelId = first.channelIdForPane('%7');

    await assertRejectCode(second.getChannel(channelId), 'CHANNEL_NOT_FOUND');
  });

  it('returns CHANNEL_NOT_FOUND when a scoped pane is absent', async () => {
    const runner = new QueueRunner({ stdout: '%1\tvisible\t@1\t0\t0\tPane\t/tmp\n', stderr: '' });
    const backend = new TmuxBackend({ socketName: 'isolated' }, runner);
    const missingId = backend.channelIdForPane('%99');

    await assertRejectCode(backend.getChannel(missingId), 'CHANNEL_NOT_FOUND');
  });

  it('maps a missing tmux executable to BACKEND_UNAVAILABLE', async () => {
    const failure = new Error('spawn tmux ENOENT') as NodeJS.ErrnoException;
    failure.code = 'ENOENT';
    const backend = new TmuxBackend({}, new QueueRunner(failure));

    await assertRejectCode(backend.listChannels(), 'BACKEND_UNAVAILABLE');
  });

  it('enforces configured read bounds before invoking capture-pane', async () => {
    const backend = new TmuxBackend({ maxReadLines: 10, maxReadBytes: 100 }, new QueueRunner());
    const channelId = backend.channelIdForPane('%1');

    await assertRejectCode(backend.readChannel(channelId, { lines: 11, bytes: 50 }), 'INVALID_ARGUMENT');
  });

  it('truncates UTF-8 from the front without producing replacement characters', () => {
    const result = takeLastUtf8Bytes('alpha-世界', 7);
    assert.equal(result.truncated, true);
    assert.equal(result.text.includes('\uFFFD'), false);
    assert.ok(Buffer.byteLength(result.text, 'utf8') <= 7);
  });

  it('does not accept malformed pane identities from tmux', () => {
    const backend = new TmuxBackend({}, new QueueRunner());
    assert.throws(() => backend.channelIdForPane('session:0.0'), ChannelError);
  });
});
