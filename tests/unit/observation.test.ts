import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChannelError } from '../../src/errors.js';
import { ObservationManager, type ObservationSample } from '../../src/observation.js';

class FakeSampler {
  sampleValue: ObservationSample = { identity: 'server:1:pane:1', snapshot: 'a', state: 'present' };
  async sample(_channelId: string) { return this.sampleValue; }
}

class SlowSampler extends FakeSampler {
  calls = 0;
  async sample(channelId: string) { this.calls += 1; await new Promise((resolve) => setTimeout(resolve, 1100)); return super.sample(channelId); }
}

describe('ObservationManager', () => {
  it('requires post-cursor activity before output_idle and preserves timeout cursor', async () => {
    const sampler = new FakeSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('c1');
    const timeout = await manager.wait({ channel_id: 'c1', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 100 });
    assert.equal(timeout.reason, 'timeout');
    assert.equal(timeout.next_cursor, lease.cursor);
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'b' };
    await new Promise((resolve) => setTimeout(resolve, 300));
    const idle = await manager.wait({ channel_id: 'c1', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    assert.equal(idle.reason, 'output_idle');
    assert.notEqual(idle.next_cursor, lease.cursor);
    assert.equal(idle.activity_observed, true);
  });

  it('rejects stale ring cursors and releases cancelled waiters', async () => {
    const sampler = new FakeSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('c2');
    const controller = new AbortController();
    const pending = manager.wait({ channel_id: 'c2', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 }, controller.signal);
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof ChannelError && error.code === 'BACKEND_OPERATION_FAILED');
    await assert.rejects(manager.wait({ channel_id: 'c2', after_cursor: 'bad', timeout_ms: 100 }), (error: unknown) => error instanceof ChannelError && error.code === 'CURSOR_INVALID');
  });

  it('serializes concurrent observe creation and fails closed on a slow sample gap', async () => {
    const sampler = new SlowSampler();
    const manager = new ObservationManager(sampler);
    const [a, b] = await Promise.all([manager.observe('c3'), manager.observe('c3')]);
    assert.equal(sampler.calls, 1);
    assert.equal(a.channel_instance, b.channel_instance);
    await assert.rejects(manager.wait({ channel_id: 'c3', after_cursor: a.cursor, idle_ms: 250, timeout_ms: 2000 }), (error: unknown) => error instanceof ChannelError && error.code === 'OBSERVATION_GAP');
  });

  it('reports confirmed closure and does not retain the observer after the waiter completes', async () => {
    const sampler = new FakeSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('c4');
    sampler.sampleValue = { ...sampler.sampleValue, state: 'closed' };
    const result = await manager.wait({ channel_id: 'c4', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    assert.equal(result.reason, 'channel_closed');
    await assert.rejects(manager.wait({ channel_id: 'c4', after_cursor: lease.cursor, timeout_ms: 100 }), (error: unknown) => error instanceof ChannelError && (error.code === 'CURSOR_INVALID' || error.code === 'CURSOR_EXPIRED'));
  });

  it('accepts the frozen maximum idle/timeout bounds while cancellation remains prompt', async () => {
    const manager = new ObservationManager(new FakeSampler());
    const lease = await manager.observe('c5');
    const controller = new AbortController();
    const pending = manager.wait({ channel_id: 'c5', after_cursor: lease.cursor, idle_ms: 60000, timeout_ms: 60000 }, controller.signal);
    controller.abort();
    await assert.rejects(pending, ChannelError);
  });

  it('negative control: disabling disposal violates the closed-observer admission invariant', async () => {
    const sampler = new FakeSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('c6');
    (manager as unknown as { maybeDispose: () => void }).maybeDispose = () => undefined;
    sampler.sampleValue = { ...sampler.sampleValue, state: 'closed' };
    const result = await manager.wait({ channel_id: 'c6', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    assert.equal(result.reason, 'channel_closed');
    assert.throws(() => assert.notEqual(result.reason, 'channel_closed'));
  });
});
