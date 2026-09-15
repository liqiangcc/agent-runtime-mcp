import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ConfigError, loadConfig } from '../src/config.js';
import { ConsoleEventBus } from '../src/events.js';
import { diffTail, formatRawTranscript, HistoryRing, type HistoryEntry } from '../src/history.js';
import { createRequestHandler, expectedAuthority } from '../src/http-app.js';
import { createLogger } from '../src/logger.js';
import { McpToolError, type ConsoleMcp, type TerminalControl, type ToolPayload } from '../src/mcp-client.js';
import { HistoryHub, type HubUpdate } from '../src/observer.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const CHANNEL = 'tmux:abcdef123456:0';

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail('condition not met within timeout');
}

class ScriptedMcp implements ConsoleMcp {
  calls: { tool: string; args: Record<string, unknown> }[] = [];
  readQueue: { text: string; truncated?: boolean }[] = [];
  waitQueue: (ToolPayload | Error)[] = [];
  observeError: unknown = null;
  private waitGate: (() => void) | null = null;

  private record(tool: string, args: Record<string, unknown>): void {
    this.calls.push({ tool, args });
  }

  health(): Promise<ToolPayload> {
    this.record('health', {});
    return Promise.resolve({ health: { available: true } });
  }
  listChannels(): Promise<ToolPayload> {
    this.record('list_channels', {});
    return Promise.resolve({ channels: [] });
  }
  getChannel(channelId: string, observe?: boolean): Promise<ToolPayload> {
    this.record('get_channel', { channel_id: channelId, observe });
    if (this.observeError) return Promise.reject(this.observeError);
    return Promise.resolve({
      channel: { channel_id: channelId },
      observation: { cursor: 'cursor-1', channel_instance: 'inst-1', model: 'snapshot_change' },
    });
  }
  readChannel(channelId: string): Promise<ToolPayload> {
    this.record('read_channel', { channel_id: channelId });
    const next = this.readQueue.shift() ?? { text: '' };
    return Promise.resolve({
      read: {
        channel_id: channelId,
        captured_at: new Date().toISOString(),
        text: next.text,
        truncated: next.truncated === true,
        line_count: next.text === '' ? 0 : next.text.split('\n').length,
        byte_count: Buffer.byteLength(next.text),
      },
    });
  }
  writeText(): Promise<ToolPayload> {
    this.record('write_text', {});
    return Promise.resolve({});
  }
  sendControl(): Promise<ToolPayload> {
    this.record('send_control', {});
    return Promise.resolve({});
  }
  waitChannelEvent(channelId: string, afterCursor: string): Promise<ToolPayload> {
    this.record('wait_channel_event', { channel_id: channelId, after_cursor: afterCursor });
    const next = this.waitQueue.shift();
    if (next instanceof Error) return Promise.reject(next);
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => {
      // The real server bounds every wait; model it settling as a heartbeat.
      const timer = setTimeout(() => {
        this.waitGate = null;
        resolve({ reason: 'timeout', channel_id: channelId, next_cursor: afterCursor });
      }, 60);
      timer.unref?.();
      this.waitGate = () => {
        clearTimeout(timer);
        resolve({ reason: 'timeout', channel_id: channelId, next_cursor: afterCursor });
      };
    });
  }
  releaseWait(): void {
    const gate = this.waitGate;
    this.waitGate = null;
    if (gate) gate();
  }
  close(): Promise<void> {
    this.releaseWait();
    return Promise.resolve();
  }
}

function makeHub(mcp: ScriptedMcp, bus: ConsoleEventBus): HistoryHub {
  return new HistoryHub({
    mcp,
    events: bus,
    options: { idleMs: 5, timeoutMs: 50, pollMs: 20, tailLines: 200, tailBytes: 64 * 1024 },
  });
}

