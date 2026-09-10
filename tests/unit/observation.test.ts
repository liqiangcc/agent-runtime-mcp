import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChannelError } from '../../src/errors.js';
import { ObservationManager, type ObservationSample } from '../../src/observation.js';

class FakeSampler {
  sampleValue: ObservationSample = { identity: 'server:1:pane:1', snapshot: 'a', state: 'present' };
  async sample(_channelId: string) { return this.sampleValue; }
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
});
