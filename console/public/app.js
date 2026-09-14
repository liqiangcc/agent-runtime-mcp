'use strict';

const channelsEl = document.getElementById('channels');
const healthEl = document.getElementById('health');
const errorEl = document.getElementById('error');
const emptyEl = document.getElementById('empty');
const refreshBtn = document.getElementById('refresh');
const autoChk = document.getElementById('auto');
const intervalSel = document.getElementById('interval');
const sidebarEl = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const chatEmptyEl = document.getElementById('chat-empty');
const chatPaneEl = document.getElementById('chat-pane');
const chatTitleEl = document.getElementById('chat-title');
const chatStateEl = document.getElementById('chat-state');
const searchEl = document.getElementById('search');
const bookmarksBtn = document.getElementById('bookmarks-btn');
const bookmarkCountEl = document.getElementById('bookmark-count');
const rawToggleBtn = document.getElementById('raw-toggle');
const copyAllBtn = document.getElementById('copy-all');
const terminalLink = document.getElementById('terminal-link');
const observeBanner = document.getElementById('observe-banner');
const observeBannerText = document.getElementById('observe-banner-text');
const reobserveBtn = document.getElementById('reobserve-btn');
const messagesEl = document.getElementById('messages');
const rawViewEl = document.getElementById('raw-view');
const newOutputBtn = document.getElementById('new-output');
const composerEl = document.getElementById('composer');
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

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

function entryDomId(id) {
  return `entry-${id}`;
}

function buildBubble(entry) {
  const wrap = document.createElement('div');
  wrap.className = `entry entry-${entry.kind}`;
  wrap.id = entryDomId(entry.id);
  wrap.dataset.entryId = String(entry.id);

  if (entry.kind === 'drop_marker') {
    wrap.classList.add('marker');
    wrap.textContent = `… ${entry.dropped_lines} earlier lines dropped from bounded history …`;
    return wrap;
  }
  if (entry.kind === 'control') {
    wrap.classList.add('control-line');
    const label = entry.control === 'INTERRUPT' ? 'Stop' : entry.control === 'ENTER' ? 'Enter' : 'Escape';
    wrap.textContent = `control: ${label} · ${entry.transport_result}${entry.transport_result === 'ambiguous' ? ' (may have been delivered)' : ''} · ${fmtTime(entry.sent_at)}`;
    return wrap;
  }

  const head = document.createElement('div');
  head.className = 'entry-head';
  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  const actions = document.createElement('span');
  actions.className = 'entry-actions';

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star';
  star.textContent = '☆';
  star.title = 'bookmark';
  star.addEventListener('click', () => {
    if (bookmarks.has(entry.id)) {
      bookmarks.delete(entry.id);
    } else {
      bookmarks.add(entry.id);
    }
    star.textContent = bookmarks.has(entry.id) ? '★' : '☆';
    wrap.classList.toggle('bookmarked', bookmarks.has(entry.id));
    saveBookmarks();
  });
  if (bookmarks.has(entry.id)) {
    star.textContent = '★';
    wrap.classList.add('bookmarked');
  }

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy';
  copy.textContent = 'copy';
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(entry.text ?? '').catch(() => undefined);
  });
  actions.append(star, copy);

  const body = document.createElement('pre');
  body.className = 'entry-body';

  if (entry.kind === 'user_turn') {
    meta.textContent = `you · ${fmtTime(entry.sent_at)}${entry.submit ? '' : ' · no enter'}${entry.transport_result === 'ambiguous' ? ' · ambiguous (may have been delivered)' : ''}`;
    body.textContent = entry.text;
    wrap.classList.add('user');
  } else {
    const label = entry.kind === 'earlier_output' ? 'earlier output' : 'output';
    const bits = [label];
    if (entry.kind === 'output_block' && entry.state === 'paused') bits.push('output paused');
    if (entry.truncated) bits.push('truncated by bound');
    if (entry.kind === 'output_block' && entry.state === 'closed') bits.push(`closed ${fmtTime(entry.closed_at)}`);
    meta.textContent = bits.join(' · ');
    body.textContent = entry.text;
    wrap.classList.add('output');
  }
  head.append(meta, actions);
  wrap.append(head, body);
  return wrap;
}

function renderAll() {
  const wasPinned = isPinned() || chatOrder.length === 0;
  messagesEl.textContent = '';
  for (const id of chatOrder) {
    const entry = chatById.get(id);
    if (entry) messagesEl.append(buildBubble(entry));
  }
  applySearch();
  if (wasPinned) scrollToBottom();
}