test('C1: ring never exceeds line/byte ceilings under 10x overflow; drop marker present', () => {
  const ring = new HistoryRing({ maxLines: 100, maxBytes: 8 * 1024 });
  for (let i = 0; i < 1000; i += 1) {
    ring.push({ kind: 'output_block', state: 'closed', text: `line ${i}`, truncated: false, opened_at: 't' });
  }
  const snap = ring.snapshot();
  assert.ok(snap.total_lines <= 100, `lines ${snap.total_lines} exceed ceiling`);
  assert.ok(snap.dropped_entries > 0, 'expected dropped entries');
  assert.equal(snap.entries[0].kind, 'drop_marker', 'leading drop marker must be present');
  if (snap.entries[0].kind === 'drop_marker') {
    assert.ok(snap.entries[0].dropped_lines > 0);
  }

  const byteRing = new HistoryRing({ maxLines: 1_000_000, maxBytes: 256 });
  for (let i = 0; i < 200; i += 1) {
    byteRing.push({ kind: 'user_turn', text: 'x'.repeat(40), submit: true, sent_at: 't', transport_result: 'delivered' });
  }
  const byteSnap = byteRing.snapshot();
  assert.ok(byteSnap.dropped_entries > 0, 'byte ceiling must evict');
  assert.ok(byteSnap.entries[0].kind === 'drop_marker');
});

test('diffTail dedupes overlapping tails and never invents a gap', () => {
  assert.deepEqual(diffTail('a\nb', 'a\nb\nc'), { appended: 'c', overlapped: 2 });
  assert.deepEqual(diffTail('a\nb\nc', 'b\nc\nd'), { appended: 'd', overlapped: 2 });
  assert.deepEqual(diffTail('x', 'x'), { appended: '', overlapped: 1 });
  assert.deepEqual(diffTail('', 'a\nb'), { appended: 'a\nb', overlapped: 0 });
  // Disjoint panes (cleared/replaced): append everything rather than lose lines.
  assert.deepEqual(diffTail('gone', 'fresh'), { appended: 'fresh', overlapped: 0 });
  // Repeated identical lines still dedupe deterministically.
  assert.deepEqual(diffTail('same\nsame', 'same\nsame\nnew'), { appended: 'new', overlapped: 2 });
  // (a) Mutable current/last line: the prompt line is rewritten in place —
  // the stable prefix anchors and only the rewritten line is appended.
  assert.deepEqual(diffTail('out\npro', 'out\nprompt> x'), { appended: 'prompt> x', overlapped: 1 });
  // (b) Bounded tail scrolling: prev's suffix run is next's prefix.
  const prev50 = Array.from({ length: 50 }, (_, i) => `l${i + 1}`).join('\n');
  const next50 = Array.from({ length: 41 }, (_, i) => `l${i + 30}`).join('\n');
  assert.deepEqual(diffTail(prev50, next50), {
    appended: Array.from({ length: 20 }, (_, i) => `l${i + 51}`).join('\n'),
    overlapped: 21,
  });
  // Scroll + last line rewritten in place: prev-minus-last-line anchors.
  assert.deepEqual(diffTail('a\nb\npro', 'b\npro2\nd'), { appended: 'pro2\nd', overlapped: 1 });
  // Exact reviewer regression: the later repeated A/B is real new output and
  // must not become an alignment anchor (interior search would yield 'Y').
  assert.deepEqual(diffTail('A\nB', 'A\nB\nX\nA\nB\nY'), { appended: 'X\nA\nB\nY', overlapped: 2 });
  // Repeated identical lines: alignment must not skip real lines by
  // anchoring a later interior occurrence.
  assert.deepEqual(diffTail('x\ny', 'x\ny\nx\ny\nz'), { appended: 'x\ny\nz', overlapped: 2 });
  assert.deepEqual(diffTail('x\ny\nx\ny', 'x\ny\nx\ny\nz'), { appended: 'z', overlapped: 4 });
  assert.deepEqual(diffTail('x\ny\nx\ny', 'y\nx\ny\nz\nw'), { appended: 'z\nw', overlapped: 3 });
  // Terminal screens carry trailing blanks below the cursor; new output
  // inserts before them — blanks must not anchor or be re-appended.
  assert.deepEqual(diffTail('p\nout1\n\n\n', 'p\nout1\nout2\n\n'), { appended: 'out2', overlapped: 2 });
  assert.deepEqual(diffTail('p\nout1\n\n\n', 'p\nout1\n\n\n'), { appended: '', overlapped: 1 });
  // Insertion before a same-count blank suffix (a top line scrolled out):
  // the inserted line is still detected exactly once.
  assert.deepEqual(diffTail('p\no1\n\n\n', 'o1\nN\n\n\n'), { appended: 'N', overlapped: 1 });
  // Uncertainty surfaces more text, never a claimed gap: a wholly rewritten
  // pane appends the full new tail.
  assert.deepEqual(diffTail('a\nb\nc', 'x\ny\nz'), { appended: 'x\ny\nz', overlapped: 0 });
});

