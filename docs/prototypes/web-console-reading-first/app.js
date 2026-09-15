// Static prototype for Issue #90 — mock data only, no backend calls.

const MOCK_ENTRIES = [
  { kind: 'user', time: '10:14', text: 'Read the next paragraph and translate each sentence, one at a time.' },
  { kind: 'output', time: '10:14', text: 'Le renard brun rapide saute par-dessus le chien paresseux.\n敏捷的棕色狐狸跳过了懒狗。\n\nThe quick brown fox jumps over the lazy dog.' },
  { kind: 'user', time: '10:15', text: 'Next sentence.' },
  { kind: 'output', time: '10:15', text: 'Il court à travers la forêt silencieuse alors que le soleil se lève.\n它穿过寂静的森林，此时太阳刚刚升起。\n\nIt runs through the silent forest as the sun rises.' },
  { kind: 'control', time: '10:15', text: '[control] INTERRUPT — reading paused by operator' },
  { kind: 'output', time: '10:15', text: '(paused — 2 of 9 sentences delivered)' },
  { kind: 'user', time: '10:16', text: 'Continue reading.' },
  { kind: 'output', time: '10:16', text: 'Les oiseaux chantent doucement dans les branches au-dessus de lui.\n鸟儿在它头顶的树枝上轻声歌唱。\n\nBirds sing softly in the branches above it.' },
];

const RECOVERY = {
  needs_reobserve: {
    cls: '', chip: 'chip-needs_reobserve', label: 'needs re-observe',
    title: 'Observation interrupted',
    detail: 'Channel is still available; observation continuity was lost (cursor expired — GAP). Output produced during the gap is not shown below.',
  },
  error: {
    cls: 'err', chip: 'chip-error', label: 'observe error',
    title: 'Observation error',
    detail: 'Channel is still available; the observer hit an error and stopped. Nothing is being delivered right now.',
  },
  closed: {
    cls: 'err', chip: 'chip-closed', label: 'closed',
    title: 'Channel closed',
    detail: 'The backend closed this channel. Re-observe is unlikely to help, but you can try.',
  },
};

const $ = (id) => document.getElementById(id);
const messages = $('messages');

function renderEntries() {
  messages.innerHTML = '';
  for (const e of MOCK_ENTRIES) {
    const div = document.createElement('article');
    div.className = `entry ${e.kind}`;
    const label = e.kind === 'user' ? 'you' : e.kind === 'control' ? 'control' : 'reader-cn';
    div.innerHTML = `<div class="entry-meta"><span class="sent-label">${label}</span><span>${e.time}</span></div>` +
      `<div class="entry-body"></div>`;
    div.querySelector('.entry-body').textContent = e.text;
    messages.appendChild(div);
  }
}

function setState(state) {
  const chip = $('state-chip');
  const rec = $('recovery');
  chip.className = 'chip ' + (state === 'live' ? 'chip-live' : state === 'attaching' ? 'chip-attaching' : state === 'polling' ? 'chip-polling' : RECOVERY[state]?.chip || 'chip-polling');
  chip.textContent = state === 'needs_reobserve' ? 're-observe' : state;
  const r = RECOVERY[state];
  rec.hidden = !r;
  if (r) {
    rec.className = r.cls;
    $('rec-title').textContent = r.title;
    $('rec-detail').textContent = r.detail;
  }
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 1800);
}

// drawer
$('drawer-btn').addEventListener('click', () => {
  $('drawer').classList.add('open');
  $('drawer-scrim').hidden = false;
});
$('drawer-scrim').addEventListener('click', () => {
  $('drawer').classList.remove('open');
  $('drawer-scrim').hidden = true;
});
$('session-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('.session');
  if (!li) return;
  document.querySelectorAll('.session').forEach(s => s.classList.remove('active'));
  li.classList.add('active');
  $('session-name').textContent = li.querySelector('.s-name').textContent;
  $('drawer').classList.remove('open');
  $('drawer-scrim').hidden = true;
});

// overflow menu
$('overflow-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('overflow-menu').hidden = !$('overflow-menu').hidden;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) $('overflow-menu').hidden = true;
});
$('overflow-menu').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  $('overflow-menu').hidden = true;
  if (act === 'raw') showRaw();
  else if (act === 'transfer') openTransfer();
  else if (act === 'state-live') setState('live');
  else if (act === 'state-reobserve') setState('needs_reobserve');
  else if (act === 'state-error') setState('error');
  else if (act === 'state-closed') setState('closed');
  else toast(`${act} — mock affordance only`);
});

// recovery
$('reobserve').addEventListener('click', () => {
  setState('attaching');
  setTimeout(() => { setState('live'); toast('re-observed (mock)'); }, 900);
});

// raw transcript
function showRaw() {
  $('raw-pre').textContent = MOCK_ENTRIES.map(e => `[${e.time}] <${e.kind}> ${e.text}`).join('\n\n');
  $('raw-view').hidden = false;
}
$('raw-close').addEventListener('click', () => { $('raw-view').hidden = true; });

// composer (mock)
const ta = $('composer-text');
ta.addEventListener('input', () => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
});
$('send').addEventListener('click', () => {
  const text = ta.value.trim();
  if (!text) return;
  MOCK_ENTRIES.push({ kind: 'user', time: new Date().toTimeString().slice(0, 5), text });
  renderEntries();
  $('main').scrollTop = $('main').scrollHeight;
  ta.value = '';
  ta.style.height = 'auto';
  $('send-status').textContent = $('no-submit').checked
    ? 'mock: would write text without submit'
    : 'mock: would write text + Enter';
  setTimeout(() => { $('send-status').textContent = ''; }, 2500);
});
document.querySelectorAll('[data-ctl]').forEach(b =>
  b.addEventListener('click', () => toast(`${b.dataset.ctl} — mock control only`)));

// transfer modal (mock)
function openTransfer() {
  $('transfer-modal').hidden = false;
  $('modal-scrim').hidden = false;
}
function closeTransfer() {
  $('transfer-modal').hidden = true;
  $('modal-scrim').hidden = true;
  $('transfer-target').value = '';
  $('transfer-preview').hidden = true;
  $('transfer-preview-btn').disabled = true;
  $('transfer-confirm').disabled = true;
  $('transfer-status').textContent = '';
}
$('transfer-close').addEventListener('click', closeTransfer);
$('modal-scrim').addEventListener('click', closeTransfer);
$('transfer-target').addEventListener('change', (e) => {
  $('transfer-preview-btn').disabled = !e.target.value;
});
$('transfer-preview-btn').addEventListener('click', () => {
  const p = $('transfer-preview');
  p.hidden = false;
  p.textContent = `Preview → ${$('transfer-target').value}\nfrom reader-cn @ selection\n\n${$('transfer-src').value}`;
  $('transfer-confirm').disabled = false;
});
$('transfer-confirm').addEventListener('click', () => {
  $('transfer-status').textContent = 'mock: nothing sent — real flow would POST once to the target channel';
  $('transfer-confirm').disabled = true;
});

renderEntries();
setState('live');
$('main').scrollTop = $('main').scrollHeight;
