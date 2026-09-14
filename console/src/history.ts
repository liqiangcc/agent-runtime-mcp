/**
 * Console-owned bounded conversation history (Issue #62).
 *
 * The ring is the only history the Console keeps: finite, memory-only, and
 * shaped solely by the Console's own sends plus mechanically observed output.
 * No role, prompt, or agent-protocol parsing happens here or anywhere else —
 * output text is stored and rendered verbatim.
 */

export type TransportResult = 'delivered' | 'ambiguous';

export interface EarlierOutputEntry {
  id: number;
  kind: 'earlier_output';
  text: string;
  truncated: boolean;
  observed_at: string;
}

export interface OutputBlockEntry {
  id: number;
  kind: 'output_block';
  /** open ⇄ paused (output_idle); closed is terminal once the next user turn lands */
  state: 'open' | 'paused' | 'closed';
  text: string;
  truncated: boolean;
  opened_at: string;
  closed_at?: string;
}

export interface UserTurnEntry {
  id: number;
  kind: 'user_turn';
  text: string;
  submit: boolean;
  sent_at: string;
  transport_result: TransportResult;
}

export interface ControlEntry {
  id: number;
  kind: 'control';
  control: string;
  sent_at: string;
  transport_result: TransportResult;
}

/** Leading marker emitted when ring ceilings evicted older entries. */
export interface DropMarkerEntry {
  id: number;
  kind: 'drop_marker';
  dropped_entries: number;
  dropped_lines: number;
}

export type HistoryEntry =
  | EarlierOutputEntry
  | OutputBlockEntry
  | UserTurnEntry
  | ControlEntry
  | DropMarkerEntry;

/** Distributive "new entry" input: same union minus the ring-assigned id. */
type NewEntry<E> = E extends { id: number } ? Omit<E, 'id'> & { id?: number } : never;
export type NewHistoryEntry = NewEntry<HistoryEntry>;

export type HistoryEntryKind = HistoryEntry['kind'];

export interface RingSnapshot {
  entries: HistoryEntry[];
  dropped_entries: number;
  dropped_lines: number;
  total_entries: number;
  total_lines: number;
  max_lines: number;
  max_bytes: number;
}

export interface RingOptions {
  maxLines?: number;
  maxBytes?: number;
}

const DEFAULT_MAX_LINES = 5_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MARKER_ID = -1;

function entryText(entry: HistoryEntry): string {
  switch (entry.kind) {
    case 'earlier_output':
    case 'output_block':
    case 'user_turn':
      return entry.text;
    default:
      return '';
  }
}

function entryLines(entry: HistoryEntry): number {
  const text = entryText(entry);
  return text === '' ? 0 : text.split('\n').length;
}

function entryBytes(entry: HistoryEntry): number {
  return Buffer.byteLength(entryText(entry), 'utf8');
}

export class HistoryRing {
  private readonly maxLines: number;
  private readonly maxBytes: number;
  private entries: HistoryEntry[] = [];
  private lines = 0;
  private bytes = 0;
  private nextId = 1;
  private droppedEntries = 0;
  private droppedLines = 0;
  private evictedIds: number[] = [];