test('C4: prompt-like and role-like strings stay plain output — no turn split', () => {
  const ring = new HistoryRing();
  const tricky = '$ echo hi\n> continuation\nassistant: hello\nuser: ping\nPS1-like> done';
  ring.push({ kind: 'output_block', state: 'open', text: tricky, truncated: false, opened_at: 't' });
  const snap = ring.snapshot();
  assert.equal(snap.entries.length, 1);
  assert.equal(snap.entries[0].kind, 'output_block');
  assert.equal(snap.entries.filter((e) => e.kind === 'user_turn').length, 0, 'output must never become a user turn');
  const raw = formatRawTranscript(snap);
  assert.ok(raw.includes('assistant: hello'));
  assert.ok(raw.includes('user: ping'));
  assert.ok(raw.includes('> continuation'));
  assert.ok(raw.includes('$ echo hi'));
});

test('attach ordering: observation cursor is acquired before the initial read', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'pre-existing output' });
  const detach = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach);

  await waitFor(() => hub.status(CHANNEL).state === 'live');
  const tools = mcp.calls.map((c) => c.tool);
  const observeIndex = tools.indexOf('get_channel');
  const readIndex = tools.indexOf('read_channel');
  assert.ok(observeIndex !== -1 && readIndex !== -1);
  assert.ok(observeIndex < readIndex, 'get_channel(observe:true) must precede the initial read_channel');
  assert.equal(mcp.calls[observeIndex].args.observe, true);

  const snap = hub.snapshot(CHANNEL);
  assert.equal(snap.ring.entries[0].kind, 'earlier_output');
  if (snap.ring.entries[0].kind === 'earlier_output') {
    assert.equal(snap.ring.entries[0].text, 'pre-existing output');
  }
});

test('block rules: output_idle pauses, timeout is not a boundary, next user turn closes', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'base' });
  mcp.waitQueue.push(
    { reason: 'timeout', channel_id: CHANNEL, next_cursor: 'cursor-1' },
    { reason: 'output_idle', channel_id: CHANNEL, next_cursor: 'cursor-2' },
  );
  mcp.readQueue.push({ text: 'base\nfirst output' });
  const detach = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach);

  // Wait for output_idle to be consumed: block appended then paused.
  await waitFor(() => hub.snapshot(CHANNEL).ring.entries.some((e) => e.kind === 'output_block'));
  await waitFor(() => {
    const block = hub.snapshot(CHANNEL).ring.entries.find((e) => e.kind === 'output_block');
    return block?.kind === 'output_block' && block.state === 'paused';
  });

  const block = hub.snapshot(CHANNEL).ring.entries.find((e) => e.kind === 'output_block');
  assert.ok(block && block.kind === 'output_block');
  assert.equal(block.text, 'first output');
  assert.equal(block.state, 'paused', 'output_idle pauses the block');
  assert.ok(mcp.calls.filter((c) => c.tool === 'wait_channel_event').length >= 2);

  // A wait timeout earlier in the sequence did not close the block: the pause
  // only arrived after output_idle. Now the next user turn closes it.
  bus.emit({ type: 'user-turn', channel_id: CHANNEL, text: 'next message', submit: true, sent_at: 't2', transport_result: 'delivered' });
  const entries = hub.snapshot(CHANNEL).ring.entries;
  const closed = entries.find((e) => e.kind === 'output_block');
  assert.ok(closed && closed.kind === 'output_block' && closed.state === 'closed');
  const turn = entries.find((e) => e.kind === 'user_turn');
  assert.ok(turn && turn.kind === 'user_turn' && turn.text === 'next message');
});

