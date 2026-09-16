'use strict';

import { TRANSFER_MAX_BYTES, buildTransferPayload, utf8Bytes, validateTransfer } from './transfer.js';
import { createConversation, KNOWN_ADAPTERS } from './reading.js';
import { initViewport, diagPush, copyDiag, setHud, startKbWatch, syncAppVh, setComposing } from './viewport.js';
import { BUILD_ID } from './modules/build-stamp.js';

const channelsEl = document.getElementById('channels');
const healthEl = document.getElementById('health');
const errorEl = document.getElementById('error');
const emptyEl = document.getElementById('empty');
const refreshBtn = document.getElementById('refresh');
const autoChk = document.getElementById('auto');
const intervalSel = document.getElementById('interval');
const drawerEl = document.getElementById('drawer');
const drawerScrim = document.getElementById('drawer-scrim');
const drawerBtn = document.getElementById('drawer-btn');
const drawerCloseBtn = document.getElementById('drawer-close');
const chatEmptyEl = document.getElementById('chat-empty');
const emptyOpenBtn = document.getElementById('empty-open');
const chatPaneEl = document.getElementById('chat-pane');
const chatTitleEl = document.getElementById('chat-title');
const chatStateEl = document.getElementById('chat-state');
const searchEl = document.getElementById('search');
const bookmarksBtn = document.getElementById('bookmarks-btn');
const bookmarkCountEl = document.getElementById('bookmark-count');
const rawToggleBtn = document.getElementById('raw-toggle');
const copyAllBtn = document.getElementById('copy-all');
const terminalLink = document.getElementById('terminal-link');
const recoveryEl = document.getElementById('recovery');
const observeBannerText = document.getElementById('observe-banner-text');
const recMoreBtn = document.getElementById('rec-more');
const recDetailEl = document.getElementById('rec-detail');
const reobserveBtn = document.getElementById('reobserve-btn');
const messagesEl = document.getElementById('messages');
const rawViewEl = document.getElementById('raw-view');
const newOutputBtn = document.getElementById('new-output');
const composerEl = document.getElementById('composer');
const composerPlusBtn = document.getElementById('composer-plus');
const advancedEl = document.getElementById('advanced');
const toastEl = document.getElementById('toast');
const buildIdEl = document.getElementById('build-id');
const composerTargetEl = document.getElementById('composer-target');
const composerCloseBtn = document.getElementById('composer-close');
const composerText = document.getElementById('composer-text');
const sendBtn = document.getElementById('send');
const noSubmitChk = document.getElementById('no-submit');
const sizeHintEl = document.getElementById('size-hint');
const sendResultEl = document.getElementById('send-result');
const stopBtn = document.getElementById('control-stop');
const enterBtn = document.getElementById('control-enter');
const escapeBtn = document.getElementById('control-escape');
const lifecycleEl = document.getElementById('lifecycle');
const lcProfileEl = document.getElementById('lc-profile');
const lcNameEl = document.getElementById('lc-name');
const lcCwdEl = document.getElementById('lc-cwd');
const lcCreateBtn = document.getElementById('lc-create');
const lcKillBtn = document.getElementById('lc-kill');
const lcStatusEl = document.getElementById('lc-status');
const transferModal = document.getElementById('transfer-modal');
const transferSourceEl = document.getElementById('transfer-source');
const transferTargetEl = document.getElementById('transfer-target');
const transferPreviewEl = document.getElementById('transfer-preview');
const transferSizeEl = document.getElementById('transfer-size');
const transferErrorEl = document.getElementById('transfer-error');
const transferNoSubmitChk = document.getElementById('transfer-nosubmit');
const transferConfirmBtn = document.getElementById('transfer-confirm');
const transferCancelBtn = document.getElementById('transfer-cancel');

const TEXT_BYTE_HINT = 1024 * 1024;
const BOTTOM_PIN_PX = 48;

let timer = null;
let selectedChannel = null;
let backendAvailable = false;
let sending = false;

/* ---- conversation state (server-owned ring mirrored in the browser) ---- */
let chatSource = null;
let chatOrder = [];
let chatById = new Map();
let rawMode = false;
let bookmarks = new Set();
let bookmarkCursor = -1;
let observeState = 'idle';
let observeDetail = '';

function bookmarkKey() {
  return selectedChannel ? `console-bookmarks:${selectedChannel.channel_id}` : null;
}

function loadBookmarks() {
  bookmarks = new Set();
  bookmarkCursor = -1;
  const key = bookmarkKey();
  if (!key) return;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(stored)) bookmarks = new Set(stored);
  } catch {
    bookmarks = new Set();
  }
  updateBookmarkCount();
}

