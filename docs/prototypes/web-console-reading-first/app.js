// Static prototype for Issue #90 — mock data only, no backend calls.
// Shared Reading-first shell + per-agent UI adapter + generic fallback.

const GENERIC_ENTRIES = [
  { kind: 'user', time: '10:14', text: 'Read the next paragraph and translate each sentence, one at a time.' },
  { kind: 'output', time: '10:14', text: 'Le renard brun rapide saute par-dessus le chien paresseux.\n敏捷的棕色狐狸跳过了懒狗。\n\nThe quick brown fox jumps over the lazy dog.' },
  { kind: 'user', time: '10:15', text: 'Next sentence.' },
  { kind: 'output', time: '10:15', text: 'Il court à travers la forêt silencieuse alors que le soleil se lève.\n它穿过寂静的森林，此时太阳刚刚升起。\n\nIt runs through the silent forest as the sun rises.' },
  { kind: 'control', time: '10:15', text: '[control] INTERRUPT — reading paused by operator' },
  { kind: 'output', time: '10:15', text: '(paused — 2 of 9 sentences delivered)' },
  { kind: 'user', time: '10:16', text: 'Continue reading.' },
  { kind: 'output', time: '10:16', text: 'Les oiseaux chantent doucement dans les branches au-dessus de lui.\n鸟儿在它头顶的树枝上轻声歌唱。\n\nBirds sing softly in the branches above it.' },
];

// Mock Devin-format conversation. Activity blocks use the stable mock
// markers parsed by adapters/devin.js; everything else is agent content.
const DEVIN_ENTRIES = [
  { kind: 'user', time: '09:41', text: 'Summarize the auth module and flag any obvious issues.' },
  { kind: 'output', time: '09:41', agent: true, text:
`«thinking»
I should map the module layout first, then read the session and token files before summarizing.
«run»
ls src/auth && wc -l src/auth/*.ts
«result»
middleware.ts  session.ts  tokens.ts  index.ts
 214 src/auth/middleware.ts
 188 src/auth/session.ts
  96 src/auth/tokens.ts
  40 src/auth/index.ts
«read»
src/auth/session.ts
«result»
export function verifySession(token) {
  const claims = decode(token);
  if (claims.exp < now()) return null;
  ...
}
«thinking»
Token expiry is enforced in session.ts, but the refresh path in tokens.ts swallows refresh errors and returns the stale session — that is the main issue worth flagging.

The auth module is small (~540 LOC) and centered on session.ts. Verification correctly rejects expired tokens, but tokens.ts swallows refresh failures and silently returns the stale session — an obvious issue worth fixing. middleware.ts is thin and delegates cleanly.` },
  { kind: 'user', time: '09:44', text: 'Show me the exact refresh path.' },
  { kind: 'output', time: '09:44', agent: true, text:
`«run»
grep -n "refresh" src/auth/tokens.ts
«result»
12: export async function refresh(session) {
18:   } catch { return session; }

The refresh path is tokens.ts:12-18 — the catch on line 18 discards the refresh error and returns the stale session object unchanged.` },
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

// ---- profile / adapter selection (explicit mock switch, never inferred) ----
const profile = new URLSearchParams(location.search).get('agent') || 'generic';
const adapter = window.Adapters[profile] || window.Adapters.generic;
const entries = profile === 'devin' ? DEVIN_ENTRIES : GENERIC_ENTRIES;
$('profile-label').textContent = adapter.label;
$('focus-toggle').hidden = profile !== 'devin';
if (profile === 'devin') $('session-name').textContent = 'devin-auth-review';
$('composer-text').placeholder = `Message ${$('session-name').textContent}…`;

function renderEntries() {
  messages.innerHTML = '';
  for (const e of entries) {
    const div = document.createElement('article');
    div.className = `entry ${e.kind}`;
    const label = e.kind === 'user' ? 'you' : e.kind === 'control' ? 'control' : $('session-name').textContent;
    div.innerHTML = `<div class="entry-meta"><span class="sent-label">${label}</span><span>${e.time}</span></div>`;
    const body = document.createElement('div');
    body.className = 'entry-body';
    // Adapter parse failure must fall back to generic — never drop content.
    const handled = e.kind === 'output' && adapter.renderBody
      ? safeRender(adapter, e, body)
      : false;
    if (!handled) window.Adapters.generic.renderBody(e, body);
    div.appendChild(body);
    messages.appendChild(div);
  }
}

function safeRender(ad, e, body) {
  try { return ad.renderBody(e, body) === true; } catch { return false; }
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

// focus mode (devin adapter only)
$('focus-toggle').addEventListener('click', () => {
  document.body.classList.toggle('focus');
  $('focus-toggle').textContent = document.body.classList.contains('focus') ? 'Full trace' : 'Focus';
});

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
  else if (act === 'profile-devin') location.search = '?agent=devin';
  else if (act === 'profile-generic') location.search = '?agent=generic';
  else toast(`${act} — mock affordance only`);
});

// recovery
$('reobserve').addEventListener('click', () => {
  setState('attaching');
  setTimeout(() => { setState('live'); toast('re-observed (mock)'); }, 900);
});

// raw transcript — always the unmodified source text
function showRaw() {
  $('raw-pre').textContent = entries.map(e => `[${e.time}] <${e.kind}> ${e.text}`).join('\n\n');
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
  entries.push({ kind: 'user', time: new Date().toTimeString().slice(0, 5), text });
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
  p.textContent = `Preview → ${$('transfer-target').value}\nfrom ${$('session-name').textContent} @ selection\n\n${$('transfer-src').value}`;
  $('transfer-confirm').disabled = false;
});
$('transfer-confirm').addEventListener('click', () => {
  $('transfer-status').textContent = 'mock: nothing sent — real flow would POST once to the target channel';
  $('transfer-confirm').disabled = true;
});

renderEntries();
setState('live');
$('main').scrollTop = $('main').scrollHeight;
