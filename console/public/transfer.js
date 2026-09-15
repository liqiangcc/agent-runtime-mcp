'use strict';

// Explicit context-transfer helpers (Issue #84).
//
// Pure presentation/composition logic for the Chat UI: the operator selects
// text from one visible Channel's rendered history, explicitly chooses another
// currently visible Channel, previews the exact payload, and confirms. The
// actual send reuses the existing POST /api/channels/:id/text mutation — there
// is no separate transfer authority and nothing here mutates anything.

// Documented UI transfer bound; deliberately under the public write_text
// 1 MiB UTF-8 bound. Oversize selections fail visibly — never truncated.
export const TRANSFER_MAX_BYTES = 256 * 1024;

export function utf8Bytes(text) {
  return new TextEncoder().encode(text).length;
}

// Deterministic plain-text envelope: one mechanical provenance header line
// (source session label + channel id), then the selected text byte-for-byte.
// No semantic role/status/importance claims are made about the content.
export function buildTransferPayload({ sourceLabel, sourceChannelId, text }) {
  const label = sourceLabel || 'unknown';
  const channelId = sourceChannelId || 'unknown';
  return `[context transferred from "${label}" (${channelId}) via Web Console — unverified terminal output]\n${text}`;
}

// channels: array of currently visible Channel objects (from /api/channels).
// Returns { ok: true, bytes } or { ok: false, code, message }.
export function validateTransfer({ text, targetChannelId, sourceChannelId, channels }) {
  if (typeof text !== 'string' || text === '') {
    return { ok: false, code: 'empty', message: 'no source text selected' };
  }
  const bytes = utf8Bytes(text);
  if (bytes > TRANSFER_MAX_BYTES) {
    return { ok: false, code: 'oversize', message: `selection is ${bytes} bytes — over the ${TRANSFER_MAX_BYTES}-byte transfer limit; select a smaller range`, bytes };
  }
  if (!targetChannelId) {
    return { ok: false, code: 'no-target', message: 'choose a target session', bytes };
  }
  if (targetChannelId === sourceChannelId) {
    return { ok: false, code: 'same-source', message: 'target must be a different session than the source', bytes };
  }
  const visible = Array.isArray(channels) ? channels.some((c) => c && c.channel_id === targetChannelId) : false;
  if (!visible) {
    return { ok: false, code: 'target-not-visible', message: 'target is not in the current visible session list — refresh and re-select', bytes };
  }
  return { ok: true, bytes };
}
