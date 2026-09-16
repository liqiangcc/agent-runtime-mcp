/**
 * Devin TUI adapter — pure parse (Issue #125, design §3/S4, §5).
 *
 * Grammar is anchored by REAL recorded fixtures (tests/fixtures/devin-tui/),
 * not mock markers. The function is pure: no DOM, no IO, no Hub state —
 * uncertainty returns `null` (caller renders generic) or `unknown`.
 * An adapter never throws.
 */

import type { Adapter, Segment, SettleHint } from './adapter.js';

// Grammar anchors (design §5), verified against recorded panes.
// Lines are matched after trailing-padding strip; a single leading space is
// tolerated (capture-pane keeps the TUI's left gutter).
const RE_TOOL_START = /^\s?[⏺○]\s+(\S.*)$/;
const RE_TOOL_BODY = /^\s?│(.*)$/;
const RE_TOOL_END = /^\s?└\s?(.*)$/;
// Real TUI renders fold markers as `[... N lines truncated ...]`, sometimes
// inside a `│` tool body; also accept the design-doc `(ctrl+o to expand)` form.
const RE_TRUNCATED = /^\s?(?:│\s?)?\[\.{3}\s*(\d+) lines truncated[^\]]*\]/;
const RE_CHROME_SEP = /^─{5,}/;
const RE_CHROME_PROMPT = /^❭\s+(Ask Devin|Guide Devin)/;
const RE_CHROME_STATUS = /^SWE-2\s.*Context:\s*\d+k\s*\/\s*\d+k/;
const RE_CHROME_SHELL = /^\d+ shell · ↓ select$/;
const RE_CHROME_SPIN = /^[⠀-⣿]+\s*(Running tools|Thinking|Writing|Reading|Running command)\b/;

type SegmentOut = Extract<Segment, { type: 'tool' }>;
type ChromeKind = Extract<Segment, { type: 'chrome' }>['kind'];

function chromeKind(line: string): ChromeKind | null {
  if (RE_CHROME_SEP.test(line)) return 'sep';
  if (RE_CHROME_SPIN.test(line)) return 'spinner';
  if (RE_CHROME_STATUS.test(line)) return 'status';
  if (RE_CHROME_SHELL.test(line)) return 'status';
  if (RE_CHROME_PROMPT.test(line)) {
    return /^❭\s+Ask Devin/.test(line) ? 'idle_prompt' : 'busy_prompt';
  }
  return null;
}

/**
 * Turn text -> Segment[] | null.
 * `null` when zero TOOL/CHROME anchors matched — unrecognised turns fall
 * back to generic verbatim rendering. Consecutive duplicate chrome merges;
 * an unterminated tool block stays `open: true` (running activity row);
 * orphaned `│`/`└` lines degrade to verbatim text — nothing is dropped.
 */
export function parseDevinTurn(text: string): Segment[] | null {
  try {
    const segments: Segment[] = [];
    let tool: SegmentOut | null = null;
    let sawAnchor = false;

    const pushText = (line: string) => {
      const last = segments[segments.length - 1];
      if (last && last.type === 'text') last.text = last.text === '' ? line : `${last.text}\n${line}`;
      else segments.push({ type: 'text', text: line });
    };
    const pushChrome = (kind: ChromeKind) => {
      sawAnchor = true;
      const last = segments[segments.length - 1];
      if (last && last.type === 'chrome' && last.kind === kind) return; // merge consecutive duplicates
      segments.push({ type: 'chrome', kind });
    };

    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '');

      const start = line.match(RE_TOOL_START);
      if (start) {
        sawAnchor = true;
        // a running `○`/unterminated `⏺` block stays open
        tool = { type: 'tool', title: start[1].trim(), body: '', open: true };
        segments.push(tool);
        continue;
      }
      const end = line.match(RE_TOOL_END);
      if (end && tool) {
        tool.status = end[1].trim();
        tool.open = false;
        tool = null;
        continue;
      }
      const trunc = line.match(RE_TRUNCATED);
      if (trunc) {
        sawAnchor = true;
        // fold marker is its own segment; folded bytes are never recovered
        segments.push({ type: 'truncated', lines: Number(trunc[1]) });
        continue;
      }
      const body = line.match(RE_TOOL_BODY);
      if (body && tool) {
        // verbatim after the leading │ marker
        tool.body = tool.body === '' ? body[1] : `${tool.body}\n${body[1]}`;
        continue;
      }
      const chrome = chromeKind(line);
      if (chrome) {
        pushChrome(chrome);
        continue;
      }
      // orphaned │/└ with no open tool, blank lines, everything else: verbatim text
      if (line === '' && segments.length === 0) continue; // leading blanks
      pushText(line);
    }

    return sawAnchor ? segments : null;
  } catch {
    return null; // fail-open, never throw
  }
}

/**
 * Hint from the tail of a turn's output: the LAST relevant chrome wins.
 * `❭ Ask Devin` -> idle; `❭ Guide Devin` or a braille spinner -> busy;
 * otherwise unknown. Never guesses.
 */
export function devinSettleHint(tailText: string): SettleHint {
  try {
    let hint: SettleHint = 'unknown';
    for (const raw of tailText.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (RE_CHROME_SPIN.test(line)) hint = 'busy';
      else if (/^❭\s+Ask Devin/.test(line)) hint = 'idle';
      else if (/^❭\s+Guide Devin/.test(line)) hint = 'busy';
    }
    return hint;
  } catch {
    return 'unknown';
  }
}

export const devinAdapter: Adapter = {
  id: 'devin',
  parse: parseDevinTurn,
  settleHint: devinSettleHint,
};