test('C6: CURSOR_EXPIRED and OBSERVATION_GAP surface explicit needs_reobserve, no tmux action', async (t) => {
  for (const code of ['CURSOR_EXPIRED', 'OBSERVATION_GAP']) {
    const mcp = new ScriptedMcp();
    const bus = new ConsoleEventBus();
    const hub = makeHub(mcp, bus);
    mcp.readQueue.push({ text: 'x' });
    mcp.waitQueue.push(new McpToolError(code, `${code} happened`));
    const detach = hub.addViewer(CHANNEL, () => undefined);
    await waitFor(() => hub.status(CHANNEL).state === 'needs_reobserve', 3_000);
    assert.equal(hub.status(CHANNEL).detail, code);
    // Console only speaks MCP tools — no tmux/binary side effects exist to assert;
    // the state is explicit and waits for the human's re-observe action.
    detach();
    await hub.close();
  }
});

test('CONSOLE_TAIL_BYTES is capped at the public read bound (1 MiB)', () => {
  const accepted = loadConfig({ CONSOLE_TAIL_BYTES: '1048576' });
  assert.equal(accepted.history.tailBytes, 1_048_576);
  assert.throws(() => loadConfig({ CONSOLE_TAIL_BYTES: '1048577' }), ConfigError);
  assert.throws(() => loadConfig({ CONSOLE_TAIL_BYTES: String(4 * 1024 * 1024) }), ConfigError);
  // The ring total is a separate, larger ceiling.
  const ring = loadConfig({});
  assert.ok(ring.history.maxBytes > ring.history.tailBytes);
});

test('wait timeout with activity_observed refreshes the tail without closing the block', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'base' });
  mcp.waitQueue.push({ reason: 'timeout', channel_id: CHANNEL, next_cursor: 'cursor-1', activity_observed: true });
  mcp.readQueue.push({ text: 'base\nline1' }, { text: 'base\nline1\nline2' });
  const detach = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach);

  await waitFor(() => hub.snapshot(CHANNEL).ring.entries.some((e) => e.kind === 'output_block' && e.text.includes('line1')));
  const block = hub.snapshot(CHANNEL).ring.entries.find((e) => e.kind === 'output_block');
  assert.ok(block && block.kind === 'output_block');
  assert.equal(block.state, 'open', 'a busy timeout refreshes the tail but must not pause or close');

  // The unchanged timeout next_cursor threads through the following wait.
  const waits = mcp.calls.filter((c) => c.tool === 'wait_channel_event');
  assert.ok(waits.length >= 2);
  assert.equal(waits[1].args.after_cursor, 'cursor-1');

  mcp.waitQueue.push({ reason: 'output_idle', channel_id: CHANNEL, next_cursor: 'cursor-2' });
  await waitFor(() => {
    const b = hub.snapshot(CHANNEL).ring.entries.find((e) => e.kind === 'output_block');
    return b?.kind === 'output_block' && b.state === 'paused';
  });
  const settled = hub.snapshot(CHANNEL).ring.entries.find((e) => e.kind === 'output_block');
  assert.ok(settled && settled.kind === 'output_block');
  assert.equal(settled.text, 'line1\nline2', 'a later output_idle dedupes and pauses');
});

