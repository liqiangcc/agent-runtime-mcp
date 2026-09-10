import { randomBytes, randomUUID } from 'node:crypto';
import { ChannelError, type ChannelErrorCode } from './errors.js';
import type { ObservationLease, WaitChannelEventInput, WaitChannelEventResult } from './types.js';

export interface ObservationSample { identity: string; snapshot: string; state: 'present' | 'closed'; }
export interface ObservationSampler { sample(channelId: string): Promise<ObservationSample>; validate?(channelId: string, identity: string): Promise<void>; }
interface Event { seq: number; at: number; wall: string }
interface Observer {
  id: string; channelId: string; instance: string; created: number; validUntil: number;
  identity: string; snapshot: string; seq: number; evicted: number; events: Event[];
  timer: NodeJS.Timeout; waiters: Set<() => void>; closed: boolean; failure?: ChannelErrorCode;
  sampling: boolean; lastSampleAt: number; sampleCount: number;
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
const MAX_SAMPLE_GAP_MS = 1000;
const MAX_TOKENS = 4096;

export class ObservationManager {
  private readonly observers = new Map<string, Observer>();
  private readonly tokens = new Map<string, Token>();
  private readonly creating = new Map<string, Promise<Observer>>();
  private waiterCount = 0;
  private activeSamples = 0;
  private readonly sampleQueue: Array<() => void> = [];
  constructor(private readonly sampler: ObservationSampler, private readonly now: () => number = () => performance.now(), private readonly wall: () => number = Date.now) {}

  async observe(channelId: string): Promise<ObservationLease> {
    let observer = this.observers.get(channelId);
    if (observer && observer.validUntil > this.now() && !observer.closed && !observer.failure) {
      observer.validUntil = Math.min(this.now() + LEASE_MS, observer.created + LIFETIME_MS);
      return this.issue(observer, observer.seq);
    }
    const pending = this.creating.get(channelId);
    if (pending) { observer = await pending; return this.issue(observer, observer.seq); }
    if (observer) { observer.failure = 'CURSOR_EXPIRED'; observer.closed = true; clearInterval(observer.timer); this.maybeDispose(observer); }
    if (this.observers.size + this.creating.size >= MAX_OBSERVERS) throw new ChannelError('RESOURCE_EXHAUSTED', 'Observer limit reached');
    const promise = this.createObserver(channelId);
    this.creating.set(channelId, promise);
    try { observer = await promise; return this.issue(observer, observer.seq); } finally { this.creating.delete(channelId); }
  }

  private async createObserver(channelId: string): Promise<Observer> {
    const first = await this.runSample(() => this.sampler.sample(channelId));
    if (first.state !== 'present') throw new ChannelError('CHANNEL_NOT_FOUND', 'Channel is not present');
    const created = this.now();
    const observer: Observer = { id: randomUUID(), channelId, instance: randomBytes(18).toString('base64url'), created, validUntil: created + LEASE_MS, identity: first.identity, snapshot: first.snapshot, seq: 0, evicted: 0, events: [], timer: undefined as never, waiters: new Set(), closed: false, sampling: false, lastSampleAt: created, sampleCount: 1 };
    observer.timer = setInterval(() => this.scheduleSample(observer), SAMPLE_INTERVAL_MS); observer.timer.unref?.();
    this.observers.set(channelId, observer); return observer;
  }

