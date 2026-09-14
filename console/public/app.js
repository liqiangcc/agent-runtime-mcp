'use strict';

const channelsEl = document.getElementById('channels');
const healthEl = document.getElementById('health');
const errorEl = document.getElementById('error');
const emptyEl = document.getElementById('empty');
const refreshBtn = document.getElementById('refresh');
const autoChk = document.getElementById('auto');
const intervalSel = document.getElementById('interval');
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

let timer = null;
let selectedChannel = null;
let backendAvailable = false;
let sending = false;

function showField(list, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value === undefined || value === null || value === '' ? 'unknown' : String(value);
  list.append(dt, dd);
}

function setSelected(channel) {
  selectedChannel = channel;
  document.querySelectorAll('.channel').forEach((el) => {
    el.classList.toggle('selected', channel !== null && el.dataset.channelId === channel.channel_id);
  });
  if (channel === null) {
    composerEl.hidden = true;
  } else {
    composerEl.hidden = false;
    const tmux = channel.backend_metadata && channel.backend_metadata.tmux;
    composerTargetEl.textContent = (tmux && tmux.session_name) || channel.channel_id || 'unknown';
    updateComposerState();
    composerText.focus();
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
    showField(fields, 'cwd', channel.cwd);
    showField(fields, 'last_activity', channel.last_activity);
    showField(fields, 'capabilities', Array.isArray(channel.capabilities) ? channel.capabilities.join(', ') : undefined);

    item.append(heading, fields);
    item.addEventListener('click', () => setSelected(channel));
    channelsEl.append(item);
  }
  if (selectedChannel && !channels.some((c) => c.channel_id === selectedChannel.channel_id)) {
    setSelected(null);
  }
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

loadAll();
restartTimer();