function saveBookmarks() {
  const key = bookmarkKey();
  if (key) localStorage.setItem(key, JSON.stringify([...bookmarks]));
  updateBookmarkCount();
}

function updateBookmarkCount() {
  bookmarkCountEl.textContent = String(bookmarks.size);
}

function isPinned() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < BOTTOM_PIN_PX;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
  newOutputBtn.hidden = true;
}

function entryDomId(id) {
  return `entry-${id}`;
}

/* ---- reading surface (Issue #128): conversation view driven by the
   compiled projectConversation + the user-chosen adapter. The ring mirror
   (chatById/chatOrder) stays a faithful copy of server state; this layer
   only projects entries into turns and renders segments in place. ---- */

function mirroredEntries() {
  return chatOrder.map((id) => chatById.get(id)).filter(Boolean);
}

// per-entry affordances preserved from the list view: bookmark star, copy,
// send-to. Attached to the element that owns an entry's text.
function attachEntryActions(container, entry) {
  const actions = document.createElement('span');
  actions.className = 'entry-actions';

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star';
  star.textContent = '☆';
  star.title = 'bookmark';
  const syncStar = () => {
    star.textContent = bookmarks.has(entry.id) ? '★' : '☆';
    container.classList.toggle('bookmarked', bookmarks.has(entry.id));
  };
  star.addEventListener('click', () => {
    if (bookmarks.has(entry.id)) bookmarks.delete(entry.id); else bookmarks.add(entry.id);
    syncStar();
    saveBookmarks();
  });
  syncStar();

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy';
  copy.textContent = 'copy';
  copy.addEventListener('click', () => {
    // live lookup: block entries are replaced by each delta, the captured
    // object may be stale; _liveSurface proxies read their own current text
    const live = entry._liveSurface ? entry : (chatById.get(entry.id) ?? entry);
    const text = live.text ?? '';
    const writer = window.copyText ?? ((t) => navigator.clipboard.writeText(t));
    void Promise.resolve(writer(text)).catch(() => undefined);
  });

  if (entry.kind === 'earlier_output' || entry.kind === 'output_block' || entry.kind === 'user_turn') {
    const sendTo = document.createElement('button');
    sendTo.type = 'button';
    sendTo.className = 'send-to';
    sendTo.textContent = 'send to…';
    sendTo.title = 'transfer selected output to another session';
    // resolve the live ring copy at click time — the captured entry object
    // is stale once a block has accumulated further deltas
    sendTo.addEventListener('click', () => void openTransfer(chatById.get(entry.id) ?? entry, container));
    actions.append(sendTo);
  }
  container.appendChild(actions);
}

const conversation = createConversation({
  messagesEl,
  entryDomId,
  onEntryActions: attachEntryActions,
  getTerminalHref: () => (terminalEnabled && selectedChannel
    ? `/terminal.html?channel=${encodeURIComponent(selectedChannel.channel_id)}` : null),
});

// adapter chooser — per-Channel user selection, persisted in localStorage,
// default generic, never inferred from terminal text
const adapterSel = document.getElementById('adapter-sel');
function adapterKey() {
  return selectedChannel ? `console-adapter:${selectedChannel.channel_id}` : null;
}
function loadAdapter() {
  let id = 'generic';
  const key = adapterKey();
  if (key) {
    try { id = localStorage.getItem(key) || 'generic'; } catch { id = 'generic'; }
  }
  conversation.setAdapter(id);
  adapterSel.value = conversation.adapterId;
}

function renderConversation() {
  const wasPinned = isPinned() || chatOrder.length === 0;
  conversation.reconcile(mirroredEntries());
  applySearch();
  if (wasPinned) scrollToBottom();
}

function applyDelta(update) {
  if (update.snapshot) {
    // Authoritative resync: the bounded ring evicted entries — replace the
    // whole mirror so evicted entries disappear from display/search/copy.
    applySnapshot(update);
    return;
  }
  const wasPinned = isPinned();
  window.__consoleDiag && window.__consoleDiag.deltas++;
  if (update.appended) {
    for (const entry of update.appended) {
      if (entry.kind === 'drop_marker') continue;
      if (!chatById.has(entry.id)) {
        chatById.set(entry.id, entry);
        chatOrder.push(entry.id);
      }
    }
  }
  if (update.updated) {
    window.__consoleDiag && (window.__consoleDiag.updated += update.updated.length);
    for (const entry of update.updated) {
      chatById.set(entry.id, entry);
    }
  }
  conversation.reconcile(mirroredEntries());
  if (update.dropped_entries > 0) {
    upsertDropMarker(update.dropped_entries, update.dropped_lines);
  }
  applySearch();
  if (wasPinned) {
    scrollToBottom();
  } else if ((update.appended && update.appended.length > 0) || (update.updated && update.updated.length > 0)) {
    newOutputBtn.hidden = false;
  }
}