function applyDelta(update) {
  const wasPinned = isPinned();
  if (update.appended) {
    for (const entry of update.appended) {
      if (entry.kind === 'drop_marker') continue;
      if (!chatById.has(entry.id)) {
        chatById.set(entry.id, entry);
        chatOrder.push(entry.id);
        messagesEl.append(buildBubble(entry));
      }
    }
  }
  if (update.updated) {
    for (const entry of update.updated) {
      chatById.set(entry.id, entry);
      const old = document.getElementById(entryDomId(entry.id));
      if (old) old.replaceWith(buildBubble(entry));
    }
  }
  if (update.evicted_ids && update.evicted_ids.length > 0) {
    // Authoritative eviction identity: the bounded ring dropped exactly these
    // entries — the mirror must prune them rather than retain evicted content.
    const evicted = new Set(update.evicted_ids);
    let pruned = false;
    for (const id of evicted) {
      if (chatById.delete(id)) pruned = true;
      bookmarks.delete(id);
      const node = document.getElementById(entryDomId(id));
      if (node) node.remove();
    }
    if (pruned) chatOrder = chatOrder.filter((id) => !evicted.has(id));
    updateBookmarkCount();
  }
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
  renderAll();
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

function setObserveState(state, detail) {
  observeState = state;
  observeDetail = detail || '';
  chatStateEl.textContent = STATE_LABEL[state] || state;
  chatStateEl.className = `chat-state state-${state}`;
  reobserveBtn.hidden = !(state === 'needs_reobserve' || state === 'error' || state === 'closed');
  if (state === 'needs_reobserve') {
    observeBannerText.textContent = `observation interrupted (${observeDetail}) — re-observe to resume`;
    observeBanner.hidden = false;
  } else if (state === 'error') {
    observeBannerText.textContent = `observation error: ${observeDetail}`;
    observeBanner.hidden = false;
  } else if (state === 'closed') {
    observeBannerText.textContent = 'channel closed by backend';
    observeBanner.hidden = false;
  } else if (state === 'polling') {
    observeBannerText.textContent = 'live wait unavailable — polling';
    observeBanner.hidden = false;
  } else {
    observeBanner.hidden = true;
  }
}

function applySearch() {
  const q = searchEl.value.trim().toLowerCase();
  messagesEl.querySelectorAll('.entry').forEach((el) => {
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
  document.querySelectorAll('.channel').forEach((el) => {
    el.classList.toggle('selected', channel !== null && el.dataset.channelId === channel.channel_id);
  });
  if (channel === null) {
    closeStream();
    chatPaneEl.hidden = true;
    chatEmptyEl.hidden = false;
    rawMode = false;
    rawViewEl.hidden = true;
    rawToggleBtn.textContent = 'Raw transcript';
  } else {
    chatPaneEl.hidden = false;
    chatEmptyEl.hidden = true;
    const tmux = channel.backend_metadata && channel.backend_metadata.tmux;
    const name = (tmux && tmux.session_name) || channel.channel_id || 'unknown';
    chatTitleEl.textContent = name;
    composerTargetEl.textContent = name;
    loadBookmarks();
    openStream();
    updateComposerState();
    composerText.focus();
    sidebarEl.classList.remove('open');
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
    healthEl.className = `banner ${available ? 'ok' : 'down'}`;
  } catch {
    backendAvailable = false;
    healthEl.textContent = 'backend unreachable';
    healthEl.className = 'banner down';
  }
  updateComposerState();
}

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
sidebarToggle.addEventListener('click', () => sidebarEl.classList.toggle('open'));

composerText.addEventListener('input', updateSizeHint);
composerText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendText();
  }
});
sendBtn.addEventListener('click', () => void sendText());
composerCloseBtn.addEventListener('click', () => setSelected(null));
stopBtn.addEventListener('click', () => void sendControl('INTERRUPT'));
enterBtn.addEventListener('click', () => void sendControl('ENTER'));
escapeBtn.addEventListener('click', () => void sendControl('ESCAPE'));

searchEl.addEventListener('input', applySearch);
messagesEl.addEventListener('scroll', () => {
  if (isPinned()) newOutputBtn.hidden = true;
});
newOutputBtn.addEventListener('click', scrollToBottom);
reobserveBtn.addEventListener('click', () => openStream());
terminalLink.addEventListener('click', (event) => {
  event.preventDefault();
  observeBannerText.textContent = 'Terminal View is delivered by #64 — not part of this slice.';
  observeBanner.hidden = false;
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

loadAll();
restartTimer();