test('re-observe uses output/dedupe semantics even when no earlier_output survives in the ring', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());

  // First attach reads an empty tail: no earlier_output entry is ever created.
  mcp.readQueue.push({ text: '' });
  const detach1 = hub.addViewer(CHANNEL, () => undefined);
  await waitFor(() => hub.status(CHANNEL).state === 'live');
  detach1();
  await waitFor(() => hub.status(CHANNEL).state === 'idle', 1_000);
  assert.equal(
    hub.snapshot(CHANNEL).ring.entries.filter((e) => e.kind === 'earlier_output').length,
    0,
    'empty initial tail produces no earlier_output',
  );

  // Re-observe must dedupe into an output block, not mint a second earlier block.
  mcp.readQueue.push({ text: 'output while detached' });
  const detach2 = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach2);
  await waitFor(() => hub.status(CHANNEL).state === 'live');
  const entries = hub.snapshot(CHANNEL).ring.entries;
  assert.equal(entries.filter((e) => e.kind === 'earlier_output').length, 0, 're-observe must not mint earlier_output');
  const block = entries.find((e) => e.kind === 'output_block');
  assert.ok(block && block.kind === 'output_block' && block.text.includes('output while detached'));
});

test('re-observe after ring eviction still uses output/dedupe semantics', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = new HistoryHub({
    mcp,
    events: bus,
    options: { idleMs: 5, timeoutMs: 50, pollMs: 20, tailLines: 200, tailBytes: 64 * 1024, ring: { maxLines: 3, maxBytes: 64 * 1024 } },
  });
  t.after(() => hub.close());

  mcp.readQueue.push({ text: 'old one\nold two\nold three' });
  const detach1 = hub.addViewer(CHANNEL, () => undefined);
  await waitFor(() => hub.status(CHANNEL).state === 'live');
  detach1();
  await waitFor(() => hub.status(CHANNEL).state === 'idle', 1_000);

  // Overflow the tiny ring so the earlier_output entry is evicted.
  bus.emit({ type: 'user-turn', channel_id: CHANNEL, text: 'line-a\nline-b', submit: true, sent_at: 't', transport_result: 'delivered' });
  bus.emit({ type: 'user-turn', channel_id: CHANNEL, text: 'line-c\nline-d', submit: true, sent_at: 't', transport_result: 'delivered' });
  assert.equal(
    hub.snapshot(CHANNEL).ring.entries.filter((e) => e.kind === 'earlier_output').length,
    0,
    'earlier_output must have been evicted by the ring ceiling',
  );

  mcp.readQueue.push({ text: 'old one\nold two\nold three\nnew after reobserve' });
  const detach2 = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach2);
  await waitFor(() => hub.status(CHANNEL).state === 'live');
  const entries = hub.snapshot(CHANNEL).ring.entries;
  assert.equal(entries.filter((e) => e.kind === 'earlier_output').length, 0, 're-observe must not mint earlier_output');
  const block = entries.find((e) => e.kind === 'output_block');
  assert.ok(block && block.kind === 'output_block');
  assert.equal(block.text, 'new after reobserve', 're-observe dedupes against the last read');
});

test('C5: last viewer leaving stops the loop within one wait timeout', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'x' });
  const detach = hub.addViewer(CHANNEL, () => undefined);
  await waitFor(() => hub.status(CHANNEL).state === 'live');

  const waitsBefore = mcp.calls.filter((c) => c.tool === 'wait_channel_event').length;
  detach();
  // The in-flight wait settles within its bounded wait; the count must not
  // increase — no new wait may start after the last viewer detached.
  await waitFor(() => hub.status(CHANNEL).state === 'idle', 1_000);
  const settled = mcp.calls.filter((c) => c.tool === 'wait_channel_event').length;
  assert.equal(settled, waitsBefore, 'wait-call count must not increase after the last viewer left');
});