  async wait(input: WaitChannelEventInput, signal?: AbortSignal): Promise<WaitChannelEventResult> {
    const idle = input.idle_ms ?? OBSERVE_DEFAULT_IDLE_MS;
    const timeout = input.timeout_ms ?? OBSERVE_DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(idle) || idle < 250 || idle > 60000 || !Number.isInteger(timeout) || timeout < 100 || timeout > 60000) throw new ChannelError('WAIT_ARGUMENT_INVALID', 'idle_ms must be 250..60000 and timeout_ms must be 100..60000');
    if (signal?.aborted) throw new ChannelError('BACKEND_OPERATION_FAILED', 'Wait cancelled');
    const token = this.tokens.get(input.after_cursor); if (!token) throw new ChannelError('CURSOR_INVALID', 'Unknown observation cursor');
    const observer = this.observers.get(token.channelId);
    if (!observer || token.observer !== observer.id || token.channelId !== input.channel_id) throw new ChannelError('CURSOR_INVALID', 'Cursor is not bound to this channel');
    this.validateToken(observer, token);
    if (this.sampler.validate) await this.sampler.validate(input.channel_id, observer.identity);
    if (this.waiterCount >= MAX_WAITERS_GLOBAL || observer.waiters.size >= MAX_WAITERS_PER_CHANNEL) throw new ChannelError('WAITER_LIMIT', 'Waiter limit reached');
    this.waiterCount += 1; const deadline = this.now() + timeout;
    try {
      return await new Promise<WaitChannelEventResult>((resolve, reject) => {
        let done = false; let timer: NodeJS.Timeout | undefined;
        const finish = (fn: () => void) => { if (done) return; done = true; if (timer) clearTimeout(timer); signal?.removeEventListener('abort', abort); observer.waiters.delete(wake); fn(); };
        const abort = () => finish(() => reject(new ChannelError('BACKEND_OPERATION_FAILED', 'Wait cancelled')));
        const wake = () => { if (timer) clearTimeout(timer); void evaluate(); };
        const evaluate = async () => {
          if (done) return;
          try {
            this.validateToken(observer, token);
            if (observer.failure) throw new ChannelError(observer.failure, 'Observation sampling failed');
            if (observer.closed) return finish(() => resolve(this.result(observer, 'channel_closed', input, idle, timeout, token.seq, false)));
            const now = this.now();
            if (now - observer.lastSampleAt > MAX_SAMPLE_GAP_MS) throw new ChannelError('OBSERVATION_GAP', 'Observation sample gap exceeded bound');
            const events = observer.events.filter((e) => e.seq > token.seq); const last = events.at(-1);
            if (last && observer.lastSampleAt >= last.at + idle && now < deadline) {
              if (this.sampler.validate) await this.sampler.validate(input.channel_id, observer.identity);
              return finish(() => resolve(this.result(observer, 'output_idle', input, idle, timeout, last.seq, true, events[0], last)));
            }
            if (now >= deadline) return finish(() => resolve(this.result(observer, 'timeout', input, idle, timeout, token.seq, events.length > 0, events[0], last)));
            timer = setTimeout(() => { timer = undefined; void evaluate(); }, Math.min(SAMPLE_INTERVAL_MS, Math.max(1, deadline - now)));
          } catch (error) { finish(() => reject(error)); }
        };
        if (signal?.aborted) return finish(() => reject(new ChannelError('BACKEND_OPERATION_FAILED', 'Wait cancelled')));
        observer.waiters.add(wake); signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) return finish(() => reject(new ChannelError('BACKEND_OPERATION_FAILED', 'Wait cancelled')));
        void evaluate();
      });
    } finally { this.waiterCount -= 1; this.maybeDispose(observer); }
  }

  private scheduleSample(observer: Observer): void {
    if (observer.sampling || observer.closed || observer.failure || this.activeSamples >= 2) return;
    if (this.now() - observer.lastSampleAt > MAX_SAMPLE_GAP_MS) { observer.failure = 'OBSERVATION_GAP'; clearInterval(observer.timer); for (const wake of observer.waiters) wake(); return; }
    observer.sampling = true;
    void this.sample(observer).finally(() => { observer.sampling = false; this.maybeDispose(observer); });
  }
  private async sample(observer: Observer): Promise<void> {
    const started = this.now(); if (observer.validUntil <= started) { this.expire(observer); return; }
    try {
      const sample = await this.runSample(() => this.sampler.sample(observer.channelId)); const finished = this.now();
      if (finished - started > MAX_SAMPLE_GAP_MS) throw new ChannelError('OBSERVATION_GAP', 'Observation sample exceeded one second');
      observer.lastSampleAt = finished; observer.sampleCount += 1;
      if (sample.state === 'closed') { observer.closed = true; clearInterval(observer.timer); for (const wake of observer.waiters) wake(); return; }
      if (sample.identity !== observer.identity) throw new ChannelError('CHANNEL_INSTANCE_CHANGED', 'Channel identity changed');
      if (sample.snapshot !== observer.snapshot) {
        observer.snapshot = sample.snapshot; const at = finished;
        observer.events.push({ seq: ++observer.seq, at, wall: new Date(this.wall()).toISOString() });
        while (observer.events.length > MAX_HISTORY || JSON.stringify(observer.events).length > MAX_HISTORY_BYTES) observer.evicted = observer.events.shift()!.seq;
      }
      for (const wake of observer.waiters) wake();
    } catch (error) { observer.failure = error instanceof ChannelError ? error.code : 'BACKEND_UNAVAILABLE'; clearInterval(observer.timer); for (const wake of observer.waiters) wake(); }
  }
  private expire(observer: Observer): void { observer.failure = 'CURSOR_EXPIRED'; clearInterval(observer.timer); for (const wake of observer.waiters) wake(); this.maybeDispose(observer); }
  private maybeDispose(observer: Observer): void { if (observer.waiters.size > 0 || (observer.validUntil > this.now() && !observer.failure && !observer.closed)) return; clearInterval(observer.timer); if (this.observers.get(observer.channelId) !== observer) return; this.observers.delete(observer.channelId); for (const [cursor, token] of this.tokens) if (token.observer === observer.id) this.tokens.delete(cursor); }
  private validateToken(observer: Observer, token: Token): void { const now = this.now(); if (token.exp < now || observer.validUntil < now || observer.failure === 'CURSOR_EXPIRED') throw new ChannelError('CURSOR_EXPIRED', 'Observation cursor expired'); if (token.instance !== observer.instance) throw new ChannelError('CHANNEL_INSTANCE_CHANGED', 'Channel instance changed'); if (token.seq < observer.evicted) throw new ChannelError('OBSERVATION_GAP', 'Observation history no longer retains this cursor'); }
  private issue(observer: Observer, seq: number): ObservationLease { const exp = Math.min(this.now() + LEASE_MS, observer.created + LIFETIME_MS); for (const [cursor, token] of this.tokens) if (token.exp < this.now()) this.tokens.delete(cursor); if (this.tokens.size >= MAX_TOKENS) { const oldest = this.tokens.keys().next().value as string | undefined; if (oldest) this.tokens.delete(oldest); } const token = randomBytes(24).toString('base64url'); this.tokens.set(token, { observer: observer.id, channelId: observer.channelId, instance: observer.instance, seq, exp }); return { cursor: token, channel_instance: observer.instance, model: 'snapshot_change', issued_at: new Date(this.wall()).toISOString(), valid_until: new Date(this.wall() + (exp - this.now())).toISOString(), continuity: 'complete' }; }
  private async runSample<T>(fn: () => Promise<T>): Promise<T> { if (this.activeSamples >= 2) await new Promise<void>((resolve) => this.sampleQueue.push(resolve)); this.activeSamples += 1; try { return await fn(); } finally { this.activeSamples -= 1; this.sampleQueue.shift()?.(); } }
  private result(observer: Observer, reason: WaitChannelEventResult['reason'], input: WaitChannelEventInput, idle: number, timeout: number, seq: number, activity: boolean, first?: Event, last?: Event): WaitChannelEventResult { const next = reason === 'output_idle' ? this.issue(observer, seq).cursor : input.after_cursor; return { reason, channel_id: input.channel_id, channel_instance: observer.instance, observed_at: new Date(this.wall()).toISOString(), next_cursor: next, activity_observed: activity, ...(first ? { first_activity_at: first.wall } : {}), ...(last ? { last_activity_at: last.wall } : {}), observation_model: 'snapshot_change', idle_ms: idle, timeout_ms: timeout }; }
}
