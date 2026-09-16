/**
 * Issue #125 — Devin TUI adapter over REAL recorded fixtures.
 *
 * Every fixture sample is replayed through the same path the observer uses:
 *   fixture JSONL -> diffTail -> HistoryRing output_block -> projectConversation
 *   -> turn output text -> devinAdapter.parse
 *
 * The parser itself is pure (no DOM/IO/Hub); IO happens only here, in the
 * test harness, to load the recorded JSONL.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { devinAdapter, devinSettleHint, parseDevinTurn } from '../src/devin-adapter.js';
import { diffTail, HistoryRing } from '../src/history.js';
import type { Segment } from '../src/adapter.js';
import { projectConversation } from '../src/projection.js';

const FIXTURE_DIR = new URL('../../../tests/fixtures/devin-tui/', import.meta.url);

interface Sample { t: number; text: string }

function loadFixture(name: string): Sample[] {
  const out: Sample[] = [];
  for (const line of readFileSync(new URL(name, FIXTURE_DIR), 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const rec = JSON.parse(line);
    if (rec.meta) continue; // provenance record, not a sample
    out.push(rec as Sample);
  }
  assert.ok(out.length > 0, `fixture ${name} has no samples`);
  return out;
}

/**
 * Replay samples exactly like HistoryHub.pull(mode:'output'): diffTail dedupe
 * against the last read, appended into one open output_block in the ring.
 * A synthetic user_turn opens the turn first — the same shape the Console
 * produces live.
 */
function replayTurn(samples: Sample[]): { turnText: string; ring: HistoryRing } {
  const ring = new HistoryRing({ maxLines: 500_000, maxBytes: 64 * 1024 * 1024 });
  ring.push({ kind: 'user_turn', text: '<prompt>', submit: true, sent_at: 't', transport_result: 'delivered' });
  let lastRead = '';
  let blockId: number | null = null;
  for (const s of samples) {
    const diff = diffTail(lastRead, s.text);
    lastRead = s.text;
    if (diff.appended === '') continue;
    if (blockId !== null) {
      ring.update(blockId, (entry) => {
        if (entry.kind === 'output_block') entry.text = entry.text === '' ? diff.appended : `${entry.text}\n${diff.appended}`;
      });
    } else {
      blockId = ring.push({ kind: 'output_block', state: 'open', text: diff.appended, truncated: false, opened_at: 't' }).id;
    }
  }
  const turns = projectConversation(ring.snapshot().entries);
  const turn = turns[turns.length - 1];
  assert.ok(turn && turn.blocks.length > 0, 'replay produced no output block');
  return { turnText: turn.blocks.map((b) => b.text).join('\n'), ring };
}

const kinds = (segs: Segment[] | null) => (segs ?? []).map((s) => s.type);

// ---- Real fixtures: complete multi-tool turn ----

test('devin-adapter: multitool fixture replays into tool+truncated+chrome segments', () => {
  const { turnText } = replayTurn(loadFixture('devin-multitool-turn.jsonl'));
  const segs = parseDevinTurn(turnText);
  assert.ok(segs !== null, 'real Devin turn must parse');
  const k = kinds(segs);
  assert.ok(k.includes('tool'), 'tool segments present');
  assert.ok(k.includes('truncated'), 'truncated segment present');
  assert.ok(k.includes('chrome'), 'chrome segments present');
  assert.ok(k.includes('text'), 'text segments present');

  const tools = segs.filter((s): s is Extract<Segment, { type: 'tool' }> => s.type === 'tool');
  assert.ok(tools.some((t) => t.status?.includes('Exited with code')), 'closed tool carries └ status');
  // verbatim preservation: a real command line survives inside a tool body
  assert.ok(tools.some((t) => /\$ \S/.test(t.body)), 'tool body preserves verbatim command text');
});

test('devin-adapter: multitool fixture is deterministic and idempotent', () => {
  const { turnText } = replayTurn(loadFixture('devin-multitool-turn.jsonl'));
  assert.deepEqual(parseDevinTurn(turnText), parseDevinTurn(turnText));
});

// ---- Real fixture: interrupted turn stays open/unsettled ----