function upsertDropMarker(entries, lines) {
  let marker = document.getElementById('drop-marker');
  if (!marker) {
    marker = document.createElement('div');
    marker.id = 'drop-marker';
    marker.className = 'entry marker';
    messagesEl.prepend(marker);
  }
  marker.textContent = `… ${lines} earlier lines dropped from bounded history …`;
}

function applySnapshot(update) {
  chatById = new Map();
  chatOrder = [];
  for (const entry of update.snapshot.entries) {
    if (entry.kind === 'drop_marker') continue;
    chatById.set(entry.id, entry);
    chatOrder.push(entry.id);
  }
  // Authoritative state — drop bookmarks that point at entries no longer held.
  let prunedBookmarks = false;
  for (const id of [...bookmarks]) {
    if (!chatById.has(id)) {
      bookmarks.delete(id);
      prunedBookmarks = true;
    }
  }
  if (prunedBookmarks) saveBookmarks();
  conversation.reset();
  renderConversation();
  if (update.snapshot.dropped_entries > 0) {
    upsertDropMarker(update.snapshot.dropped_entries, update.snapshot.dropped_lines);
  }
  setObserveState(update.state, update.detail);
}

const STATE_LABEL = {
  idle: '',
  attaching: 'attaching…',
  live: 'live',
  polling: 'polling',
  needs_reobserve: 'observation interrupted',
  closed: 'channel closed',
  error: 'error',
};

// compact recovery strip: one status line + at most one action; detail text
// (cursor state, error body) stays behind the ⓘ disclosure
function setObserveState(state, detail) {
  observeState = state;
  observeDetail = detail || '';
  chatStateEl.textContent = STATE_LABEL[state] || state;
  chatStateEl.className = `chip state-${state}`;
  const actionable = state === 'needs_reobserve' || state === 'error' || state === 'closed';
  if (state === 'needs_reobserve') {
    observeBannerText.textContent = 'observation interrupted — re-observe to resume';
  } else if (state === 'error') {
    observeBannerText.textContent = 'observation error';
  } else if (state === 'closed') {
    observeBannerText.textContent = 'channel closed by backend';
  } else if (state === 'polling') {
    observeBannerText.textContent = 'live wait unavailable — polling';
  } else if (state === 'attaching') {
    observeBannerText.textContent = 're-observing…';
  }
  recDetailEl.textContent = observeDetail;
  recDetailEl.hidden = true;
  recMoreBtn.setAttribute('aria-expanded', 'false');
  recMoreBtn.hidden = !(actionable && observeDetail);
  const show = actionable || state === 'polling' || state === 'attaching';
  recoveryEl.hidden = !show;
  recoveryEl.className = state === 'attaching' ? 'attaching'
    : (state === 'error' || state === 'closed') ? 'err' : '';
  reobserveBtn.hidden = !(actionable || state === 'attaching');
  reobserveBtn.disabled = state === 'attaching';
  reobserveBtn.textContent = state === 'attaching' ? 'Attaching…' : 'Re-observe';
}

function applySearch() {
  const q = searchEl.value.trim().toLowerCase();
  messagesEl.querySelectorAll('.turn, .earlier, .control-line').forEach((el) => {
    if (el.classList.contains('marker')) return;
    el.hidden = q !== '' && !el.textContent.toLowerCase().includes(q);
  });
}

function closeStream() {
  if (chatSource) {
    chatSource.close();
    chatSource = null;
  }
}

function openStream() {
  closeStream();
  chatById = new Map();
  chatOrder = [];
  messagesEl.textContent = '';
  newOutputBtn.hidden = true;
  setObserveState('attaching');
  const src = new EventSource(`/api/channels/${encodeURIComponent(selectedChannel.channel_id)}/events`);
  src.addEventListener('snapshot', (e) => applySnapshot(JSON.parse(e.data)));
  src.addEventListener('delta', (e) => {
    const update = JSON.parse(e.data);
    setObserveState(update.state, update.detail);
    applyDelta(update);
    if (rawMode) void refreshRaw();
  });
  src.onerror = () => {
    if (observeState !== 'error') setObserveState('error', 'stream disconnected — retrying');
  };
  chatSource = src;
}

async function refreshRaw() {
  if (!selectedChannel) return;
  const res = await fetch(`/api/channels/${encodeURIComponent(selectedChannel.channel_id)}/history?format=raw`, { cache: 'no-store' });
  rawViewEl.textContent = res.ok ? await res.text() : `history unavailable: http ${res.status}`;
}

