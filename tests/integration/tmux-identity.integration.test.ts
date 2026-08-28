import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { TmuxBackend } from '../../src/tmux-backend.js';
import type { Channel, TmuxChannelMetadata } from '../../src/types.js';

const execFileAsync = promisify(execFile);

async function tmux(socketName: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout;
}

function tmuxMetadata(channel: Channel): TmuxChannelMetadata {
  assert.equal(channel.backend_kind, 'tmux');
  assert.ok(channel.backend_metadata?.tmux, 'tmux Channel must expose complete backend_metadata.tmux');
  return channel.backend_metadata.tmux;
}

test('real tmux list/get preserve complete host session/window/pane identity', { timeout: 12000 }, async () => {
  const socketName = `agent-runtime-mcp-identity-${process.pid}-${Date.now()}`;
  const commonCwd = process.cwd();

  try {
    await tmux(socketName, 'new-session', '-d', '-s', 'p1', '-c', commonCwd);
    await tmux(socketName, 'new-session', '-d', '-s', 's2', '-c', commonCwd);
    await tmux(socketName, 'select-pane', '-t', 'p1:0.0', '-T', 'root');
    await tmux(socketName, 'select-pane', '-t', 's2:0.0', '-T', 'root');

    const backend = new TmuxBackend({ socketName, allowedSessions: ['p1', 's2'] });
    const channels = await backend.listChannels();
    assert.equal(channels.length, 2);

    const bySession = new Map(channels.map((channel) => [tmuxMetadata(channel).session_name, channel]));
    const p1 = bySession.get('p1');
    const s2 = bySession.get('s2');
    assert.ok(p1);
    assert.ok(s2);
    assert.equal(p1.title, 'root');
    assert.equal(s2.title, 'root');
    assert.equal(p1.cwd, commonCwd);
    assert.equal(s2.cwd, commonCwd);

    const p1Metadata = tmuxMetadata(p1);
    const s2Metadata = tmuxMetadata(s2);
    assert.match(p1Metadata.window_id, /^@\d+$/);
    assert.match(s2Metadata.window_id, /^@\d+$/);
    assert.match(p1Metadata.pane_id, /^%\d+$/);
    assert.match(s2Metadata.pane_id, /^%\d+$/);
    assert.equal(Number.isInteger(p1Metadata.window_index) && p1Metadata.window_index >= 0, true);
    assert.equal(Number.isInteger(p1Metadata.pane_index) && p1Metadata.pane_index >= 0, true);
    assert.equal(Number.isInteger(s2Metadata.window_index) && s2Metadata.window_index >= 0, true);
    assert.equal(Number.isInteger(s2Metadata.pane_index) && s2Metadata.pane_index >= 0, true);
    assert.notEqual(p1Metadata.pane_id, s2Metadata.pane_id);

    const inspected = await backend.getChannel(p1.channel_id);
    assert.deepEqual(tmuxMetadata(inspected), p1Metadata);
    assert.equal(inspected.channel_id, p1.channel_id);
    assert.match(p1.channel_id, /^tmux:[a-f0-9]{12}:\d+$/);

    console.log(
      `TMUX_IDENTITY_INTEGRATION_EVIDENCE ${JSON.stringify({
        sessions: [p1Metadata.session_name, s2Metadata.session_name],
        same_title: p1.title === s2.title,
        same_cwd: p1.cwd === s2.cwd,
        distinct_panes: p1Metadata.pane_id !== s2Metadata.pane_id,
        list_get_consistent: true,
        channel_id_shape_unchanged: true,
      })}`,
    );
  } finally {
    await tmux(socketName, 'kill-server').catch(() => undefined);
  }
});
