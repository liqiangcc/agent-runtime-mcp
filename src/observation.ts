import { randomBytes, randomUUID } from 'node:crypto';
import { ChannelError } from './errors.js';
import type { ObservationLease, WaitChannelEventInput, WaitChannelEventResult } from './types.js';

export interface ObservationSample {
  identity: string;
  snapshot: string;
  state: 'present' | 'closed';
}
export interface ObservationSampler {
  sample(channelId: string): Promise<ObservationSample>;
}
interface Event { seq: number; at: number; wall: string }
interface Observer {
  id: string; channelId: string; instance: string; created: number; validUntil: number;
  identity: string; snapshot: string; seq: number; evicted: number; events: Event[];
  timer: NodeJS.Timeout; waiters: Set<() => void>; closed: boolean; failure?: 'changed' | 'unavailable';
}
interface Token { observer: string; channelId: string; instance: string; seq: number; exp: number }

export const OBSERVE_DEFAULT_IDLE_MS = 1000;
export const OBSERVE_DEFAULT_TIMEOUT_MS = 30000;
const SAMPLE_INTERVAL_MS = 250;
const MAX_OBSERVERS = 8;
const MAX_WAITERS_PER_CHANNEL = 2;
const MAX_WAITERS_GLOBAL = 16;
const LEASE_MS = 5 * 60_000;
const LIFETIME_MS = 15 * 60_000;
const MAX_HISTORY = 256;
const MAX_HISTORY_BYTES = 64 * 1024;

export class ObservationManager {
  private readonly observers = new Map<string, Observer>();
  private readonly tokens = new Map<string, Token>();
  private waiterCount = 0;
  private readonly serviceInstance = randomUUID();
  constructor(private readonly sampler: ObservationSampler, private readonly now: () => number = () => performance.now(), private readonly wall: () => number = Date.now) {}

  async observe(channelId: string): Promise<ObservationLease> {
    let observer = this.observers.get(channelId);
    if (!observer || observer.validUntil <= this.now() || observer.closed || observer.failure) {
      if (this.observers.size >= MAX_OBSERVERS) throw new ChannelError('RESOURCE_EXHAUSTED', 'Observer limit reached');
      const first = await this.sampler.sample(channelId);
      if (first.state !== 'present') throw new ChannelError('CHANNEL_NOT_FOUND', 'Channel is not present');
      const created = this.now();
      observer = {
        id: randomUUID(), channelId, instance: randomBytes(18).toString('base64url'), created,
        validUntil: Math.min(created + LEASE_MS, created + LIFETIME_MS), identity: first.identity,
        snapshot: first.snapshot, seq: 0, evicted: 0, events: [], timer: undefined as never,
        waiters: new Set(), closed: false,
      };
      observer.timer = setInterval(() => void this.sample(observer!), SAMPLE_INTERVAL_MS);
      observer.timer.unref?.();
      this.observers.set(channelId, observer);
    } else {
      observer.validUntil = Math.min(this.now() + LEASE_MS, observer.created + LIFETIME_MS);
    }
    return this.issue(observer, observer.seq);
  }