function setSelected(channel) {
  selectedChannel = channel;
  updateLifecycleState();
  updateTerminalLink();
  document.querySelectorAll('.channel').forEach((el) => {
    el.classList.toggle('selected', channel !== null && el.dataset.channelId === channel.channel_id);
  });
  if (channel === null) {
    closeStream();
    chatPaneEl.hidden = true;
    chatEmptyEl.hidden = false;
    chatTitleEl.textContent = 'Sessions';
    chatStateEl.hidden = true;
    rawMode = false;
    rawViewEl.hidden = true;
    rawToggleBtn.textContent = 'Raw transcript';
    // discoverability: no selection always re-exposes the session list
    setDrawer(true);
  } else {
    chatPaneEl.hidden = false;
    chatEmptyEl.hidden = true;
    chatStateEl.hidden = false;
    const tmux = channel.backend_metadata && channel.backend_metadata.tmux;
    const name = (tmux && tmux.session_name) || channel.channel_id || 'unknown';
    chatTitleEl.textContent = name;
    composerTargetEl.textContent = name;
    loadBookmarks();
    loadAdapter();
    conversation.reset();
    openStream();
    updateComposerState();
    composerText.focus();
    setDrawer(false);
  }
}

function updateComposerState() {
  const usable = backendAvailable && selectedChannel !== null && !sending;
  composerText.disabled = !usable;
  sendBtn.disabled = !usable;
  noSubmitChk.disabled = !usable;
  stopBtn.disabled = !usable;
  enterBtn.disabled = !usable;
  escapeBtn.disabled = !usable;
}

function updateSizeHint() {
  const bytes = new TextEncoder().encode(composerText.value).length;
  sizeHintEl.textContent = bytes > 0 ? `${bytes} / ${TEXT_BYTE_HINT} bytes` : '';
}

function renderChannels(channels) {
  channelsEl.textContent = '';
  emptyEl.hidden = channels.length !== 0;
  for (const channel of channels) {
    const item = document.createElement('li');
    item.className = 'channel';
    item.dataset.channelId = channel.channel_id ?? '';
    if (selectedChannel && channel.channel_id === selectedChannel.channel_id) {
      item.classList.add('selected');
    }

    const heading = document.createElement('div');
    heading.className = 'channel-heading';
    const idEl = document.createElement('span');
    idEl.className = 'channel-id';
    idEl.textContent = channel.channel_id ?? 'unknown';
    const stateEl = document.createElement('span');
    const state = typeof channel.state === 'string' ? channel.state : 'unknown';
    stateEl.className = `state state-${state}`;
    stateEl.textContent = state;
    heading.append(idEl, stateEl);

    const fields = document.createElement('dl');
    fields.className = 'channel-fields';
    const tmux = channel.backend_metadata && channel.backend_metadata.tmux;
    showField(fields, 'session', tmux && tmux.session_name);
    showField(fields, 'title', channel.title);
    showField(fields, 'state', channel.state);
    showField(fields, 'last_activity', channel.last_activity);

    item.append(heading, fields);
    item.addEventListener('click', () => setSelected(channel));
    channelsEl.append(item);
  }
  if (selectedChannel && !channels.some((c) => c.channel_id === selectedChannel.channel_id)) {
    setSelected(null);
  }
}

function showField(list, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value === undefined || value === null || value === '' ? 'unknown' : String(value);
  list.append(dt, dd);
}

async function loadHealth() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    const available = res.ok && body && body.health && body.health.available === true;
    backendAvailable = available;
    healthEl.textContent = available ? 'backend healthy' : 'backend unavailable';
    healthEl.className = `health-dot ${available ? 'ok' : 'down'}`;
    healthEl.title = healthEl.textContent;
  } catch {
    backendAvailable = false;
    healthEl.textContent = 'backend unreachable';
    healthEl.className = 'health-dot down';
    healthEl.title = healthEl.textContent;
  }
  updateComposerState();
}

// ---------- explicit context transfer (#84) ----------
// selection → explicit target → preview → explicit confirm → exactly one
// ordinary text write on the target via POST /api/channels/:id/text.
// Nothing mutates until Confirm; Cancel and preview never touch a target.
// Transfer state is in-memory only and is cleared when the modal closes.

let transferState = null;
let transferChannels = [];

function selectionWithin(el) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  if (!el.contains(sel.getRangeAt(0).commonAncestorContainer)) return null;
  const text = sel.toString();
  return text === '' ? null : text;
}

