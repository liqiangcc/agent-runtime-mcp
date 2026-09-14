'use strict';

const channelsEl = document.getElementById('channels');
const healthEl = document.getElementById('health');
const errorEl = document.getElementById('error');
const emptyEl = document.getElementById('empty');
const refreshBtn = document.getElementById('refresh');
const autoChk = document.getElementById('auto');
const intervalSel = document.getElementById('interval');

let timer = null;

function showField(list, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value === undefined || value === null || value === '' ? 'unknown' : String(value);
  list.append(dt, dd);
}

function renderChannels(channels) {
  channelsEl.textContent = '';
  emptyEl.hidden = channels.length !== 0;
  for (const channel of channels) {
    const item = document.createElement('li');
    item.className = 'channel';

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
    channelsEl.append(item);
  }
}

async function loadHealth() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    const available = res.ok && body && body.health && body.health.available === true;
    healthEl.textContent = available ? 'backend healthy' : 'backend unavailable';
    healthEl.className = `banner ${available ? 'ok' : 'down'}`;
  } catch {
    healthEl.textContent = 'backend unreachable';
    healthEl.className = 'banner down';
  }
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

loadAll();
restartTimer();