  async wait(input: WaitChannelEventInput, signal?: AbortSignal): Promise<WaitChannelEventResult> {
    const idle = input.idle_ms ?? OBSERVE_DEFAULT_IDLE_MS;
    const timeout = input.timeout_ms ?? OBSERVE_DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(idle) || idle < 250 || idle > 60000 || !Number.isInteger(timeout) || timeout < 100 || timeout > 60000) {
      throw new ChannelError('WAIT_ARGUMENT_INVALID', 'idle_ms must be 250..60000 and timeout_ms must be 100..60000');
    }
    const token = this.tokens.get(input.after_cursor);
    if (!token) throw new ChannelError('CURSOR_INVALID', 'Unknown observation cursor');
    const observer = this.observers.get(token.channelId);
    if (!observer || token.observer !== observer.id || token.channelId !== input.channel_id) throw new ChannelError('CURSOR_INVALID', 'Cursor is not bound to this channel');
    const now = this.now();
    if (token.exp < now || observer.validUntil < now) throw new ChannelError('CURSOR_EXPIRED', 'Observation cursor expired');
    if (token.instance !== observer.instance) throw new ChannelError('CHANNEL_INSTANCE_CHANGED', 'Channel instance changed');
    if (token.seq < observer.evicted) throw new ChannelError('OBSERVATION_GAP', 'Observation history no longer retains this cursor');
    if (this.waiterCount >= MAX_WAITERS_GLOBAL || observer.waiters.size >= MAX_WAITERS_PER_CHANNEL) throw new ChannelError('WAITER_LIMIT', 'Waiter limit reached');
    this.waiterCount += 1;
    const started = this.now();
    const deadline = started + timeout;
    try {
      return await new Promise<WaitChannelEventResult>((resolve, reject) => {
        let done = false;
        const finish = (fn: () => void) => { if (done) return; done = true; observer.waiters.delete(wake); fn(); };
        const wake = () => { void evaluate(); };
        const evaluate = async () => {
          if (done) return;
          if (signal?.aborted) return finish(() => reject(new ChannelError('BACKEND_OPERATION_FAILED', 'Wait cancelled')));
          const t = this.now();
          if (observer!.failure === 'changed') return finish(() => reject(new ChannelError('CHANNEL_INSTANCE_CHANGED', 'Channel identity changed')));
          if (observer!.failure === 'unavailable') return finish(() => reject(new ChannelError('BACKEND_UNAVAILABLE', 'Observation backend unavailable')));
          if (observer!.closed) return finish(() => resolve(this.result(observer!, 'channel_closed', input, idle, timeout, token.seq, false, t)));
          const events = observer!.events.filter((e) => e.seq > token.seq);
          const last = events.at(-1);
          if (last && t - last.at >= idle && t < deadline) return finish(() => resolve(this.result(observer!, 'output_idle', input, idle, timeout, last.seq, true, t, events[0], last)));
          if (t >= deadline) return finish(() => resolve(this.result(observer!, 'timeout', input, idle, timeout, token.seq, events.length > 0, t, events[0], last)));
          setTimeout(() => void evaluate(), Math.min(SAMPLE_INTERVAL_MS, Math.max(1, deadline - t)));
        };
        observer!.waiters.add(wake);
        signal?.addEventListener('abort', () => finish(() => reject(new ChannelError('BACKEND_OPERATION_FAILED', 'Wait cancelled'))), { once: true });
        void evaluate();
      });
    } finally { this.waiterCount -= 1; }
  }

  private async sample(observer: Observer): Promise<void> {
    if (observer.validUntil <= this.now()) { observer.closed = true; clearInterval(observer.timer); return; }
    try {
      const sample = await this.sampler.sample(observer.channelId);
      if (sample.state === 'closed') { observer.closed = true; clearInterval(observer.timer); for (const wake of observer.waiters) wake(); return; }
      if (sample.identity !== observer.identity) { observer.failure = 'changed'; clearInterval(observer.timer); for (const wake of observer.waiters) wake(); return; }
      if (sample.snapshot !== observer.snapshot) {
        observer.snapshot = sample.snapshot;
        const at = this.now();
        observer.events.push({ seq: ++observer.seq, at, wall: new Date(this.wall()).toISOString() });
        while (observer.events.length > MAX_HISTORY || JSON.stringify(observer.events).length > MAX_HISTORY_BYTES) observer.evicted = observer.events.shift()!.seq;
        for (const wake of observer.waiters) wake();
      }
    } catch { observer.failure = 'unavailable'; for (const wake of observer.waiters) wake(); }
  }

  private issue(observer: Observer, seq: number): ObservationLease {
    const exp = Math.min(this.now() + LEASE_MS, observer.created + LIFETIME_MS);
    const token = randomBytes(24).toString('base64url');
    this.tokens.set(token, { observer: observer.id, channelId: observer.channelId, instance: observer.instance, seq, exp });
    return { cursor: token, channel_instance: observer.instance, model: 'snapshot_change', issued_at: new Date(this.wall()).toISOString(), valid_until: new Date(this.wall() + (exp - this.now())).toISOString(), continuity: 'complete' };
  }
  private result(observer: Observer, reason: WaitChannelEventResult['reason'], input: WaitChannelEventInput, idle: number, timeout: number, seq: number, activity: boolean, at: number, first?: Event, last?: Event): WaitChannelEventResult {
    const next = reason === 'output_idle' ? this.issue(observer, seq).cursor : input.after_cursor;
    return { reason, channel_id: input.channel_id, channel_instance: observer.instance, observed_at: new Date(this.wall()).toISOString(), next_cursor: next, activity_observed: activity, ...(first ? { first_activity_at: first.wall } : {}), ...(last ? { last_activity_at: last.wall } : {}), observation_model: 'snapshot_change', idle_ms: idle, timeout_ms: timeout };
  }
}