async function openTransfer(entry, bodyEl) {
  transferErrorEl.hidden = true;
  transferErrorEl.textContent = '';
  const sourceChannel = selectedChannel;
  const text = selectionWithin(bodyEl) ?? (entry.text ?? '');
  transferState = {
    text,
    sourceChannelId: sourceChannel.channel_id,
    sourceLabel: sourceChannel.backend_metadata?.tmux?.session_name || sourceChannel.channel_id,
  };
  transferSourceEl.textContent = `${transferState.sourceLabel} (${transferState.sourceChannelId})`;

  await refreshTransferTargets();
  renderTransferPreview();
  transferModal.hidden = false;
}

// Rebuild the target list from the currently visible Channels and clear any
// prior selection — a vanished/stale target must never be re-confirmed without
// a fresh explicit choice.
async function refreshTransferTargets() {
  try {
    const res = await fetch('/api/channels', { cache: 'no-store' });
    if (!res.ok) throw new Error(`channel list failed: ${res.status}`);
    transferChannels = (await res.json()).channels ?? [];
  } catch {
    transferChannels = [];
  }

  transferTargetEl.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'choose target…';
  transferTargetEl.append(placeholder);
  for (const ch of transferChannels) {
    if (ch.channel_id === transferState?.sourceChannelId) continue;
    const opt = document.createElement('option');
    opt.value = ch.channel_id;
    opt.textContent = ch.backend_metadata?.tmux?.session_name || ch.channel_id || 'unknown';
    transferTargetEl.append(opt);
  }
  transferTargetEl.value = '';
}

function renderTransferPreview() {
  if (!transferState) return;
  const payload = buildTransferPayload({
    sourceLabel: transferState.sourceLabel,
    sourceChannelId: transferState.sourceChannelId,
    text: transferState.text,
  });
  transferPreviewEl.textContent = payload;
  const bytes = utf8Bytes(payload);
  transferSizeEl.textContent = `payload ${bytes} bytes (limit ${TRANSFER_MAX_BYTES})`;
  const check = validateTransfer({
    text: payload,
    targetChannelId: transferTargetEl.value,
    sourceChannelId: transferState.sourceChannelId,
    channels: transferChannels,
  });
  transferConfirmBtn.disabled = !check.ok;
  if (!check.ok && check.code !== 'no-target') {
    transferErrorEl.textContent = check.message;
    transferErrorEl.hidden = false;
  } else {
    transferErrorEl.hidden = true;
  }
}

function closeTransfer() {
  transferModal.hidden = true;
  transferState = null;
  transferChannels = [];
}

async function confirmTransfer() {
  if (!transferState || transferConfirmBtn.disabled) return;
  const payload = buildTransferPayload({
    sourceLabel: transferState.sourceLabel,
    sourceChannelId: transferState.sourceChannelId,
    text: transferState.text,
  });
  const check = validateTransfer({
    text: payload,
    targetChannelId: transferTargetEl.value,
    sourceChannelId: transferState.sourceChannelId,
    channels: transferChannels,
  });
  if (!check.ok) {
    transferErrorEl.textContent = check.message;
    transferErrorEl.hidden = false;
    return;
  }
  const targetId = transferTargetEl.value;
  transferConfirmBtn.disabled = true;
  transferErrorEl.hidden = true;
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(targetId)}/text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: payload, submit: !transferNoSubmitChk.checked }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const targetLabel = transferTargetEl.selectedOptions[0]?.textContent || targetId;
      closeTransfer();
      showSendResult('ok', `sent ${body.bytes_sent ?? check.bytes} bytes to ${targetLabel}${body.submit ? ' (+ Enter)' : ''}`);
      return;
    }
    if (body.error?.code === 'TIMEOUT') {
      transferErrorEl.textContent = `TIMEOUT: delivery ambiguous — ${targetId} may have received the text. Not retried automatically.`;
      transferErrorEl.hidden = false;
      transferConfirmBtn.disabled = false;
      return;
    }
    await invalidateTargetChoice(body.error?.message || `send failed: ${res.status}`);
  } catch {
    await invalidateTargetChoice('network error — not retried automatically');
  }
}

// A failed (non-TIMEOUT) send means the chosen target may be gone or stale:
// invalidate the prior choice, rebuild the list from currently visible
// Channels, and keep Confirm disabled until the operator makes a fresh
// explicit selection. Nothing is re-sent automatically.
async function invalidateTargetChoice(message) {
  transferErrorEl.textContent = message;
  transferErrorEl.hidden = false;
  await refreshTransferTargets();
  transferConfirmBtn.disabled = true;
}

transferTargetEl.addEventListener('change', renderTransferPreview);
transferNoSubmitChk.addEventListener('change', renderTransferPreview);
transferCancelBtn.addEventListener('click', closeTransfer);
transferConfirmBtn.addEventListener('click', () => void confirmTransfer());
transferModal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTransfer();
});

