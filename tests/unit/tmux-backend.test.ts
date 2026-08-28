import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChannelError, type ChannelErrorCode } from '../../src/errors.js';
import { HARD_MAX_WRITE_BYTES, validateOrdinaryText, validateTerminalControl } from '../../src/input.js';
import {
  type CommandResult,
  type CommandRunOptions,
  type CommandRunner,
  NodeCommandRunner,
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

const visiblePane = {
  stdout: '%1\tvisible\t@1\t0\t0\tVisible pane\t/work/visible\n',
  stderr: '',
};

async function assertRejectCode(promise: Promise<unknown>, code: ChannelErrorCode): Promise<ChannelError> {
  let caught: ChannelError | undefined;
  await assert.rejects(promise, (error: unknown) => {
    if (error instanceof ChannelError && error.code === code) {
      caught = error;
      return true;
    }
    return false;
  });
  assert.ok(caught);
  return caught;
}

describe('TmuxBackend', () => {
  it('forces UTF-8 tmux output, parses seven-field metadata, and discovers only allowed sessions', async () => {
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
    assert.deepEqual(channels[0].capabilities, ['read', 'write-text', 'control']);
    assert.equal(channels[0].title, 'Visible pane');
    assert.equal(channels[0].cwd, '/work/visible');
    assert.deepEqual(channels[0].backend_metadata, {
      tmux: {
        session_name: 'visible',
        window_id: '@1',
        window_index: 0,
        pane_id: '%1',
        pane_index: 0,
      },
    });
    assert.equal(typeof channels[0].backend_metadata?.tmux?.window_index, 'number');
    assert.equal(typeof channels[0].backend_metadata?.tmux?.pane_index, 'number');
    assert.match(channels[0].channel_id, /^tmux:[a-f0-9]{12}:1$/);
    assert.equal(runner.calls[0].executable, 'tmux');
    assert.deepEqual(runner.calls[0].args.slice(0, 4), ['-u', '-L', 'isolated', 'list-panes']);
    const formatIndex = runner.calls[0].args.indexOf('-F');
    assert.ok(formatIndex >= 0);
    assert.equal(runner.calls[0].args[formatIndex + 1].split('\t').length, 7);
  });

  it('rejects pane metadata that does not preserve the required field separators', async () => {
    const runner = new QueueRunner({
      stdout: '%1_visible_@1_0_0_Visible pane_/work/visible\n',
      stderr: '',
    });
    const backend = new TmuxBackend({ socketName: 'isolated' }, runner);

    await assertRejectCode(backend.listChannels(), 'BACKEND_OPERATION_FAILED');
  });

  it('fails closed on malformed required tmux identity indices', async () => {
    for (const [windowIndex, paneIndex] of [
      ['-1', '0'],
      ['0', '-1'],
      ['1.5', '0'],
      ['0', '2.5'],
      ['not-a-number', '0'],
      ['0', '9007199254740992'],
    ]) {
      const runner = new QueueRunner({
        stdout: `%1\tvisible\t@1\t${windowIndex}\t${paneIndex}\tVisible pane\t/work/visible\n`,
        stderr: '',
      });
      const backend = new TmuxBackend({ socketName: 'isolated' }, runner);
      await assertRejectCode(backend.listChannels(), 'BACKEND_OPERATION_FAILED');
    }
  });

  it('rejects channel ids from another configured tmux scope', async () => {
    const first = new TmuxBackend({ socketName: 'first' }, new QueueRunner());
    const second = new TmuxBackend({ socketName: 'second' }, new QueueRunner());
    const channelId = first.channelIdForPane('%7');

    await assertRejectCode(second.getChannel(channelId), 'CHANNEL_NOT_FOUND');
  });

  it('returns CHANNEL_NOT_FOUND when a scoped pane is absent', async () => {
    const runner = new QueueRunner(visiblePane);
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

  it('validates ordinary text as Unicode data with LF/TAB only among Cc controls and a 1 MiB UTF-8 bound', () => {
    assert.doesNotThrow(() => validateOrdinaryText("世界\nline\t'\"`$;|&&  "));
    assert.doesNotThrow(() => validateOrdinaryText('a'.repeat(HARD_MAX_WRITE_BYTES)));

    for (const text of ['\u0000', '\r', '\u0003', '\u001b', '\u007f', '\u0085']) {
      assert.throws(() => validateOrdinaryText(text), (error: unknown) => error instanceof ChannelError && error.code === 'INVALID_ARGUMENT');
    }
    assert.throws(
      () => validateOrdinaryText('a'.repeat(HARD_MAX_WRITE_BYTES + 1)),
      (error: unknown) => error instanceof ChannelError && error.code === 'INVALID_ARGUMENT',
    );
  });

  it('transports text through an operation-unique stdin-loaded paste buffer without caller key grammar', async () => {
    const runner = new QueueRunner(visiblePane, { stdout: '', stderr: '' }, { stdout: '', stderr: '' });
    const backend = new TmuxBackend({ socketName: 'isolated', allowedSessions: ['visible'] }, runner);
    const channelId = backend.channelIdForPane('%1');
    const text = "世界\nline\t'\"`$;|&&  ";

    assert.deepEqual(await backend.writeText(channelId, text, { submit: false }), {
      channel_id: channelId,
      submitted: false,
    });

    const load = runner.calls[1];
    const paste = runner.calls[2];
    assert.equal(load.args[3], 'load-buffer');
    assert.equal(load.options.stdin, text);
    assert.equal(load.args.at(-1), '-');
    const loadName = load.args[load.args.indexOf('-b') + 1];
    const pasteName = paste.args[paste.args.indexOf('-b') + 1];
    assert.match(loadName, /^agent-runtime-mcp-write-/);
    assert.equal(pasteName, loadName);
    assert.equal(paste.args[3], 'paste-buffer');
    assert.ok(paste.args.includes('-p'));
    assert.ok(paste.args.includes('-d'));
    assert.equal(paste.args[paste.args.indexOf('-t') + 1], '%1');
    assert.equal(paste.args.includes(text), false);
  });

  it('adds ENTER only after successful text transport and never after a failed paste', async () => {
    const successRunner = new QueueRunner(
      visiblePane,
      { stdout: '', stderr: '' },
      { stdout: '', stderr: '' },
      { stdout: '', stderr: '' },
    );
    const successBackend = new TmuxBackend({ socketName: 'isolated', allowedSessions: ['visible'] }, successRunner);
    const channelId = successBackend.channelIdForPane('%1');

    await successBackend.writeText(channelId, 'submit me', { submit: true });
    assert.deepEqual(successRunner.calls.map((call) => call.args[3]), ['list-panes', 'load-buffer', 'paste-buffer', 'send-keys']);
    assert.equal(successRunner.calls[3].args.at(-1), 'Enter');

    const pasteFailure = new Error('paste failed') as NodeJS.ErrnoException & { stderr?: string };
    pasteFailure.stderr = 'paste failed';
    const failureRunner = new QueueRunner(visiblePane, { stdout: '', stderr: '' }, pasteFailure, { stdout: '', stderr: '' });
    const failureBackend = new TmuxBackend({ socketName: 'isolated', allowedSessions: ['visible'] }, failureRunner);

    await assertRejectCode(failureBackend.writeText(failureBackend.channelIdForPane('%1'), 'no submit', { submit: true }), 'BACKEND_OPERATION_FAILED');
    assert.equal(failureRunner.calls.some((call) => call.args.includes('send-keys')), false);
    assert.equal(failureRunner.calls.some((call) => call.args.includes('delete-buffer')), true);
  });

  it('maps only the fixed ENTER / INTERRUPT / ESCAPE controls', async () => {
    const cases = [
      ['ENTER', 'Enter'],
      ['INTERRUPT', 'C-c'],
      ['ESCAPE', 'Escape'],
    ] as const;

    for (const [control, key] of cases) {
      const runner = new QueueRunner(visiblePane, { stdout: '', stderr: '' });
      const backend = new TmuxBackend({ socketName: 'isolated', allowedSessions: ['visible'] }, runner);
      const channelId = backend.channelIdForPane('%1');
      assert.deepEqual(await backend.sendControl(channelId, control), { channel_id: channelId, control });
      assert.equal(runner.calls[1].args[3], 'send-keys');
      assert.equal(runner.calls[1].args.at(-1), key);
    }

    assert.throws(() => validateTerminalControl('C-z'), (error: unknown) => error instanceof ChannelError && error.code === 'INVALID_ARGUMENT');
  });

  it('marks terminal-mutation timeouts as an unknown delivery outcome without retrying', async () => {
    const timeout = new Error('timed out') as NodeJS.ErrnoException & { killed?: boolean };
    timeout.killed = true;
    const runner = new QueueRunner(visiblePane, timeout);
    const backend = new TmuxBackend({ socketName: 'isolated', allowedSessions: ['visible'] }, runner);
    const channelId = backend.channelIdForPane('%1');

    const error = await assertRejectCode(backend.sendControl(channelId, 'ENTER'), 'TIMEOUT');
    assert.equal(error.details?.delivery_outcome, 'unknown');
    assert.equal(runner.calls.filter((call) => call.args.includes('send-keys')).length, 1);
  });

  it('NodeCommandRunner can deliver literal stdin without shell interpolation', async () => {
    const runner = new NodeCommandRunner();
    const text = "literal '$HOME' `echo nope` ; | && 世界\n";
    const result = await runner.run(
      process.execPath,
      ['-e', 'process.stdin.pipe(process.stdout)'],
      { timeoutMs: 3000, maxBufferBytes: 64 * 1024, stdin: text },
    );
    assert.equal(result.stdout, text);
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
