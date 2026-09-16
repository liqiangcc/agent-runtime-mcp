/**
 * Conversation projection (Issue #121, design §3/S3).
 *
 * Pure function ring entries -> Turn[]. Turn boundaries come ONLY from facts
 * the Console produced itself: its own `user_turn` entries, entry order, and
 * `output_block.state`. Output text is never read — this module must stay
 * adapter-agnostic and free of any program's output format.
 *
 * No DOM, no IO, no Hub state: importable by `node --test` and deliverable
 * unchanged to the browser by T3.
 */

import type {
  ControlEntry,
  EarlierOutputEntry,
  HistoryEntry,
  OutputBlockEntry,
  UserTurnEntry,
} from './history.js';

export interface Turn {
  /** `user_turn` entry id, or 0 for the synthetic "earlier" turn. */
  id: number;
  /** The Console's own send that opened this turn; absent on the earlier turn. */
  user?: UserTurnEntry;
  /** Observed output blocks attributed to this turn, in ring order. */
  blocks: OutputBlockEntry[];
  /** Console control sends recorded inside this turn, in ring order. */
  controls: ControlEntry[];
  /**
   * Output produced before the first `user_turn`, verbatim. Present only on
   * the synthetic earlier turn.
   */
  earlier?: EarlierOutputEntry;
  /**
   * Observed fact: this turn's output has stopped — every attributed block is
   * `paused` or `closed`, and the turn is not still open-ended. `settled`
   * says nothing about whether "the agent finished"; that interpretation
   * belongs to the adapter/renderer layers.
   */
  settled: boolean;
}

/**
 * Deterministic turn derivation:
 * - everything before the first `user_turn` is one synthetic "earlier" turn
 *   (id 0, always settled);
 * - each `user_turn` opens a new turn; `output_block` and `control` entries
 *   attach to the current turn by order;
 * - `settled` = the turn owns at least one block and none is still `open`;
 *   a turn with no observed output yet is not settled.
 * `drop_marker` carries no turn semantics and is skipped.
 */
export function projectConversation(entries: HistoryEntry[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const entry of entries) {
    switch (entry.kind) {
      case 'user_turn': {
        current = { id: entry.id, user: entry, blocks: [], controls: [], settled: false };
        turns.push(current);
        break;
      }
      case 'earlier_output': {
        if (!current) {
          current = { id: 0, blocks: [], controls: [], settled: true };
          turns.push(current);
        }
        // Only the first earlier_output lands on the synthetic turn; any
        // later ones (re-observe re-priming) still attribute by order.
        if (current.id === 0) current.earlier = entry;
        break;
      }
      case 'output_block': {
        if (!current) {
          current = { id: 0, blocks: [], controls: [], settled: true };
          turns.push(current);
        }
        current.blocks.push(entry);
        break;
      }
      case 'control': {
        if (!current) {
          current = { id: 0, blocks: [], controls: [], settled: true };
          turns.push(current);
        }
        current.controls.push(entry);
        break;
      }
      case 'drop_marker':
        break; // eviction bookkeeping, not conversation structure
    }
  }

  for (const turn of turns) {
    if (turn.id !== 0) {
      turn.settled = turn.blocks.length > 0 && turn.blocks.every((b) => b.state !== 'open');
    }
  }
  return turns;
}