test('reattach while a bounded wait is still in flight re-arms observation (no stranded viewer, no duplicate loop)', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());

  mcp.readQueue.push({ text: 'first' });
  const detach1 = hub.addViewer(CHANNEL, () => undefined);
  await waitFor(() => hub.status(CHANNEL).state === 'live');
  // waitQueue is empty: the loop is now parked inside one gated bounded wait.
  const waitsBefore = mcp.calls.filter((c) => c.tool === 'wait_channel_event').length;

  // Last viewer detaches while that wait is in flight, then a new viewer
  // reattaches before the wait settles — the race window.
  detach1();
  // One entry id may legitimately appear in both `appended` and `updated` of
  // the same delta (new block then paused); distinct ids prove no duplicate
  // event/output delivery to the reattached viewer.
  const burstEntryIds = new Set<number>();
  const detach2 = hub.addViewer(CHANNEL, (update) => {
    for (const entry of [...(update.appended ?? []), ...(update.updated ?? [])]) {
      if (entry.kind === 'output_block' && entry.text.includes('second burst')) burstEntryIds.add(entry.id);
    }
  });
  t.after(detach2);

  // Reattach must not spawn a second observation loop: still exactly one
  // get_channel(observe:true) and no extra wait_channel_event yet.
  assert.equal(mcp.calls.filter((c) => c.tool === 'get_channel').length, 1, 'reattach must not re-observe / spawn a second loop');
  assert.equal(
    mcp.calls.filter((c) => c.tool === 'wait_channel_event').length,
    waitsBefore,
    'reattach must not stack an extra concurrent waiter',
  );

  // Now the old wait settles (heartbeat) and later output arrives.
  mcp.readQueue.push({ text: 'first\nsecond burst' });
  mcp.waitQueue.push({ reason: 'output_idle', channel_id: CHANNEL, next_cursor: 'c2' });
  mcp.releaseWait();

  await waitFor(() => {
    const entries = hub.snapshot(CHANNEL).ring.entries;
    return entries.some((e) => e.kind === 'output_block' && e.text.includes('second burst'));
  });
  assert.equal(hub.status(CHANNEL).state, 'live');
  assert.equal(burstEntryIds.size, 1, 'the reattached viewer must receive the output exactly once');
  assert.equal(mcp.calls.filter((c) => c.tool === 'get_channel').length, 1, 'no duplicate observer loop was spawned');
});

test('control sends record but do not close the output block', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'x' });
  mcp.waitQueue.push({ reason: 'output_idle', channel_id: CHANNEL, next_cursor: 'c2' });
  mcp.readQueue.push({ text: 'x\nout' });
  const detach = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach);
  await waitFor(() => {
    const b = hub.snapshot(CHANNEL).ring.entries.find((e) => e.kind === 'output_block');
    return b?.kind === 'output_block' && b.state === 'paused';
  });
  bus.emit({ type: 'control', channel_id: CHANNEL, control: 'ESCAPE', sent_at: 't', transport_result: 'delivered' });
  const entries = hub.snapshot(CHANNEL).ring.entries;
  const control = entries.find((e) => e.kind === 'control');
  assert.ok(control && control.kind === 'control' && control.control === 'ESCAPE');
  const block = entries.find((e) => e.kind === 'output_block');
  assert.ok(block && block.kind === 'output_block' && block.state === 'paused', 'control must not close the block');
});

interface SseCtx {
  server: Server;
  port: number;
  authority: string;
}