async function loadChannels() {
  try {
    const res = await fetch('/api/channels', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = body && body.error && body.error.code ? body.error.code : `http ${res.status}`;
      throw new Error(code);
    }
    renderChannels(body && Array.isArray(body.channels) ? body.channels : []);
    errorEl.hidden = true;
  } catch (error) {
    channelsEl.textContent = '';
    emptyEl.hidden = true;
    errorEl.textContent = `channel list unavailable: ${error.message}`;
    errorEl.hidden = false;
  }
}

function showSendResult(kind, message) {
  sendResultEl.textContent = message;
  sendResultEl.className = `send-result ${kind}`;
  sendResultEl.hidden = false;
}

async function sendText() {
  const text = composerText.value;
  if (!selectedChannel || text === '' || sending) return;
  sending = true;
  updateComposerState();
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(selectedChannel.channel_id)}/text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, submit: !noSubmitChk.checked }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      composerText.value = '';
      updateSizeHint();
      showSendResult('ok', 'delivered (transport only)');
    } else if (body && body.error && body.error.code === 'TIMEOUT') {
      showSendResult('warn', 'ambiguous: the message may have been delivered — check before retrying');
    } else {
      const code = body && body.error && body.error.code ? body.error.code : `http ${res.status}`;
      const message = body && body.error && body.error.message ? body.error.message : '';
      showSendResult('err', `rejected: ${code}${message ? ` — ${message}` : ''}`);
    }
  } catch (error) {
    showSendResult('err', `send failed: ${error.message}`);
  } finally {
    sending = false;
    updateComposerState();
  }
}

async function sendControl(control) {
  if (!selectedChannel || sending) return;
  if (control === 'INTERRUPT') {
    const ok = window.confirm(`Send Stop (interrupt) to ${composerTargetEl.textContent}?`);
    if (!ok) return;
  }
  sending = true;
  updateComposerState();
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(selectedChannel.channel_id)}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ control }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      showSendResult('ok', `${control.toLowerCase()} delivered (transport only)`);
    } else if (body && body.error && body.error.code === 'TIMEOUT') {
      showSendResult('warn', `ambiguous: ${control.toLowerCase()} may have been delivered — check before retrying`);
    } else {
      const code = body && body.error && body.error.code ? body.error.code : `http ${res.status}`;
      showSendResult('err', `rejected: ${code}`);
    }
  } catch (error) {
    showSendResult('err', `send failed: ${error.message}`);
  } finally {
    sending = false;
    updateComposerState();
  }
}

/* ---- operator lifecycle controls (enabled only by deployment config) ---- */

function lcStatus(kind, message) {
  lcStatusEl.textContent = message;
  lcStatusEl.className = `lc-status ${kind}`;
  lcStatusEl.hidden = message === '';
}

function updateLifecycleState() {
  lcKillBtn.disabled = !selectedChannel;
}

async function loadLifecycle() {
  let body = null;
  try {
    const res = await fetch('/api/lifecycle', { cache: 'no-store' });
    if (!res.ok) return;
    body = await res.json().catch(() => null);
  } catch {
    return;
  }
  if (!body || body.enabled !== true || !Array.isArray(body.profiles)) return;
  lifecycleEl.hidden = false;
  lcProfileEl.textContent = '';
  for (const label of body.profiles) {
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label;
    lcProfileEl.append(option);
  }
  if (body.profiles.length === 0) {
    lcCreateBtn.disabled = true;
    lcStatus('warn', 'lifecycle is enabled but no profiles are configured — no start command is exposed');
  }
}

async function createSession() {
  const name = lcNameEl.value.trim();
  const cwd = lcCwdEl.value.trim();
  const profile = lcProfileEl.value;
  if (!name || !cwd || !profile) {
    lcStatus('err', 'name, working dir and profile are required');
    return;
  }
  lcCreateBtn.disabled = true;
  try {
    const res = await fetch('/api/lifecycle/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, cwd, profile }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      lcStatus('ok', `created ${name}`);
      lcNameEl.value = '';
      void loadChannels();
    } else {
      const message = body && body.error && body.error.message ? body.error.message : `http ${res.status}`;
      lcStatus('err', `create refused: ${message}`);
    }
  } catch (error) {
    lcStatus('err', `create failed: ${error.message}`);
  } finally {
    lcCreateBtn.disabled = false;
  }
}

