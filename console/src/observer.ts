/**
 * Per-Channel observation/history manager (Issue #62).
 *
 * One bounded observe/wait loop runs per Channel while at least one viewer is
 * attached; the last viewer leaving stops the loop within one wait timeout.
 * Attach ordering is observe-before-read: the get_channel(observe:true) cursor
 * is acquired before every initial/re-observe read_channel, and tail overlap
 * is deduped rather than risking a gap. wait_channel_event `timeout` is a
 * heartbeat — never a block boundary, pause, or completion signal.
 */

import type { ConsoleEvent, ConsoleEventBus } from './events.js';
import {
  diffTail,
  formatRawTranscript,
  HistoryRing,
  type HistoryEntry,
  type OutputBlockEntry,
  type RingOptions,
  type RingSnapshot,
} from './history.js';
import type { Logger } from './logger.js';
import { McpToolError, McpUnavailableError, type ConsoleMcp } from './mcp-client.js';

export type ObservationState =
  | 'idle'
  | 'attaching'
  | 'live'
  | 'polling'
  | 'needs_reobserve'
  | 'closed'
  | 'error';

export interface HubUpdate {
  type: 'snapshot' | 'delta';
  channel_id: string;
  state: ObservationState;
  detail?: string;
  appended?: HistoryEntry[];
  updated?: HistoryEntry[];
  dropped_entries?: number;
  dropped_lines?: number;
  snapshot?: RingSnapshot;
}

export type HistoryListener = (update: HubUpdate) => void;

export interface ObserverOptions {
  idleMs?: number;
  timeoutMs?: number;
  pollMs?: number;
  tailLines?: number;
  tailBytes?: number;
  maxObservedChannels?: number;
  maxManagers?: number;
  ring?: RingOptions;
}

interface ChannelState {
  channelId: string;
  ring: HistoryRing;
  state: ObservationState;
  detail?: string;
  cursor: string | null;
  lastRead: string;
  currentBlockId: number | null;
  viewers: Set<HistoryListener>;
  loopActive: boolean;
  stopped: boolean;
  pollTimer: ReturnType<typeof setTimeout> | null;
  lastAccess: number;
}

const DEFAULT_IDLE_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 2_500;
const DEFAULT_TAIL_LINES = 400;
const DEFAULT_TAIL_BYTES = 256 * 1024;
const DEFAULT_MAX_OBSERVED = 4;
const DEFAULT_MAX_MANAGERS = 16;

const REOBSERVE_CODES = new Set(['CURSOR_INVALID', 'CURSOR_EXPIRED', 'OBSERVATION_GAP', 'CHANNEL_INSTANCE_CHANGED']);
const POLLING_CODES = new Set(['WAITER_LIMIT', 'RESOURCE_EXHAUSTED', 'OBSERVATION_UNSUPPORTED']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value);
}

export class HistoryHub {
  private readonly mcp: ConsoleMcp;
  private readonly logger: Logger;
  private readonly idleMs: number;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly tailLines: number;
  private readonly tailBytes: number;
  private readonly maxObserved: number;
  private readonly maxManagers: number;
  private readonly ringOptions: RingOptions;
  private readonly channels = new Map<string, ChannelState>();
  private readonly unsubscribeBus: () => void;

  constructor(deps: { mcp: ConsoleMcp; events: ConsoleEventBus; logger?: Logger; options?: ObserverOptions }) {
    this.mcp = deps.mcp;
    this.logger = deps.logger ?? (() => undefined);
    const o = deps.options ?? {};
    this.idleMs = o.idleMs ?? DEFAULT_IDLE_MS;
    this.timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollMs = o.pollMs ?? DEFAULT_POLL_MS;
    this.tailLines = o.tailLines ?? DEFAULT_TAIL_LINES;
    this.tailBytes = o.tailBytes ?? DEFAULT_TAIL_BYTES;
    this.maxObserved = o.maxObservedChannels ?? DEFAULT_MAX_OBSERVED;
    this.maxManagers = o.maxManagers ?? DEFAULT_MAX_MANAGERS;
    this.ringOptions = o.ring ?? {};
    this.unsubscribeBus = deps.events.subscribe((event) => this.recordConsoleEvent(event));
  }

