import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { TmuxBackend } from '../../src/tmux-backend.js';

const execFileAsync = promisify(execFile);

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

test('isolated tmux observation retains >256 changes through timeout continuation', { timeout: 110000 }, async () => {
  const socket = `agent-runtime-mcp-continuity-${process.pid}-${Date.now()}`;
  const session = `continuity-${process.pid}-${Date.now()}`;
  const tmux = async (...args: string[]) => execFileAsync('tmux', ['-L', socket, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  const producer = 'for i in $(seq 1 400); do printf "OBS_CONTINUITY_%04d\\n" "$i"; sleep 0.2; done; sleep 30';
  await tmux('new-session', '-d', '-s', session, 'bash', '-c', producer);
  try {
    const backend = new TmuxBackend({ socketName: socket, allowedSessions: [session], timeoutMs: 5000 });
    await waitFor(async () => (await backend.listChannels()).length === 1);
    const [channel] = await backend.listChannels();
    assert.ok(channel);

    const manager = (backend as unknown as {
      observations: {
        sample: (observer: unknown) => Promise<void>;
        observers: Map<string, { seq: number; sampleCount: number; events: Array<{ seq: number; at: number }>; failure?: string }>;
      };
    }).observations;
    const sampleRuns: Array<{ started: number; finished: number }> = [];
    const originalSample = manager.sample.bind(manager);
    manager.sample = async (observer: unknown) => {
      const started = performance.now();
      try {
        return await originalSample(observer);
      } finally {
        sampleRuns.push({ started, finished: performance.now() });
      }
    };

    const observed = await backend.observeChannel(channel.channel_id);
    const cursor = observed.observation.cursor;
    const first = await backend.waitChannelEvent({ channel_id: channel.channel_id, after_cursor: cursor, idle_ms: 250, timeout_ms: 30000 });
    assert.equal(first.reason, 'timeout');
    assert.equal(first.next_cursor, cursor);
    assert.equal(first.activity_observed, true);

    const second = await backend.waitChannelEvent({ channel_id: channel.channel_id, after_cursor: cursor, idle_ms: 250, timeout_ms: 30000 });
    assert.equal(second.reason, 'timeout');
    assert.equal(second.next_cursor, cursor);
    assert.equal(second.activity_observed, true);

    const idle = await backend.waitChannelEvent({ channel_id: channel.channel_id, after_cursor: cursor, idle_ms: 250, timeout_ms: 30000 });
    assert.equal(idle.reason, 'output_idle');
    assert.equal(idle.activity_observed, true);
    assert.notEqual(idle.next_cursor, cursor);

    const observer = manager.observers.get(channel.channel_id);
    assert.ok(observer);
    assert.equal(observer.failure, undefined);
    assert.ok(observer.seq > 256, `expected >256 committed changes, got ${observer.seq}`);
    assert.ok(observer.events.length > 256, `expected >256 retained events, got ${observer.events.length}`);
    assert.ok(observer.sampleCount > 256, `expected >256 completed samples, got ${observer.sampleCount}`);
    assert.ok(sampleRuns.length > 256, `expected >256 instrumented samples, got ${sampleRuns.length}`);
    assert.ok(sampleRuns.every(({ started, finished }) => finished >= started && finished - started < 1000));

    const startDeltas = sampleRuns.slice(1).map((run, index) => run.started - sampleRuns[index].started);
    const completionDurations = sampleRuns.map((run) => run.finished - run.started);
    console.log('TMUX_OBSERVATION_CONTINUITY_EVIDENCE', JSON.stringify({
      socket_isolated: true,
      activity_changes: observer.seq,
      retained_events: observer.events.length,
      completed_samples: observer.sampleCount,
      instrumented_sample_runs: sampleRuns.length,
      start_delta_ms: {
        min: Math.min(...startDeltas),
        max: Math.max(...startDeltas),
        mean: startDeltas.reduce((sum, value) => sum + value, 0) / startDeltas.length,
      },
      completion_duration_ms: { max: Math.max(...completionDurations) },
      timeout_cursor_preserved: first.next_cursor === cursor && second.next_cursor === cursor,
      stopped_activity_result: idle.reason,
    }));
  } finally {
    await tmux('kill-server').catch(() => undefined);
  }
});