async function killSession() {
  if (!selectedChannel) return;
  const tmux = selectedChannel.backend_metadata && selectedChannel.backend_metadata.tmux;
  const name = (tmux && tmux.session_name) || selectedChannel.channel_id || '';
  const ok = window.confirm(`Kill session ${name}? This destroys the tmux session and cannot be undone.`);
  if (!ok) return;
  lcKillBtn.disabled = true;
  try {
    const res = await fetch('/api/lifecycle/kill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, confirm: true }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      lcStatus('ok', `killed ${name}`);
      setSelected(null);
      void loadChannels();
    } else {
      const message = body && body.error && body.error.message ? body.error.message : `http ${res.status}`;
      lcStatus('err', `kill refused: ${message}`);
    }
  } catch (error) {
    lcStatus('err', `kill failed: ${error.message}`);
  } finally {
    updateLifecycleState();
  }
}

/* ---- Terminal View capability (Advanced entry; enabled only by operator) ---- */

let terminalEnabled = false;

function updateTerminalLink() {
  if (terminalEnabled && selectedChannel) {
    terminalLink.href = `/terminal.html?channel=${encodeURIComponent(selectedChannel.channel_id)}`;
    terminalLink.removeAttribute('aria-disabled');
    terminalLink.title = 'open an interactive terminal on this pane';
  } else {
    terminalLink.href = '#';
    terminalLink.setAttribute('aria-disabled', 'true');
    terminalLink.title = 'Terminal View requires CONSOLE_TERMINAL_ENABLED';
  }
}

async function loadTerminalCapability() {
  try {
    const res = await fetch('/api/terminal', { cache: 'no-store' });
    if (!res.ok) return;
    const body = await res.json().catch(() => null);
    if (body && body.enabled === true) {
      terminalEnabled = true;
      updateTerminalLink();
    }
  } catch {
    // probe failure keeps the entry disabled
  }
}

function loadAll() {
  void loadHealth();
  void loadChannels();
}

function restartTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (autoChk.checked) {
    timer = setInterval(loadAll, Number(intervalSel.value));
  }
}

refreshBtn.addEventListener('click', loadAll);
autoChk.addEventListener('change', restartTimer);
intervalSel.addEventListener('change', restartTimer);

// ---- sessions drawer (canvas-translation model, frozen prototype shell) ----
// The drawer is a fixed surface beneath the app; opening translates the
// whole conversation canvas right — the transcript is never rebuilt.
function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  drawerScrim.hidden = !open;
}
drawerBtn.addEventListener('click', () => setDrawer(true));
drawerCloseBtn.addEventListener('click', () => setDrawer(false));
drawerScrim.addEventListener('click', () => setDrawer(false));
emptyOpenBtn.addEventListener('click', () => setDrawer(true));

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastEl._h);
  toastEl._h = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

// ---- build identity: stale standalone-resume self-heal ----
// The served build-stamp module is fetched no-store; a mismatch means the
// server has moved on and this page is stale — reload to self-heal.
buildIdEl.textContent = BUILD_ID.slice(0, 7);
document.body.dataset.build = BUILD_ID;
async function checkBuildStamp() {
  try {
    const res = await fetch('/modules/build-stamp.js', { cache: 'no-store' });
    if (!res.ok) return false;
    const match = /BUILD_ID\s*=\s*['"]([^'"]+)['"]/.exec(await res.text());
    if (match && match[1] !== BUILD_ID) {
      location.reload();
      return true;
    }
  } catch {
    // offline/unreachable — keep serving the current UI
  }
  return false;
}
window.__checkBuildStamp = checkBuildStamp;
window.addEventListener('pageshow', (e) => {
  if (e.persisted) void checkBuildStamp();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkBuildStamp();
});

// adapter chooser — user choice only, persisted per channel_id
for (const id of KNOWN_ADAPTERS) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = id;
  adapterSel.append(opt);
}
adapterSel.addEventListener('change', () => {
  const key = adapterKey();
  if (key) {
    try { localStorage.setItem(key, adapterSel.value); } catch { /* ignore */ }
  }
  conversation.setAdapter(adapterSel.value);
  renderConversation();
});

// composer "+" toggles the zero-height advanced panel (send-without-Enter,
// explicit controls, byte budget, clear selection)
composerPlusBtn.addEventListener('click', () => {
  advancedEl.hidden = !advancedEl.hidden;
  composerPlusBtn.setAttribute('aria-expanded', String(!advancedEl.hidden));
});

// recovery strip: ⓘ expands the captured detail without leaving the strip
recMoreBtn.addEventListener('click', () => {
  recDetailEl.hidden = !recDetailEl.hidden;
  recMoreBtn.setAttribute('aria-expanded', String(!recDetailEl.hidden));
});