  private ensure(channelId: string): ChannelState {
    let cs = this.channels.get(channelId);
    if (cs) {
      cs.lastAccess = Date.now();
      return cs;
    }
    if (this.channels.size >= this.maxManagers) {
      for (const [id, candidate] of this.channels) {
        if (candidate.viewers.size === 0 && !candidate.loopActive) {
          this.channels.delete(id);
          break;
        }
      }
      if (this.channels.size >= this.maxManagers) {
        throw new McpToolError('RESOURCE_EXHAUSTED', 'history manager capacity reached');
      }
    }
    cs = {
      channelId,
      ring: new HistoryRing(this.ringOptions),
      state: 'idle',
      cursor: null,
      lastRead: '',
      currentBlockId: null,
      viewers: new Set(),
      loopActive: false,
      stopped: false,
      pollTimer: null,
      lastAccess: Date.now(),
    };
    this.channels.set(channelId, cs);
    return cs;
  }

  status(channelId: string): { state: ObservationState; detail?: string; viewers: number } {
    const cs = this.channels.get(channelId);
    return cs ? { state: cs.state, detail: cs.detail, viewers: cs.viewers.size } : { state: 'idle', viewers: 0 };
  }

  snapshot(channelId: string): { channel_id: string; state: ObservationState; detail?: string; ring: RingSnapshot } {
    const cs = this.ensure(channelId);
    return { channel_id: channelId, state: cs.state, detail: cs.detail, ring: cs.ring.snapshot() };
  }

  rawTranscript(channelId: string): string {
    return formatRawTranscript(this.snapshot(channelId).ring);
  }

  private observedCount(): number {
    let count = 0;
    for (const cs of this.channels.values()) {
      if (cs.viewers.size > 0) count += 1;
    }
    return count;
  }

  addViewer(channelId: string, listener: HistoryListener): () => void {
    const cs = this.ensure(channelId);
    if (cs.viewers.size === 0 && this.observedCount() >= this.maxObserved) {
      throw new McpToolError('RESOURCE_EXHAUSTED', `at most ${this.maxObserved} Channels may be observed at once`);
    }
    cs.viewers.add(listener);
    listener({ type: 'snapshot', channel_id: channelId, state: cs.state, detail: cs.detail, snapshot: cs.ring.snapshot() });
    if (!cs.loopActive && !cs.pollTimer) {
      void this.runLoop(cs);
    }
    return () => this.removeViewer(channelId, listener);
  }

  private removeViewer(channelId: string, listener: HistoryListener): void {
    const cs = this.channels.get(channelId);
    if (!cs) return;
    cs.viewers.delete(listener);
    cs.lastAccess = Date.now();
    if (cs.viewers.size === 0) {
      cs.stopped = true;
      if (cs.pollTimer) {
        clearTimeout(cs.pollTimer);
        cs.pollTimer = null;
      }
      if (!cs.loopActive && (cs.state === 'live' || cs.state === 'polling' || cs.state === 'attaching')) {
        cs.state = 'idle';
      }
      this.logger('observe_viewer_detached', { channel_id: channelId });
    }
  }

  private broadcast(cs: ChannelState, appended: HistoryEntry[] = [], updated: HistoryEntry[] = []): void {
    if (cs.viewers.size === 0) return;
    const delta: HubUpdate = {
      type: 'delta',
      channel_id: cs.channelId,
      state: cs.state,
      detail: cs.detail,
      appended,
      updated,
      dropped_entries: cs.ring.snapshot().dropped_entries,
      dropped_lines: cs.ring.snapshot().dropped_lines,
    };
    for (const listener of [...cs.viewers]) {
      try {
        listener(delta);
      } catch {
        // A faulty listener must not break observation.
      }
    }
  }

  private setState(cs: ChannelState, state: ObservationState, detail?: string): void {
    cs.state = state;
    cs.detail = detail;
    this.broadcast(cs);
  }

  private currentBlock(cs: ChannelState): OutputBlockEntry | null {
    if (cs.currentBlockId === null) return null;
    const entry = cs.ring.get(cs.currentBlockId);
    return entry && entry.kind === 'output_block' ? entry : null;
  }

