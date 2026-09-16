import assert from 'node:assert/strict';
import { test } from 'node:test';
import { genericAdapter } from '../src/adapter.js';
import { ConsoleEventBus } from '../src/events.js';
import type { ControlEntry, EarlierOutputEntry, HistoryEntry, OutputBlockEntry, UserTurnEntry } from '../src/history.js';
import type { ConsoleMcp, ToolPayload } from '../src/mcp-client.js';
import { HistoryHub } from '../src/observer.js';
import { projectConversation } from '../src/projection.js';

const CHANNEL = 'tmux:abcdef123456:0';

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail('condition not met within timeout');
}

let seq = 0;
function nid<E extends { id: number }>(e: E): E {
  e.id = ++seq;
  return e;
}
function ut(text: string): UserTurnEntry {
  return { id: 0, kind: 'user_turn', text, submit: true, sent_at: 't', transport_result: 'delivered' };
}
function ob(state: 'open' | 'paused' | 'closed', text: string): OutputBlockEntry {
  return { id: 0, kind: 'output_block', state, text, truncated: false, opened_at: 't' };
}
function eo(text: string): EarlierOutputEntry {
  return { id: 0, kind: 'earlier_output', text, truncated: false, observed_at: 't' };
}
function ctl(control: string): ControlEntry {
  return { id: 0, kind: 'control', control, sent_at: 't', transport_result: 'delivered' };
}

// ---- C1: deterministic Turn[] derivation ----

test('projection: earlier output before the first user_turn forms one synthetic settled turn', () => {
  seq = 0;
  const entries: HistoryEntry[] = [
    nid(eo('boot\nbanner')),
    nid(ut('first')),
    nid(ob('paused', 'answer one')),
  ];
  const turns = projectConversation(entries);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].id, 0);
  assert.equal(turns[0].earlier?.text, 'boot\nbanner');
  assert.equal(turns[0].settled, true);
  assert.equal(turns[1].user?.text, 'first');
  assert.equal(turns[1].settled, true);
});

test('projection: multi-turn attribution, controls stay inside their turn, open block = not settled', () => {
  seq = 0;
  const entries: HistoryEntry[] = [
    nid(ut('one')),
    nid(ob('closed', 'out1')),
    nid(ctl('C-c')),
    nid(ut('two')),
    nid(ob('open', 'partial')),
    nid(ob('paused', 'done')),
  ];
  const turns = projectConversation(entries);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].blocks.length, 1);
  assert.equal(turns[0].controls.length, 1);
  assert.equal(turns[0].settled, true); // closed block
  assert.equal(turns[1].blocks.length, 2);
  assert.equal(turns[1].settled, false); // one block still open
});

test('projection: next user_turn closes the open block — turn settles', () => {
  seq = 0;
  const open = nid(ob('open', 'streaming'));
  const entries: HistoryEntry[] = [nid(ut('q1')), open];
  let turns = projectConversation(entries);
  assert.equal(turns[0].settled, false);
  // the Console's own next send is the boundary: block flips to closed
  open.kind === 'output_block' && (open.state = 'closed');
  entries.push(nid(ut('q2')));
  turns = projectConversation(entries);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].settled, true);
  assert.equal(turns[1].settled, false); // no output yet
});

test('projection: output never read for boundaries — identical text yields identical turns', () => {
  seq = 0;
  const mk = (texts: string[]): HistoryEntry[] => {
    seq = 0;
    return [nid(ut('q')), nid(ob('paused', texts[0])), nid(ob('paused', texts[1]))];
  };
  const a = projectConversation(mk(['anything', 'whatever ⏺ ❭ │ format']));
  const b = projectConversation(mk(['different', 'content entirely']));
  assert.deepEqual(
    a.map((t) => ({ id: t.id, blocks: t.blocks.length, settled: t.settled })),
    b.map((t) => ({ id: t.id, blocks: t.blocks.length, settled: t.settled })),
  );
});

test('projection: drop_marker carries no turn semantics', () => {
  seq = 0;
  const entries: HistoryEntry[] = [
    { id: -1, kind: 'drop_marker', dropped_entries: 3, dropped_lines: 30 },
    nid(ut('q')),
    nid(ob('closed', 'a')),
  ];
  const turns = projectConversation(entries);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].settled, true);
});

// ---- C2: generic adapter contract ----

test('generic adapter is the identity adapter and never throws', () => {
  assert.equal(genericAdapter.id, 'generic');
  assert.equal(genericAdapter.parse('anything ⏺ ❭ │'), null);
  assert.equal(genericAdapter.parse(''), null);
  assert.equal(genericAdapter.settleHint('❭ whatever'), 'unknown');
  assert.equal(genericAdapter.settleHint(''), 'unknown');
});

