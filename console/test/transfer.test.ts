import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

// Pure context-transfer logic (Issue #84) lives in console/public/transfer.js
// as a browser ES module; unit coverage loads it directly and never touches
// the network, MCP, or any Channel.

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const transfer = await import(pathToFileURL(join(publicDir, 'transfer.js')).href);

const SRC = 'tmux:sock:1';
const DST = 'tmux:sock:2';
const channels = [
  { channel_id: SRC, backend_metadata: { tmux: { session_name: 'src-session' } } },
  { channel_id: DST, backend_metadata: { tmux: { session_name: 'dst-session' } } },
];

test('payload preserves the selected text byte-for-byte and labels provenance', () => {
  const text = 'line one\n带 unicode 的 line two $()`\nline three';
  const payload = transfer.buildTransferPayload({ sourceLabel: 'src-session', sourceChannelId: SRC, text });
  assert.ok(payload.endsWith(`\n${text}`));
  assert.ok(payload.startsWith('[context transferred from "src-session"'));
  assert.ok(payload.includes(`(${SRC})`));
  // exactly one header line precedes the verbatim selection
  assert.equal(payload.indexOf('\n'), payload.length - text.length - 1);
});

test('payload is deterministic for the same input', () => {
  const a = transfer.buildTransferPayload({ sourceLabel: 's', sourceChannelId: SRC, text: 'x' });
  const b = transfer.buildTransferPayload({ sourceLabel: 's', sourceChannelId: SRC, text: 'x' });
  assert.equal(a, b);
});

test('validateTransfer accepts a visible, distinct target within the bound', () => {
  const res = transfer.validateTransfer({ text: 'hello', targetChannelId: DST, sourceChannelId: SRC, channels });
  assert.equal(res.ok, true);
  assert.equal(res.bytes, 5);
});

test('validateTransfer rejects empty selection', () => {
  assert.equal(transfer.validateTransfer({ text: '', targetChannelId: DST, sourceChannelId: SRC, channels }).code, 'empty');
});

test('validateTransfer rejects oversize payload before any send (no truncation)', () => {
  const big = 'x'.repeat(transfer.TRANSFER_MAX_BYTES + 1);
  const res = transfer.validateTransfer({ text: big, targetChannelId: DST, sourceChannelId: SRC, channels });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'oversize');
  assert.ok(res.message.includes(String(transfer.TRANSFER_MAX_BYTES)));
  // boundary: exactly at the limit is allowed
  const atLimit = transfer.validateTransfer({ text: 'x'.repeat(transfer.TRANSFER_MAX_BYTES), targetChannelId: DST, sourceChannelId: SRC, channels });
  assert.equal(atLimit.ok, true);
});

test('validateTransfer counts UTF-8 bytes not characters', () => {
  // 4-byte emoji: 1 char, 4 bytes
  const res = transfer.validateTransfer({ text: '😀'.repeat(10), targetChannelId: DST, sourceChannelId: SRC, channels });
  assert.equal(res.ok, true);
  assert.equal(res.bytes, 40);
});

test('validateTransfer rejects missing target', () => {
  assert.equal(transfer.validateTransfer({ text: 'x', targetChannelId: '', sourceChannelId: SRC, channels }).code, 'no-target');
});

test('validateTransfer rejects the source channel as its own target', () => {
  assert.equal(transfer.validateTransfer({ text: 'x', targetChannelId: SRC, sourceChannelId: SRC, channels }).code, 'same-source');
});

test('validateTransfer rejects a target absent from the current visible list', () => {
  const res = transfer.validateTransfer({ text: 'x', targetChannelId: 'tmux:sock:gone', sourceChannelId: SRC, channels });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'target-not-visible');
});

test('validateTransfer rejects vanished target when channel list is empty', () => {
  const res = transfer.validateTransfer({ text: 'x', targetChannelId: DST, sourceChannelId: SRC, channels: [] });
  assert.equal(res.code, 'target-not-visible');
});

test('utf8Bytes matches TextEncoder semantics', () => {
  assert.equal(transfer.utf8Bytes('abc'), 3);
  assert.equal(transfer.utf8Bytes('中文'), 6);
});
