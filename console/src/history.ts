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
    }
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
 * inserts at the cursor, before those blanks. Trailing blanks are therefore
 * stripped first, then the anchor is the longest contiguous suffix run of
 * `prev` still present in `next` (it may sit mid-window after scrolling),
 * and everything after that run is appended. When the last content line was
 * rewritten in place the anchor is retried without it. Overlap dedupe is
 * always preferred over a gap (attach ordering invariant); when no anchor
 * exists the whole tail is appended rather than dropping output.
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

  const match = (anchor: string[]): { appended: string; overlapped: number } | null => {
    const maxK = Math.min(anchor.length, nextLines.length);
    for (let k = maxK; k >= 1; k -= 1) {
      const suffix = anchor.slice(anchor.length - k);
      outer: for (let p = nextLines.length - k; p >= 0; p -= 1) {
        for (let i = 0; i < k; i += 1) {
          if (nextLines[p + i] !== suffix[i]) continue outer;
        }
        return { appended: nextLines.slice(p + k).join('\n'), overlapped: k };
      }
    }
    return null;
  };

  const found =
    match(prevLines) ??
    // The volatile last content line may have been rewritten in place.
    (prevLines.length > 1 ? match(prevLines.slice(0, -1)) : null);
  return found ?? { appended: nextLines.join('\n'), overlapped: 0 };
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
