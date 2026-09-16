#!/usr/bin/env node
/**
 * Pane-tail recorder (Issue #125, design §7).
 *
 * Samples a live tmux pane tail into JSONL — one line per sample:
 *   {"t": <unix ms>, "text": "<pane tail, JSON-escaped>"}
 *
 * Mechanical sampling only: `tmux capture-pane -p -J` (joined wrapped
 * lines), bounded window, fixed cadence. No parsing, no filtering —
 * fixtures record exactly what the pane showed.
 *
 * Usage:
 *   node tests/fixtures/record-pane-tail.mjs <tmux-target> <out.jsonl>
 *       [--lines 400] [--interval 500] [--duration 60]
 */
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';

const args = process.argv.slice(2);
const target = args[0];
const out = args[1];
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const lines = opt('--lines', 400);
const intervalMs = opt('--interval', 500);
const durationS = opt('--duration', 60);

if (!target || !out) {
  console.error('usage: record-pane-tail.mjs <tmux-target> <out.jsonl> [--lines 400] [--interval 500] [--duration 60]');
  process.exit(2);
}

const stream = createWriteStream(out, { flags: 'a' });
const deadline = Date.now() + durationS * 1000;
let alive = true;
process.on('SIGINT', () => { alive = false; });

function capture() {
  return new Promise((resolve) => {
    execFile(
      'tmux',
      ['capture-pane', '-p', '-J', '-t', target, '-S', `-${lines}`],
      { maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err ? null : stdout.replace(/\n+$/, '')),
    );
  });
}

let last = null;
while (alive && Date.now() < deadline) {
  const text = await capture();
  if (text !== null && text !== last) {
    stream.write(JSON.stringify({ t: Date.now(), text }) + '\n');
    last = text;
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}
stream.end();