  constructor(options: RingOptions = {}) {
    this.maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  get capacity(): { maxLines: number; maxBytes: number } {
    return { maxLines: this.maxLines, maxBytes: this.maxBytes };
  }

  allocId(): number {
    return this.nextId++;
  }

  push(entry: NewHistoryEntry): HistoryEntry {
    const stored = { ...entry, id: entry.id ?? this.allocId() } as HistoryEntry;
    this.entries.push(stored);
    this.lines += entryLines(stored);
    this.bytes += entryBytes(stored);
    this.evict();
    return stored;
  }

  /** Mutates a stored entry in place and rebalances ceilings afterwards. */
  update(id: number, mutate: (entry: HistoryEntry) => void): HistoryEntry | null {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return null;
    this.lines -= entryLines(entry);
    this.bytes -= entryBytes(entry);
    mutate(entry);
    this.lines += entryLines(entry);
    this.bytes += entryBytes(entry);
    this.evict();
    return entry;
  }

  get(id: number): HistoryEntry | null {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  private evict(): void {
    while (this.entries.length > 0 && (this.lines > this.maxLines || this.bytes > this.maxBytes)) {
      const removed = this.entries.shift();
      if (!removed) break;
      this.lines -= entryLines(removed);
      this.bytes -= entryBytes(removed);
      this.droppedEntries += 1;
      this.droppedLines += entryLines(removed);
      this.evictedIds.push(removed.id);
    }
  }

  /**
   * Ids evicted since the last drain. Delta broadcasters consume this once
   * per evicting mutation so mirrors can prune exactly — incremental deltas
   * never resend it and never resend a full snapshot.
   */
  drainEvictedIds(): number[] {
    if (this.evictedIds.length === 0) return [];
    const ids = this.evictedIds;
    this.evictedIds = [];
    return ids;
  }

  snapshot(): RingSnapshot {
    const entries: HistoryEntry[] = [...this.entries];
    if (this.droppedEntries > 0) {
      entries.unshift({
        id: MARKER_ID,
        kind: 'drop_marker',
        dropped_entries: this.droppedEntries,
        dropped_lines: this.droppedLines,
      });
    }
    return {
      entries,
      dropped_entries: this.droppedEntries,
      dropped_lines: this.droppedLines,
      total_entries: this.entries.length,
      total_lines: this.lines,
      max_lines: this.maxLines,
      max_bytes: this.maxBytes,
    };
  }
}

/**
 * Line-wise tail dedupe: returns the lines of `next` that are new relative to
 * `prev`. A bounded tail read is a moving window over the pane, and a
 * terminal screen carries trailing blank lines below the cursor — new output
 * inserts at the cursor, before those blanks — so trailing blanks are
 * stripped first. Alignment is constrained to mechanically plausible pane
 * evolution; the strongest of three candidates wins:
 *
 *   1. same-position common prefix (append-only, or a mutable current line),
 *   2. prev's longest suffix == next's prefix (bounded tail scrolling),
 *   3. same as (2) on prev minus its last line (scroll + last line rewritten
 *      in place).
 *
 * Interior occurrences are never searched — anchoring mid-window on repeated
 * output could silently skip real lines. Overlap dedupe is always preferred
 * over a gap (attach ordering invariant); when no candidate aligns, the
 * whole tail is appended — uncertainty surfaces text rather than dropping
 * output or claiming a byte log.
 */
export function diffTail(prev: string, next: string): { appended: string; overlapped: number } {
  if (next === '') return { appended: '', overlapped: 0 };
  if (next === prev) return { appended: '', overlapped: 1 };
  if (prev === '') return { appended: next, overlapped: 0 };
  const prevLines = prev.split('\n');
  const nextLines = next.split('\n');
  while (prevLines.length > 0 && prevLines[prevLines.length - 1] === '') prevLines.pop();
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') nextLines.pop();
  if (nextLines.length === 0) return { appended: '', overlapped: 1 };
  if (prevLines.length === 0) return { appended: nextLines.join('\n'), overlapped: 0 };

  let k1 = 0;
  while (k1 < prevLines.length && k1 < nextLines.length && prevLines[k1] === nextLines[k1]) k1 += 1;

  const suffixPrefix = (a: string[], b: string[]): number => {
    const maxK = Math.min(a.length, b.length);
    let best = 0;
    for (let k = 1; k <= maxK; k += 1) {
      let ok = true;
      for (let i = 0; i < k; i += 1) {
        if (a[a.length - k + i] !== b[i]) {
          ok = false;
          break;
        }
      }
      if (ok) best = k;
    }
    return best;
  };

  const overlapped = Math.max(
    k1,
    suffixPrefix(prevLines, nextLines),
    prevLines.length > 1 ? suffixPrefix(prevLines.slice(0, -1), nextLines) : 0,
  );
  return { appended: nextLines.slice(overlapped).join('\n'), overlapped };
}

/**
 * Raw transcript rendering of the exact ring content — used by the Raw
 * toggle so the unshaped text is identical to the snapshot by construction.
 */
export function formatRawTranscript(snapshot: RingSnapshot): string {
  const parts: string[] = [];
  for (const entry of snapshot.entries) {
    switch (entry.kind) {
      case 'drop_marker':
        parts.push(`[… ${entry.dropped_lines} earlier lines dropped from bounded history …]`);
        break;
      case 'earlier_output':
        parts.push(entry.text);
        break;
      case 'output_block':
        parts.push(entry.text);
        break;
      case 'user_turn':
        parts.push(`\n>>> sent${entry.submit ? '' : ' (no enter)'}: ${entry.text}`);
        break;
      case 'control':
        parts.push(`\n>>> control: ${entry.control}`);
        break;
    }
  }
  return parts.join('\n');
}