test('devin-adapter: interrupted fixture — open tool row, cancel marker preserved', () => {
  const samples = loadFixture('devin-interrupted.jsonl');
  // mid-run sample: the `○` tool row has no `└` yet -> open:true, no status
  const mid = samples.find((s) => s.text.includes('○ ') && !s.text.includes('Canceled'));
  assert.ok(mid, 'fixture contains a mid-run sample');
  const midSegs = parseDevinTurn(mid.text);
  assert.ok(midSegs !== null);
  const openTool = midSegs.find((s): s is Extract<Segment, { type: 'tool' }> => s.type === 'tool' && s.open);
  assert.ok(openTool, 'unterminated ⏺/○ block stays open — no fabricated closure');
  assert.equal(openTool.status, undefined);

  const { turnText } = replayTurn(samples);
  const segs = parseDevinTurn(turnText);
  assert.ok(segs !== null);
  const text = segs.filter((s): s is Extract<Segment, { type: 'text' }> => s.type === 'text').map((s) => s.text).join('\n');
  assert.ok(text.includes('Canceled'), '✱ interrupt evidence preserved verbatim, never dropped');
});

// ---- Real fixture: idle prompt + truncation ----

test('devin-adapter: idle fixture — truncation surfaces, settleHint idle', () => {
  const samples = loadFixture('devin-idle-truncated.jsonl');
  const last = samples[samples.length - 1].text;
  assert.equal(devinSettleHint(last), 'idle');
  const segs = parseDevinTurn(last);
  assert.ok(segs !== null);
  const truncs = segs.filter((s): s is Extract<Segment, { type: 'truncated' }> => s.type === 'truncated');
  assert.ok(truncs.length > 0 && truncs.every((t) => t.lines > 0), 'folded content -> truncated segment, never recovered');
});

// ---- Real fixture: plain bash fails open ----

test('devin-adapter: bash fixture — parse null, settleHint unknown (fail-open)', () => {
  for (const s of loadFixture('bash-null.jsonl')) {
    assert.equal(parseDevinTurn(s.text), null, 'zero Devin anchors -> null');
    assert.equal(devinSettleHint(s.text), 'unknown');
  }
});

// ---- settleHint grammar ----

test('devin-adapter: settleHint — Ask idle, Guide busy, spinner busy, other unknown', () => {
  assert.equal(devinSettleHint('noise\n❭ Ask Devin to build features'), 'idle');
  assert.equal(devinSettleHint('❭ Guide Devin while it works'), 'busy');
  assert.equal(devinSettleHint('⠐⠒ Running tools · 12s (esc twice to interrupt)'), 'busy');
  assert.equal(devinSettleHint('$ echo hello\nhello'), 'unknown');
  // last relevant marker wins: idle prompt after spinner -> idle
  assert.equal(devinSettleHint('⠙ Running tools\n❭ Ask Devin to build features'), 'idle');
});

// ---- chrome merging ----

test('devin-adapter: consecutive duplicate chrome lines merge', () => {
  const segs = parseDevinTurn('⏺ Ran command\n └ Exited with code 0\n\n────────────\n────────────\n────────────\n❭ Ask Devin to build features\nSWE-2 High   Context: 10k / 262k tokens\nSWE-2 High   Context: 10k / 262k tokens');
  assert.ok(segs !== null);
  const chrome = segs.filter((s) => s.type === 'chrome');
  assert.equal(chrome.filter((s) => s.type === 'chrome' && s.kind === 'sep').length, 1, 'separator run merges to one');
  assert.equal(chrome.filter((s) => s.type === 'chrome' && s.kind === 'status').length, 1, 'status run merges to one');
});

// ---- C4 adversarial: never throws, fails open ----

test('devin-adapter: adversarial inputs never throw and fail open', () => {
  const cases: (string | null | undefined)[] = [
    '',
    '⏺',
    '⏺ ',
    '└ orphan closer',
    '│ orphan body',
    '⏺ Started\n⏺ Started again\nno enders',
    '─────\n❭ partial',
    'plain terminal text\n$ ls -la\nfile1 file2',
    '❭ Ask Devin\x00\x1b[31m',
    '⏺ t\n│' + 'x'.repeat(200_000),
  ];
  for (const c of cases) {
    assert.doesNotThrow(() => parseDevinTurn(c as unknown as string));
    assert.doesNotThrow(() => devinSettleHint(c as unknown as string));
    assert.doesNotThrow(() => devinAdapter.parse(c as unknown as string));
  }
  assert.equal(parseDevinTurn('plain terminal text\n$ ls -la\nfile1 file2'), null);
  assert.equal(parseDevinTurn(''), null);
});

test('devin-adapter: parser does not mutate source text and output is data only', () => {
  const src = '⏺ Ran command\n │ $ true\n └ Exited with code 0';
  const snapshot = src.slice();
  const segs = parseDevinTurn(src);
  assert.equal(src, snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(segs)), segs, 'segments are plain data');
});