  private closeCurrentBlock(cs: ChannelState, state: 'paused' | 'closed'): HistoryEntry[] {
    const block = this.currentBlock(cs);
    const updated: HistoryEntry[] = [];
    if (block && block.state !== 'closed') {
      const mutated = cs.ring.update(block.id, (entry) => {
        if (entry.kind === 'output_block') {
          entry.state = state;
          if (state === 'closed') entry.closed_at = new Date().toISOString();
        }
      });
      if (mutated) updated.push(mutated);
      if (state === 'closed') cs.currentBlockId = null;
    }
    return updated;
  }

  private recordConsoleEvent(event: ConsoleEvent): void {
    let cs: ChannelState;
    try {
      cs = this.ensure(event.channel_id);
    } catch {
      return;
    }
    let updated: HistoryEntry[] = [];
    let appended: HistoryEntry[] = [];
    if (event.type === 'user-turn') {
      // The next user turn closes the current output block — terminal boundary.
      updated = this.closeCurrentBlock(cs, 'closed');
      appended = [
        cs.ring.push({
          kind: 'user_turn',
          text: event.text,
          submit: event.submit,
          sent_at: event.sent_at,
          transport_result: event.transport_result,
        }),
      ];
    } else if (event.type === 'control') {
      // A control send does not close the output block; the ring still records it.
      appended = [
        cs.ring.push({
          kind: 'control',
          control: event.control,
          sent_at: event.sent_at,
          transport_result: event.transport_result,
        }),
      ];
    }
    this.broadcast(cs, appended, updated);
  }

  /** Bounded tail read + overlap dedupe; never intentionally creates a gap. */
  private async pull(cs: ChannelState, mode: 'earlier' | 'output'): Promise<{ appended: HistoryEntry[]; updated: HistoryEntry[] }> {
    const result = await this.mcp.readChannel(cs.channelId, { lines: this.tailLines, bytes: this.tailBytes });
    const read = isRecord(result.read) ? result.read : {};
    const text = typeof read.text === 'string' ? read.text : '';
    const truncated = read.truncated === true;
    const capturedAt = typeof read.captured_at === 'string' ? read.captured_at : new Date().toISOString();
    const diff = diffTail(cs.lastRead, text);
    cs.lastRead = text;

    if (mode === 'earlier') {
      if (text === '') return { appended: [], updated: [] };
      return {
        appended: [cs.ring.push({ kind: 'earlier_output', text, truncated, observed_at: capturedAt })],
        updated: [],
      };
    }
    if (diff.appended === '') return { appended: [], updated: [] };

    const block = this.currentBlock(cs);
    if (block && block.state !== 'closed') {
      const appendedText = diff.appended;
      const mutated = cs.ring.update(block.id, (entry) => {
        if (entry.kind === 'output_block') {
          entry.text = entry.text === '' ? appendedText : `${entry.text}\n${appendedText}`;
          entry.state = 'open';
          entry.truncated = entry.truncated || truncated;
        }
      });
      return { appended: [], updated: mutated ? [mutated] : [] };
    }
    const created = cs.ring.push({
      kind: 'output_block',
      state: 'open',
      text: diff.appended,
      truncated,
      opened_at: capturedAt,
    });
    cs.currentBlockId = created.id;
    return { appended: [created], updated: [] };
  }

  private schedulePoll(cs: ChannelState): void {
    if (cs.pollTimer || cs.stopped || cs.viewers.size === 0) return;
    this.setState(cs, 'polling');
    const tick = async () => {
      if (cs.stopped || cs.viewers.size === 0) {
        cs.pollTimer = null;
        return;
      }
      try {
        const { appended, updated } = await this.pull(cs, 'output');
        this.broadcast(cs, appended, updated);
      } catch (error) {
        this.handleLoopError(cs, error);
        return;
      }
      if (!cs.stopped && cs.viewers.size > 0) {
        cs.pollTimer = setTimeout(() => void tick(), this.pollMs);
      } else {
        cs.pollTimer = null;
      }
    };
    cs.pollTimer = setTimeout(() => void tick(), this.pollMs);
  }