// IME safety: never mutate the field (height, value) while a composition
// session is active — iOS Safari can drop/duplicate composed characters
// when layout shifts mid-composition.
let imeComposing = false;
function autogrowComposer() {
  composerText.style.height = 'auto';
  composerText.style.height = `${Math.min(composerText.scrollHeight, 140)}px`;
}
composerText.addEventListener('compositionstart', () => { imeComposing = true; setComposing(true); diagPush('compositionstart'); });
composerText.addEventListener('compositionend', () => {
  imeComposing = false;
  setComposing(false);
  diagPush('compositionend');
  autogrowComposer();
});
composerText.addEventListener('focus', () => { diagPush('focus'); startKbWatch(); });
composerText.addEventListener('blur', () => { diagPush('blur'); syncAppVh('blur', { dismissKb: true }); });
composerText.addEventListener('input', () => {
  updateSizeHint();
  if (!imeComposing) autogrowComposer();
});
composerText.addEventListener('keydown', (event) => {
  // an Enter inside an active IME composition must never send
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void sendText();
  }
});
sendBtn.addEventListener('click', () => void sendText());
composerCloseBtn.addEventListener('click', () => setSelected(null));
stopBtn.addEventListener('click', () => void sendControl('INTERRUPT'));
enterBtn.addEventListener('click', () => void sendControl('ENTER'));
escapeBtn.addEventListener('click', () => void sendControl('ESCAPE'));
lcCreateBtn.addEventListener('click', () => void createSession());
lcKillBtn.addEventListener('click', () => void killSession());

searchEl.addEventListener('input', applySearch);
messagesEl.addEventListener('scroll', () => {
  if (isPinned()) newOutputBtn.hidden = true;
});
newOutputBtn.addEventListener('click', scrollToBottom);
reobserveBtn.addEventListener('click', () => openStream());
terminalLink.addEventListener('click', (event) => {
  if (terminalEnabled && selectedChannel) return; // real navigation
  event.preventDefault();
  toast(terminalEnabled
    ? 'Select a session first — Terminal attaches to the selected pane.'
    : 'Terminal View is disabled on this deployment (CONSOLE_TERMINAL_ENABLED).');
});
rawToggleBtn.addEventListener('click', () => {
  rawMode = !rawMode;
  rawToggleBtn.textContent = rawMode ? 'Chat view' : 'Raw transcript';
  if (rawMode) {
    rawViewEl.hidden = false;
    messagesEl.hidden = true;
    void refreshRaw();
  } else {
    rawViewEl.hidden = true;
    messagesEl.hidden = false;
  }
});
copyAllBtn.addEventListener('click', () => {
  const text = rawMode
    ? rawViewEl.textContent
    : chatOrder.map((id) => chatById.get(id)).filter((e) => e && e.text).map((e) => e.text).join('\n');
  void navigator.clipboard.writeText(text).catch(() => undefined);
});
bookmarksBtn.addEventListener('click', () => {
  const marked = chatOrder.filter((id) => bookmarks.has(id));
  if (marked.length === 0) return;
  bookmarkCursor = (bookmarkCursor + 1) % marked.length;
  const el = document.getElementById(entryDomId(marked[bookmarkCursor]));
  if (el) el.scrollIntoView({ block: 'center' });
});

// overflow menu — relocated secondary actions + debug affordances.
// Buttons/links close the menu; .menu-row controls (search, selects,
// checkbox) keep it open while the operator edits them.
const overflowBtn = document.getElementById('overflow-btn');
const overflowMenu = document.getElementById('overflow-menu');
overflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  overflowMenu.hidden = !overflowMenu.hidden;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) overflowMenu.hidden = true;
});
overflowMenu.addEventListener('click', (e) => {
  const target = e.target.closest('button, a');
  if (!target || e.target.closest('.menu-row')) return;
  overflowMenu.hidden = true;
  const act = target.dataset.act;
  if (act === 'hud') setHud(!document.getElementById('vp-debug'));
  else if (act === 'diag-copy') {
    const payload = copyDiag();
    void (window.copyText ?? navigator.clipboard.writeText.bind(navigator.clipboard))(payload).then((ok) => {
      if (ok === false) {
        rawViewEl.textContent = payload;
        rawViewEl.hidden = false;
        rawMode = true;
        messagesEl.hidden = true;
      } else {
        toast('diagnostics copied');
      }
    }).catch(() => { toast('clipboard blocked'); });
  }
});

// diag counters for e2e evidence (delta/updated delivery is incremental)
window.__consoleDiag = { deltas: 0, updated: 0 };
initViewport({ composer: composerEl, text: composerText, scroll: messagesEl });

loadAll();
void loadLifecycle();
void loadTerminalCapability();
restartTimer();
// first-screen discoverability: with no Channel selected the session list is
// the first thing the operator sees — no hunting
if (selectedChannel === null) setDrawer(true);
