/**
 * Presentation-adapter interface (Issue #121, design §3/S4, §5).
 *
 * The adapter interface is the ONLY place where program-specific output
 * format knowledge may live. Adapters are pure: no DOM, no IO, no Hub or
 * Ring access — `null`/`unknown` means "not recognised" and the caller
 * falls back to the generic/raw presentation.
 *
 * `generic` is the identity adapter and the default for every Channel.
 */

export type SettleHint = 'idle' | 'busy' | 'unknown';

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'tool'; title: string; body: string; status?: string; open: boolean }
  | { type: 'truncated'; lines: number }
  | { type: 'chrome'; kind: 'idle_prompt' | 'busy_prompt' | 'status' | 'sep' | 'spinner' };

export interface Adapter {
  id: string;
  /**
   * Turn text -> segments, or `null` when the format is not recognised.
   * Must never throw; uncertainty -> null.
   */
  parse(text: string): Segment[] | null;
  /**
   * Hint derived from the tail of a turn's output. `unknown` means the
   * adapter cannot tell; the caller combines this with the observed
   * `settled` fact — a hint never overrides observation.
   */
  settleHint(tailText: string): SettleHint;
}

/** Identity adapter: recognises nothing, hints nothing. Default for all Channels. */
export const genericAdapter: Adapter = {
  id: 'generic',
  parse: () => null,
  settleHint: () => 'unknown',
};