// ---- C3/C4: busy/quiet cadence in HistoryHub.runLoop ----

class ScriptedMcp implements ConsoleMcp {
  calls: { tool: string; args: Record<string, unknown> }[] = [];
  readQueue: { text: string; truncated?: boolean }[] = [];
  private waitGate: ((payload: ToolPayload) => void) | null = null;

  private record(tool: string, args: Record<string, unknown>): void {
    this.calls.push({ tool, args });
  }
  health(): Promise<ToolPayload> {
    return Promise.resolve({ health: { available: true } });
  }
  listChannels(): Promise<ToolPayload> {
    return Promise.resolve({ channels: [] });
  }
  getChannel(channelId: string, observe?: boolean): Promise<ToolPayload> {
    this.record('get_channel', { channel_id: channelId, observe });
    return Promise.resolve({
      channel: { channel_id: channelId },
      observation: { cursor: 'c0', channel_instance: 'i1', model: 'snapshot_change' },
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
    return Promise.resolve({});
  }
  sendControl(): Promise<ToolPayload> {
    return Promise.resolve({});
  }
  waitChannelEvent(channelId: string, afterCursor: string, options?: { idle_ms?: number; timeout_ms?: number }): Promise<ToolPayload> {
    this.record('wait_channel_event', { channel_id: channelId, after_cursor: afterCursor, ...options });
    return new Promise((resolve) => {
      this.waitGate = resolve;
    });
  }
  releaseWait(payload: ToolPayload): void {
    const gate = this.waitGate;
    this.waitGate = null;
    if (gate) gate(payload);
  }
  close(): Promise<void> {
    return Promise.resolve();
  }

  waits(): Record<string, unknown>[] {
    return this.calls.filter((c) => c.tool === 'wait_channel_event').map((c) => c.args);
  }
  reads(): number {
    return this.calls.filter((c) => c.tool === 'read_channel').length;
  }
}

test('runLoop: busy cadence when a block is open / activity observed; quiet heartbeat otherwise', async (t) => {
  const mcp = new ScriptedMcp();
  const bus = new ConsoleEventBus();
  const hub = new HistoryHub({
    mcp,
    events: bus,
    options: { idleMs: 50, timeoutMs: 5_000, busyTimeoutMs: 600, pollMs: 100, tailLines: 200, tailBytes: 64 * 1024 },
  });
  t.after(() => hub.close());

  mcp.readQueue.push({ text: 'seed' });
  const detach = hub.addViewer(CHANNEL, () => undefined);
  t.after(detach);
  await waitFor(() => hub.status(CHANNEL).state === 'live');

  // Quiet attach: no open block, no prior activity -> heartbeat timeout.
  await waitFor(() => mcp.waits().length === 1);
  assert.equal(mcp.waits()[0].timeout_ms, 5_000, 'first wait must use the quiet heartbeat');

  // Activity observed on a timeout -> pull tail into an open block -> busy.
  mcp.readQueue.push({ text: 'seed\nburst one' });
  mcp.releaseWait({ reason: 'timeout', activity_observed: true, next_cursor: 'c1' });
  await waitFor(() => mcp.waits().length === 2);
  assert.equal(mcp.waits()[1].timeout_ms, 600, 'open block after activity must use the busy timeout');
  assert.equal(mcp.reads(), 2, 'activity_observed must trigger a pull');

  // output_idle -> pull + block paused -> quiet again.
  mcp.readQueue.push({ text: 'seed\nburst one\nsettled' });
  mcp.releaseWait({ reason: 'output_idle', next_cursor: 'c2' });
  await waitFor(() => mcp.waits().length === 3);
  assert.equal(mcp.waits()[2].timeout_ms, 5_000, 'after output_idle the loop returns to the quiet heartbeat');
  assert.equal(mcp.reads(), 3);

  // C4 regression: paused block -> projection reports settled; ring state unchanged.
  const snap = hub.snapshot(CHANNEL);
  const turns = projectConversation(snap.ring.entries);
  const outTurn = turns.find((tu) => tu.blocks.length > 0);
  assert.ok(outTurn);
  assert.equal(outTurn.blocks[0].state, 'paused', 'output_idle still pauses the block');
  assert.equal(outTurn.settled, true);

  // A user_turn during quiet -> block closed at the next send boundary.
  bus.emit({ type: 'user-turn', channel_id: CHANNEL, text: 'next', submit: true, sent_at: new Date().toISOString(), transport_result: 'delivered' });
  const turns2 = projectConversation(hub.snapshot(CHANNEL).ring.entries);
  assert.equal(turns2.length >= 2, true);
  assert.equal(turns2[turns2.length - 2].blocks[0]?.state, 'closed');
});
