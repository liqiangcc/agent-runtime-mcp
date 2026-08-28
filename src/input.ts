import { ChannelError } from './errors.js';
import type { TerminalControl } from './types.js';

export const HARD_MAX_WRITE_BYTES = 1024 * 1024;
export const TERMINAL_CONTROLS = ['ENTER', 'INTERRUPT', 'ESCAPE'] as const satisfies readonly TerminalControl[];

const TERMINAL_CONTROL_SET = new Set<string>(TERMINAL_CONTROLS);

export function validateOrdinaryText(text: string): void {
  if (typeof text !== 'string') {
    throw new ChannelError('INVALID_ARGUMENT', 'text must be a string');
  }

  const byteCount = Buffer.byteLength(text, 'utf8');
  if (byteCount > HARD_MAX_WRITE_BYTES) {
    throw new ChannelError('INVALID_ARGUMENT', `text must not exceed ${HARD_MAX_WRITE_BYTES} UTF-8 bytes`, {
      byte_count: byteCount,
      max_bytes: HARD_MAX_WRITE_BYTES,
    });
  }

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (isUnicodeControl(codePoint) && codePoint !== 0x0a && codePoint !== 0x09) {
      throw new ChannelError('INVALID_ARGUMENT', 'text contains a control character that must use send_control', {
        code_point: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
      });
    }
  }
}

export function validateTerminalControl(control: unknown): asserts control is TerminalControl {
  if (typeof control !== 'string' || !TERMINAL_CONTROL_SET.has(control)) {
    throw new ChannelError('INVALID_ARGUMENT', 'control must be one of ENTER, INTERRUPT or ESCAPE');
  }
}

function isUnicodeControl(codePoint: number): boolean {
  return (codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f);
}
