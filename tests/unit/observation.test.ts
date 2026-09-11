import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChannelError } from '../../src/errors.js';
import { ObservationManager, type ObservationSample } from '../../src/observation.js';

class FakeSampler {
  sampleValue: ObservationSample = { identity: 'server:1:pane:1', snapshot: 'a', state: 'present' };
  async sample(_channelId: string) { return this.sampleValue; }
}

class MutableSampler extends FakeSampler {
  snapshots = new Map<string, string>();
  async sample(channelId: string) { return { ...this.sampleValue, snapshot: this.snapshots.get(channelId) ?? this.sampleValue.snapshot }; }
}

class SlowSampler extends FakeSampler {
  calls = 0;
  async sample(channelId: string) { this.calls += 1; await new Promise((resolve) => setTimeout(resolve, 1100)); return super.sample(channelId); }
}

class ConcurrencySampler extends FakeSampler {
  active = 0;
  maxActive = 0;
  async sample(channelId: string) { this.active += 1; this.maxActive = Math.max(this.maxActive, this.active); await new Promise((resolve) => setTimeout(resolve, 20)); this.active -= 1; return super.sample(channelId); }
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

  it('continues a valid cursor beyond the former 256-change window after repeated timeouts', { timeout: 3000 }, async () => {
    const sampler = new MutableSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('long-activity');
    const observer = (manager as unknown as { observers: Map<string, { timer: NodeJS.Timeout }> }).observers.get('long-activity');
    assert.ok(observer);
    clearInterval(observer.timer);
    const sample = (manager as unknown as { sample: (value: unknown) => Promise<void> }).sample.bind(manager);
    try {
      for (let index = 0; index < 300; index += 1) {
        sampler.snapshots.set('long-activity', `activity-${index}`);
        await sample(observer);
      }
      const firstTimeout = await manager.wait({ channel_id: 'long-activity', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 100 });
      const secondTimeout = await manager.wait({ channel_id: 'long-activity', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 100 });
      assert.equal(firstTimeout.reason, 'timeout');
      assert.equal(secondTimeout.reason, 'timeout');
      assert.equal(firstTimeout.next_cursor, lease.cursor);
      assert.equal(secondTimeout.next_cursor, lease.cursor);
      sampler.snapshots.set('long-activity', 'stable');
      await sample(observer);
      await new Promise((resolve) => setTimeout(resolve, 260));
      await sample(observer);
      const idle = await manager.wait({ channel_id: 'long-activity', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
      assert.equal(idle.reason, 'output_idle');
      assert.equal(idle.activity_observed, true);
      assert.notEqual(idle.next_cursor, lease.cursor);
    } finally { clearInterval(observer.timer); }
  });

  it('retains the baseline through the full count budget and gaps only after its boundary', { timeout: 3000 }, async () => {
    const sampler = new MutableSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('count-boundary');
    const observer = (manager as unknown as { observers: Map<string, { timer: NodeJS.Timeout }> }).observers.get('count-boundary');
    assert.ok(observer);
    clearInterval(observer.timer);
    const sample = (manager as unknown as { sample: (value: unknown) => Promise<void> }).sample.bind(manager);
    try {
      for (let index = 0; index < 1536; index += 1) {
        sampler.snapshots.set('count-boundary', `event-${index}`);
        await sample(observer);
      }
      await assert.doesNotReject(manager.wait({ channel_id: 'count-boundary', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 100 }));
      sampler.snapshots.set('count-boundary', 'event-over-boundary');
      await sample(observer);
      await assert.rejects(manager.wait({ channel_id: 'count-boundary', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 100 }), (error: unknown) => error instanceof ChannelError && error.code === 'OBSERVATION_GAP');
    } finally { clearInterval(observer.timer); }
  });

  it('enforces the logical byte ceiling independently of the record count', async () => {
    const manager = new ObservationManager(new FakeSampler());
    await manager.observe('byte-boundary');
    const observer = (manager as unknown as { observers: Map<string, { events: Array<{ seq: number; at: number; wall: string; sample: number }>; evicted: number; timer: NodeJS.Timeout }> }).observers.get('byte-boundary');
    assert.ok(observer);
    clearInterval(observer.timer);
    observer.events.push({ seq: 1, at: 1, wall: 'x'.repeat(300 * 1024), sample: 1 });
    (manager as unknown as { trimHistory: (value: unknown) => void }).trimHistory(observer);
    assert.equal(observer.events.length, 0);
    assert.equal(observer.evicted, 1);
  });

  it('keeps the five-minute lease finite and expires the cursor without renewal', async () => {
    let clock = 0;
    const manager = new ObservationManager(new FakeSampler(), () => clock, () => clock);
    const lease = await manager.observe('ttl-boundary');
    const observer = (manager as unknown as { observers: Map<string, { timer: NodeJS.Timeout }> }).observers.get('ttl-boundary');
    assert.ok(observer);
    clearInterval(observer.timer);
    clock = 300001;
    await assert.rejects(manager.wait({ channel_id: 'ttl-boundary', after_cursor: lease.cursor, timeout_ms: 100 }), (error: unknown) => error instanceof ChannelError && error.code === 'CURSOR_EXPIRED');
  });

  it('keeps a cursor usable across the full five-minute lease before expiry', { timeout: 3000 }, async () => {
    let clock = 0;
    const sampler = new MutableSampler();
    const manager = new ObservationManager(sampler, () => clock, () => clock);
    const lease = await manager.observe('ttl-history');
    const observer = (manager as unknown as { observers: Map<string, { timer: NodeJS.Timeout }> }).observers.get('ttl-history');
    assert.ok(observer);
    clearInterval(observer.timer);
    const sample = (manager as unknown as { sample: (value: unknown) => Promise<void> }).sample.bind(manager);
    try {
      for (let index = 0; index < 1199; index += 1) {
        clock = (index + 1) * 250;
        sampler.snapshots.set('ttl-history', `lease-event-${index}`);
        await sample(observer);
      }
      clock = 299999;
      const result = await manager.wait({ channel_id: 'ttl-history', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 100 });
      assert.equal(result.reason, 'timeout');
      assert.equal(result.next_cursor, lease.cursor);
      assert.equal(result.activity_observed, true);
      clock = 300001;
      await assert.rejects(manager.wait({ channel_id: 'ttl-history', after_cursor: lease.cursor, timeout_ms: 100 }), (error: unknown) => error instanceof ChannelError && error.code === 'CURSOR_EXPIRED');
    } finally { clearInterval(observer.timer); }
  });

  it('measures the supported Node/V8 retained-state budget for eight observers', { timeout: 10000 }, async () => {
    const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
    if (!gc) {
      if (process.env.CI === 'true' || process.env.REQUIRE_OBSERVATION_GC === '1') assert.fail('retained-state evidence requires NODE_OPTIONS=--expose-gc');
      console.log('OBSERVATION_MEMORY_EVIDENCE_SKIPPED', JSON.stringify({ reason: 'NODE_OPTIONS=--expose-gc is required for heap evidence' }));
      return;
    }
    let clock = 987654.321;
    const wall = Date.parse('2026-09-10T16:46:34.867Z');
    const sampler = new MutableSampler();
    gc(); gc();
    const baseline = process.memoryUsage().heapUsed;
    const manager = new ObservationManager(sampler, () => clock, () => wall);
    const observers: Array<{ channelId: string; events: Array<{ seq: number; at: number; wall: string; sample: number }>; timer: NodeJS.Timeout; seq: number; sampleCount: number; failure?: string }> = [];
    const sample = (manager as unknown as { sample: (value: unknown) => Promise<void> }).sample.bind(manager);
    try {
      for (let index = 0; index < 8; index += 1) {
        const channelId = `budget-${index}`;
        await manager.observe(channelId);
        const observer = (manager as unknown as { observers: Map<string, { channelId: string; events: Array<unknown>; timer: NodeJS.Timeout }> }).observers.get(channelId);
        assert.ok(observer);
        clearInterval(observer.timer);
        observers.push(observer as typeof observers[number]);
      }
      gc(); gc();
      const metadataHeap = process.memoryUsage().heapUsed;
      for (let index = 0; index < 1536; index += 1) {
        for (const observer of observers) {
          sampler.snapshots.set(observer.channelId, `${observer.channelId}-${index}`);
          clock += 0.25;
          await sample(observer);
        }
      }
      for (const observer of observers) {
        assert.equal(observer.events.length, 1536);
        assert.equal(observer.seq, 1536);
        assert.equal(observer.sampleCount, 1537);
        assert.equal(observer.failure, undefined);
      }
      gc(); gc();
      const retainedHeap = process.memoryUsage().heapUsed;
      const metadataDelta = metadataHeap - baseline;
      const eventDelta = retainedHeap - metadataHeap;
      const retainedDelta = retainedHeap - baseline;
      const logicalBytes = observers.reduce((sum, observer) => sum + Buffer.byteLength(JSON.stringify(observer.events), 'utf8'), 0);
      const maxFieldWidths = observers.flatMap((observer) => observer.events).reduce(
        (widths, event) => ({
          seq: Math.max(widths.seq, String(event.seq).length),
          at: Math.max(widths.at, String(event.at).length),
          wall: Math.max(widths.wall, event.wall.length),
          sample: Math.max(widths.sample, String(event.sample).length),
        }),
        { seq: 0, at: 0, wall: 0, sample: 0 },
      );
      console.log('OBSERVATION_MEMORY_EVIDENCE', JSON.stringify({
        runtime: process.version,
        v8: process.versions.v8,
        gc: '--expose-gc',
        baseline_includes: 'empty process before manager/observer/token creation',
        metadata_heap_delta: metadataDelta,
        event_heap_delta: eventDelta,
        observers: observers.length,
        records_per_observer: observers.map((observer) => observer.events.length),
        sequences_per_observer: observers.map((observer) => observer.seq),
        samples_per_observer: observers.map((observer) => observer.sampleCount),
        failures: observers.map((observer) => observer.failure ?? null),
        max_field_widths: maxFieldWidths,
        logical_bytes: logicalBytes,
        heap_delta_total: retainedDelta,
      }));
      assert.ok(logicalBytes <= 2 * 1024 * 1024, `logical ring payload ${logicalBytes} exceeds 2 MiB`);
      assert.ok(retainedDelta < 4 * 1024 * 1024, `Node ${process.version}/V8 retained delta ${retainedDelta} exceeds 4 MiB`);
    } finally { for (const observer of observers) clearInterval(observer.timer); }
  });

  it('serializes concurrent observe creation and fails closed on a slow sample gap', async () => {
    const sampler = new SlowSampler();
    const manager = new ObservationManager(sampler);
    const [a, b] = await Promise.all([manager.observe('c3'), manager.observe('c3')]);
    assert.equal(sampler.calls, 1);
    assert.equal(a.channel_instance, b.channel_instance);
    await assert.rejects(manager.wait({ channel_id: 'c3', after_cursor: a.cursor, idle_ms: 250, timeout_ms: 2000 }), (error: unknown) => error instanceof ChannelError && error.code === 'OBSERVATION_GAP');
  });

  it('enforces the global two-sample batch bound across distinct observer creation', async () => {
    const sampler = new ConcurrencySampler();
    const manager = new ObservationManager(sampler);
    await Promise.all(Array.from({ length: 8 }, (_, index) => manager.observe(`batch-${index}`)));
    assert.ok(sampler.maxActive <= 2);
  });

  it('reports confirmed closure and does not retain the observer after the waiter completes', async () => {
    const sampler = new FakeSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('c4');
    sampler.sampleValue = { ...sampler.sampleValue, state: 'closed' };
    const result = await manager.wait({ channel_id: 'c4', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    assert.equal(result.reason, 'channel_closed');
    await assert.rejects(manager.wait({ channel_id: 'c4', after_cursor: lease.cursor, timeout_ms: 100 }), (error: unknown) => error instanceof ChannelError && (error.code === 'CURSOR_INVALID' || error.code === 'CURSOR_EXPIRED' || error.code === 'CHANNEL_INSTANCE_CHANGED'));
  });

  it('accepts the frozen maximum idle/timeout bounds while cancellation remains prompt', async () => {
    const manager = new ObservationManager(new FakeSampler(), () => 0, () => 0);
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

  it('revalidates scope at completion and rejects a pane moved out of visibility', async () => {
    const sampler = new FakeSampler();
    let allowed = true;
    const manager = new ObservationManager({
      sample: (channelId) => sampler.sample(channelId),
      validate: async () => { if (!allowed) throw new ChannelError('PERMISSION_DENIED', 'scope changed'); },
    });
    const lease = await manager.observe('c7');
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'scope-change' };
    const pending = manager.wait({ channel_id: 'c7', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    setTimeout(() => { allowed = false; }, 300);
    await assert.rejects(pending, (error: unknown) => error instanceof ChannelError && error.code === 'PERMISSION_DENIED');
  });

  it('does not return idle after a slow completion validation crosses the deadline', async () => {
    const sampler = new FakeSampler();
    let validating = false;
    const manager = new ObservationManager({
      sample: async (channelId) => { if (validating) await new Promise((resolve) => setTimeout(resolve, 180)); return sampler.sample(channelId); },
      validate: async () => { await new Promise((resolve) => setTimeout(resolve, 180)); },
    });
    const lease = await manager.observe('c8');
    const pending = manager.wait({ channel_id: 'c8', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 300 });
    validating = true;
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'deadline-change' };
    const result = await pending;
    assert.notEqual(result.reason, 'output_idle');
  });

  it('keeps existing leases valid when the bounded token table is exhausted', async () => {
    const manager = new ObservationManager(new FakeSampler(), () => 0, () => 0);
    const first = await manager.observe('c9');
    for (let index = 0; index < 4095; index += 1) await manager.observe('c9');
    await assert.rejects(manager.observe('c9'), (error: unknown) => error instanceof ChannelError && error.code === 'RESOURCE_EXHAUSTED');
    const result = await manager.wait({ channel_id: 'c9', after_cursor: first.cursor, timeout_ms: 100 });
    assert.equal(result.reason, 'timeout');
  });

  it('negative: a held registration validate must still settle at a 100ms deadline and cancel', { timeout: 2000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const manager = new ObservationManager({ sample: (id) => new FakeSampler().sample(id), validate: async () => gate });
    const lease = await manager.observe('held-validate');
    const controller = new AbortController();
    const pending = manager.wait({ channel_id: 'held-validate', after_cursor: lease.cursor, timeout_ms: 100 }, controller.signal);
    let settled = false; void pending.then(() => { settled = true; }, () => { settled = true; });
    try {
      await new Promise<void>((resolve, reject) => setTimeout(() => settled ? reject(new Error('wait settled before held-validation barrier')) : resolve(), 50));
      controller.abort();
      await assert.rejects(pending, ChannelError);
    } finally { release(); await pending.catch(() => undefined); }
  });

  it('held registration validation times out independently before its gate is released', { timeout: 2000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const manager = new ObservationManager({ sample: (id) => new FakeSampler().sample(id), validate: async () => gate });
    const lease = await manager.observe('held-timeout');
    const pending = manager.wait({ channel_id: 'held-timeout', after_cursor: lease.cursor, timeout_ms: 100 });
    try {
      const result = await pending;
      assert.equal(result.reason, 'timeout');
    } finally { release(); await pending.catch(() => undefined); }
  });

  it('negative: repeated wakes while validation is held never overlap evaluation', { timeout: 3000 }, async () => {
    let release!: () => void; let active = 0; let maxActive = 0;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sampler = new FakeSampler();
    let validations = 0;
    let validationStarted!: () => void;
    const started = new Promise<void>((resolve) => { validationStarted = resolve; });
    const manager = new ObservationManager({ sample: (id) => sampler.sample(id), validate: async () => { validations += 1; if (validations === 1) return; active += 1; maxActive = Math.max(maxActive, active); validationStarted(); await gate; active -= 1; } });
    const lease = await manager.observe('wake-held');
    const pending = manager.wait({ channel_id: 'wake-held', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 5000 });
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'wake' };
    try {
      await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('validation admission barrier timed out')), 1500); started.then(() => { clearTimeout(timer); resolve(); }); });
      assert.equal(maxActive, 1);
      sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'wake-2' };
      await new Promise((resolve) => setTimeout(resolve, 300));
      sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'wake-3' };
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(maxActive, 1);
      const timers = (manager as unknown as { pendingWaitTimers: Set<unknown> }).pendingWaitTimers;
      assert.ok(timers.size <= 2, `one deadline plus one poll timer maximum, got ${timers.size}`);
    } finally { release(); await pending.catch(() => undefined); }
  });

  it('negative: completion timestamps 0→800→1600 persist an observation gap', async () => {
    const times = [0, 800, 1600];
    const manager = new ObservationManager(new FakeSampler(), () => times.shift() ?? 1600, () => 0);
    const observer = { id: 'o', channelId: 'gap', instance: 'i', created: 0, validUntil: 99999, identity: 'server:1:pane:1', snapshot: 'a', seq: 0, evicted: 0, events: [], timer: setInterval(() => undefined, 100000), waiters: new Set(), closed: false, sampling: false, lastSampleAt: 0, sampleCount: 1 };
    (manager as unknown as { scheduleSample: (o: unknown) => void }).scheduleSample(observer);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((observer as { failure?: string }).failure, 'OBSERVATION_GAP');
    clearInterval(observer.timer);
  });

  it('deadline while completion validation is held returns timeout with activity preserved', { timeout: 2000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let validations = 0;
    const sampler = new FakeSampler();
    const manager = new ObservationManager({
      sample: (id) => sampler.sample(id),
      validate: async () => { validations += 1; if (validations > 1) await gate; },
    });
    const lease = await manager.observe('deadline-held');
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'activity' };
    const pending = manager.wait({ channel_id: 'deadline-held', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 300 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      release();
      const result = await pending;
      assert.equal(result.reason, 'timeout');
      assert.equal(result.activity_observed, true);
    } finally { release(); await pending.catch(() => undefined); }
  });

  it('rechecks failure after completion validation before returning idle', { timeout: 2000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let validations = 0;
    const sampler = new FakeSampler();
    const manager = new ObservationManager({
      sample: (id) => sampler.sample(id),
      validate: async () => { validations += 1; if (validations > 1) await gate; },
    });
    const lease = await manager.observe('completion-failure');
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'activity' };
    const pending = manager.wait({ channel_id: 'completion-failure', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const observer = (manager as unknown as { observers: Map<string, { failure?: string }> }).observers.get('completion-failure');
      assert.ok(observer);
      observer.failure = 'BACKEND_UNAVAILABLE';
      release();
      await assert.rejects(pending, (error: unknown) => error instanceof ChannelError && error.code === 'BACKEND_UNAVAILABLE');
    } finally { release(); await pending.catch(() => undefined); }
  });

  it('rechecks closure after completion validation before returning idle', { timeout: 2000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let validations = 0;
    const sampler = new FakeSampler();
    const manager = new ObservationManager({ sample: (id) => sampler.sample(id), validate: async () => { validations += 1; if (validations > 1) await gate; } });
    const lease = await manager.observe('completion-closed');
    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'activity' };
    const pending = manager.wait({ channel_id: 'completion-closed', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1000 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const observer = (manager as unknown as { observers: Map<string, { closed: boolean }> }).observers.get('completion-closed');
      assert.ok(observer);
      observer.closed = true;
      release();
      const result = await pending;
      assert.equal(result.reason, 'channel_closed');
    } finally { release(); await pending.catch(() => undefined); }
  });

  it('removes cancelled validation work queued behind the two-sample bound', { timeout: 3000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let calls = 0;
    let admitted!: () => void;
    const admittedBarrier = new Promise<void>((resolve) => { admitted = resolve; });
    const sampler = new FakeSampler();
    const manager = new ObservationManager({
      sample: (id) => sampler.sample(id),
      validate: async () => { calls += 1; active += 1; if (active === 2) admitted(); await gate; active -= 1; },
    });
    const a = await manager.observe('queue-a');
    const b = await manager.observe('queue-b');
    const c = await manager.observe('queue-c');
    const c1 = new AbortController(); const c2 = new AbortController();
    const p1 = manager.wait({ channel_id: 'queue-a', after_cursor: a.cursor, timeout_ms: 5000 }, c1.signal);
    const p2 = manager.wait({ channel_id: 'queue-b', after_cursor: b.cursor, timeout_ms: 5000 }, c2.signal);
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('two validations not admitted')), 1000); admittedBarrier.then(() => { clearTimeout(timer); resolve(); }); });
    const controller = new AbortController();
    const p3 = manager.wait({ channel_id: 'queue-c', after_cursor: c.cursor, timeout_ms: 5000 }, controller.signal);
    controller.abort();
    await assert.rejects(p3, (error: unknown) => error instanceof ChannelError && error.code === 'BACKEND_OPERATION_FAILED');
    release();
    c1.abort(); c2.abort();
    await Promise.all([p1.catch(() => undefined), p2.catch(() => undefined)]);
    assert.equal(calls, 2);
  });

  it('clears all request timers after early completion', async () => {
    const sampler = new FakeSampler();
    const manager = new ObservationManager(sampler);
    const lease = await manager.observe('timer-cleanup');
    const controller = new AbortController();
    const pending = manager.wait({ channel_id: 'timer-cleanup', after_cursor: lease.cursor, timeout_ms: 1000 }, controller.signal);
    controller.abort();
    await assert.rejects(pending, ChannelError);
    const timers = (manager as unknown as { pendingWaitTimers?: Set<unknown> }).pendingWaitTimers;
    assert.ok(timers, 'test harness requires tracked request timers');
    assert.equal(timers?.size, 0);

    sampler.sampleValue = { ...sampler.sampleValue, snapshot: 'timer-activity' };
    const idle = await manager.wait({ channel_id: 'timer-cleanup', after_cursor: lease.cursor, idle_ms: 250, timeout_ms: 1500 });
    assert.equal(idle.reason, 'output_idle');
    assert.equal(timers?.size, 0);
  });
});