async function startSseServer(mcp: ScriptedMcp, hub: HistoryHub): Promise<SseCtx> {
  const bus = new ConsoleEventBus();
  const logger = createLogger(() => undefined);
  const ctx: SseCtx = { server: null as unknown as Server, port: 0, authority: '' };
  const server = createServer((req, res) => {
    void createRequestHandler({ mcp, events: bus, history: hub, expectedHost: ctx.authority, publicDir, logger })(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  ctx.server = server;
  ctx.port = address.port;
  ctx.authority = expectedAuthority('127.0.0.1', ctx.port);
  return ctx;
}

function rawGet(ctx: SseCtx, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: ctx.port, path, method: 'GET', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function openSse(ctx: SseCtx, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; chunks: string[]; close: () => void }>((resolve, reject) => {
    const chunks: string[] = [];
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: ctx.port,
        path,
        method: 'GET',
        headers: { host: ctx.authority, ...headers },
      },
      (res) => {
        res.on('data', (c) => {
          chunks.push(c.toString('utf8'));
          resolve({ status: res.statusCode ?? 0, chunks, close: () => req.destroy() });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('C8: SSE history stream rejects mismatched Origin/Host; authority checks unchanged', async (t) => {
  const mcp = new ScriptedMcp();
  const hub = makeHub(mcp, new ConsoleEventBus());
  const ctx = await startSseServer(mcp, hub);
  t.after(() => ctx.server.close());
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'hello' });

  const badHost = await rawGet(ctx, `/api/channels/${CHANNEL}/events`, { host: 'evil.example' });
  assert.equal(badHost.status, 403);
  const badOrigin = await rawGet(ctx, `/api/channels/${CHANNEL}/events`, {
    host: ctx.authority,
    origin: 'http://evil.example',
  });
  assert.equal(badOrigin.status, 403);

  const sse = await openSse(ctx, `/api/channels/${CHANNEL}/events`);
  assert.equal(sse.status, 200);
  await waitFor(() => sse.chunks.join('').includes('event: snapshot'));
  sse.close();
});

test('bounded-mirror: an evicting delta carries one authoritative snapshot; later deltas stay incremental', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = new HistoryHub({
    mcp,
    events: bus,
    options: { idleMs: 5, timeoutMs: 50, pollMs: 20, tailLines: 200, tailBytes: 64 * 1024, ring: { maxLines: 4, maxBytes: 64 * 1024 } },
  });
  t.after(() => hub.close());
  mcp.readQueue.push({ text: '' });
  const updates: HubUpdate[] = [];
  const detach = hub.addViewer(CHANNEL, (u) => updates.push(u));
  t.after(detach);
  await waitFor(() => hub.status(CHANNEL).state === 'live');

  const emit = (text: string) =>
    bus.emit({ type: 'user-turn', channel_id: CHANNEL, text, submit: true, sent_at: 't', transport_result: 'delivered' });
  emit('a\nb'); // 2 lines
  emit('c\nd'); // 4 lines — at ceiling
  emit('e\nf'); // overflows: the oldest turn is evicted
  bus.emit({ type: 'control', channel_id: CHANNEL, control: 'ENTER', sent_at: 't', transport_result: 'delivered' }); // non-evicting

  const firstTurn = updates.flatMap((u) => u.appended ?? []).find((e) => e.kind === 'user_turn');
  assert.ok(firstTurn, 'expected the evicted turn to have been appended first');
  const deltas = updates.filter((u) => u.type === 'delta');
  const resyncs = deltas.filter((u) => u.snapshot !== undefined);
  assert.equal(resyncs.length, 1, 'exactly one delta carries the authoritative snapshot');
  assert.ok(
    resyncs[0].snapshot?.entries.every((e) => e.id !== firstTurn.id),
    'the authoritative snapshot must no longer contain the evicted entry',
  );
  const after = deltas.slice(deltas.indexOf(resyncs[0]) + 1);
  assert.ok(after.length > 0, 'expected a subsequent non-evicting delta');
  assert.ok(
    after.every((u) => u.snapshot === undefined),
    'a subsequent non-evicting delta must not resend a full snapshot',
  );
});

test('bounded-mirror: eviction while unobserved is covered by the attach snapshot; later deltas stay incremental', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = new HistoryHub({
    mcp,
    events: bus,
    options: { idleMs: 5, timeoutMs: 50, pollMs: 20, tailLines: 200, tailBytes: 64 * 1024, ring: { maxLines: 4, maxBytes: 64 * 1024 } },
  });
  t.after(() => hub.close());

  // Overflow the ring with NO viewer attached — bus events still mutate it.
  const emit = (text: string) =>
    bus.emit({ type: 'user-turn', channel_id: CHANNEL, text, submit: true, sent_at: 't', transport_result: 'delivered' });
  emit('a\nb');
  emit('c\nd');
  emit('e\nf'); // evicts the oldest turn while unobserved

  mcp.readQueue.push({ text: '' });
  const updates: HubUpdate[] = [];
  const detach = hub.addViewer(CHANNEL, (u) => updates.push(u));
  t.after(detach);
  await waitFor(() => hub.status(CHANNEL).state === 'live');

  const initial = updates[0];
  assert.equal(initial.type, 'snapshot');
  assert.ok((initial.snapshot?.dropped_entries ?? 0) > 0, 'the initial snapshot must already reflect the unobserved eviction');

  // A subsequent non-evicting mutation must not emit a stale resync snapshot.
  bus.emit({ type: 'control', channel_id: CHANNEL, control: 'ENTER', sent_at: 't', transport_result: 'delivered' });
  const deltas = updates.filter((u) => u.type === 'delta');
  assert.ok(deltas.length > 0, 'expected post-attach deltas');
  assert.ok(
    deltas.every((u) => u.snapshot === undefined),
    'no delta after attach may carry a resync snapshot for the unobserved eviction',
  );
});

test('served app.js replaces the browser mirror when a delta carries an authoritative snapshot', async (t) => {
  const ctx = await startSseServer(new ScriptedMcp(), new HistoryHub({ mcp: new ScriptedMcp(), events: new ConsoleEventBus() }));
  t.after(() => ctx.server.close());
  const res = await rawGet(ctx, '/app.js', { host: ctx.authority });
  assert.equal(res.status, 200);
  assert.match(res.body, /if \(update\.snapshot\)/, 'applyDelta must detect an authoritative snapshot delta');
  assert.match(res.body, /applySnapshot\(update\);\s*\n\s*return;/, 'applyDelta must replace the mirror and stop incremental handling');
  assert.match(res.body, /bookmarks\.delete\(id\)/, 'evicted entries must be pruned from bookmarks');
  assert.match(res.body, /if \(prunedBookmarks\) saveBookmarks\(\);/, 'pruned bookmarks must persist via the per-channel localStorage helper');
});

test('SSE viewer stays attached while the response is open and detaches exactly once', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const detachEvents: string[] = [];
  const hub = new HistoryHub({
    mcp,
    events: bus,
    logger: (event) => {
      if (event === 'observe_viewer_detached') detachEvents.push(event);
    },
    options: { idleMs: 5, timeoutMs: 50, pollMs: 20, tailLines: 200, tailBytes: 64 * 1024 },
  });
  const ctx = await startSseServer(mcp, hub);
  t.after(() => ctx.server.close());
  t.after(() => hub.close());
  mcp.readQueue.push({ text: 'hi' });

  const sse = await openSse(ctx, `/api/channels/${CHANNEL}/events`);
  assert.equal(sse.status, 200);
  await waitFor(() => hub.status(CHANNEL).state === 'live');

  // A GET request body completes instantly; the viewer must remain attached
  // for as long as the SSE response/socket stays open — never on request end.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(hub.status(CHANNEL).viewers, 1, 'viewer must remain attached while the SSE response is open');
  assert.equal(hub.status(CHANNEL).state, 'live');
  assert.equal(detachEvents.length, 0);

  sse.close();
  await waitFor(() => hub.status(CHANNEL).viewers === 0, 1_000);
  await waitFor(() => hub.status(CHANNEL).state === 'idle', 1_000);
  assert.equal(detachEvents.length, 1, 'exactly one detach on response close');

  sse.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(detachEvents.length, 1, 'cleanup is idempotent — no second detach');
  assert.equal(hub.status(CHANNEL).viewers, 0);
});

test('history snapshot + raw transcript endpoints serve the same ring', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = makeHub(mcp, bus);
  const ctx = await startSseServer(mcp, hub);
  t.after(() => ctx.server.close());
  t.after(() => hub.close());

  // Seed the ring via the bus (no viewer needed).
  bus.emit({ type: 'user-turn', channel_id: CHANNEL, text: 'hello agent', submit: true, sent_at: 't1', transport_result: 'delivered' });

  const snap = await rawGet(ctx, `/api/channels/${CHANNEL}/history`, { host: ctx.authority });
  assert.equal(snap.status, 200);
  const parsed = JSON.parse(snap.body);
  assert.equal(parsed.channel_id, CHANNEL);
  const turn = parsed.ring.entries.find((e: HistoryEntry) => e.kind === 'user_turn');
  assert.ok(turn && turn.text === 'hello agent');

  const raw = await rawGet(ctx, `/api/channels/${CHANNEL}/history?format=raw`, { host: ctx.authority });
  assert.equal(raw.status, 200);
  assert.ok(raw.body.includes('hello agent'), 'raw transcript must contain the same ring content');
});