  private handleLoopError(cs: ChannelState, error: unknown): void {
    if (cs.pollTimer) {
      clearTimeout(cs.pollTimer);
      cs.pollTimer = null;
    }
    if (error instanceof McpToolError) {
      if (REOBSERVE_CODES.has(error.code)) {
        this.setState(cs, 'needs_reobserve', error.code);
        this.logger('observe_needs_reobserve', { channel_id: cs.channelId, code: error.code });
        return;
      }
      if (POLLING_CODES.has(error.code)) {
        this.logger('observe_polling_fallback', { channel_id: cs.channelId, code: error.code });
        this.schedulePoll(cs);
        return;
      }
      if (error.code === 'TIMEOUT') {
        // Adapter-level ambiguity: the wait may still be held server-side; the
        // bounded poll path keeps the loop moving without stacking waiters.
        this.schedulePoll(cs);
        return;
      }
      this.setState(cs, 'error', error.code);
      this.logger('observe_error', { channel_id: cs.channelId, code: error.code });
      return;
    }
    if (error instanceof McpUnavailableError) {
      this.setState(cs, 'error', 'MCP_UNAVAILABLE');
      this.logger('observe_error', { channel_id: cs.channelId, code: 'MCP_UNAVAILABLE' });
      return;
    }
    this.setState(cs, 'error', 'INTERNAL');
    this.logger('observe_error', { channel_id: cs.channelId, code: 'INTERNAL' });
  }

  private async runLoop(cs: ChannelState): Promise<void> {
    cs.loopActive = true;
    cs.stopped = false;
    try {
      this.setState(cs, 'attaching');
      // Attach invariant: observation cursor BEFORE the initial tail read.
      const observed = await this.mcp.getChannel(cs.channelId, true);
      const observation = isRecord(observed.observation) ? observed.observation : {};
      const cursor = typeof observation.cursor === 'string' ? observation.cursor : null;
      if (cursor === null) {
        throw new McpToolError('OBSERVATION_UNSUPPORTED', 'get_channel(observe:true) returned no observation cursor');
      }
      cs.cursor = cursor;
      // earlier_output is produced once, at the first attach; a re-observe
      // dedupes the tail against the last read and appends an output block.
      const firstAttach = !cs.ring.snapshot().entries.some((e) => e.kind === 'earlier_output');
      const initial = await this.pull(cs, firstAttach ? 'earlier' : 'output');
      this.setState(cs, 'live');
      this.broadcast(cs, initial.appended, initial.updated);

      while (!cs.stopped && cs.viewers.size > 0) {
        const wait = await this.mcp.waitChannelEvent(cs.channelId, cs.cursor, {
          idle_ms: this.idleMs,
          timeout_ms: this.timeoutMs,
        });
        if (cs.stopped || cs.viewers.size === 0) break;
        const reason = isRecord(wait) && typeof wait.reason === 'string' ? wait.reason : '';
        const nextCursor = typeof wait.next_cursor === 'string' ? wait.next_cursor : null;
        if (nextCursor !== null) cs.cursor = nextCursor;
        if (reason === 'output_idle') {
          const { appended, updated } = await this.pull(cs, 'output');
          updated.push(...this.closeCurrentBlock(cs, 'paused'));
          this.broadcast(cs, appended, updated);
        } else if (reason === 'timeout' && wait.activity_observed === true) {
          // Timeout is never a block boundary — but activity_observed means
          // output kept flowing past the deadline, so refresh the tail into
          // the still-open block; the next output_idle closes it.
          const { appended, updated } = await this.pull(cs, 'output');
          this.broadcast(cs, appended, updated);
        } else if (reason === 'channel_closed') {
          this.setState(cs, 'closed');
          this.logger('observe_channel_closed', { channel_id: cs.channelId });
          break;
        }
        // reason === 'timeout' is a heartbeat: not a block boundary, not a
        // pause/completion signal — the loop simply continues.
      }
    } catch (error) {
      if (!cs.stopped) this.handleLoopError(cs, error);
    } finally {
      cs.loopActive = false;
      if (cs.viewers.size === 0 && (cs.state === 'live' || cs.state === 'attaching')) {
        cs.state = 'idle';
      }
    }
  }

  async close(): Promise<void> {
    this.unsubscribeBus();
    for (const cs of this.channels.values()) {
      cs.stopped = true;
      cs.viewers.clear();
      if (cs.pollTimer) {
        clearTimeout(cs.pollTimer);
        cs.pollTimer = null;
      }
    }
  }
}

export type { HistoryEntry, RingSnapshot };
export { isRecordArray };
