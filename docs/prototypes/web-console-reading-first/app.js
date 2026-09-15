// Static prototype for Issue #90 — mock data/timers only, no backend calls.
// Shared Reading-first shell + per-agent UI adapter + generic fallback,
// with a mock streaming event source demonstrating real-time I/O.

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

// Mock Devin-format history. Activity blocks use the stable mock markers
// parsed by adapters/devin.js; everything else is agent content.
const DEVIN_ENTRIES = [
  { kind: 'user', time: '09:41', text: 'Summarize the auth module and flag any obvious issues.' },
  { kind: 'output', time: '09:41', text:
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
  { kind: 'output', time: '09:44', text:
`«run»
grep -n "refresh" src/auth/tokens.ts
«result»
12: export async function refresh(session) {
18:   } catch { return session; }

The refresh path is tokens.ts:12-18 — the catch on line 18 discards the refresh error and returns the stale session object unchanged.` },
];

// ---- mock reply streams (deltas arrive like real events; timers only) ----
const DEVIN_REPLY = [
  { d: '«thinking»\n', ms: 350 },
  { d: 'Checking the refresh path ', ms: 320 },
  { d: 'against the current test suite.\n', ms: 320 },
  { d: '\n«run»\n', ms: 420 },
  { d: 'npm test -- auth\n', ms: 500 },
  { d: '\n«result»\n', ms: 320 },
  { d: '  auth.refresh › keeps session on transient error\n', ms: 380 },
  { d: '  14 passing, 0 failing\n', ms: 380 },
  { d: '\n\n', ms: 260 },
  { d: 'The refresh path ', ms: 120 }, { d: 'swallows errors ', ms: 120 },
  { d: 'at tokens.ts:18. ', ms: 120 }, { d: 'A transient failure ', ms: 120 },
  { d: 'returns the stale ', ms: 120 },
  { expire: true }, // CURSOR_EXPIRED interrupts mid-stream; Re-observe resumes
  { d: 'session ', ms: 120 }, { d: 'unchanged — ', ms: 120 },
  { d: 'confirmed by the test above. ', ms: 120 },
  { d: 'Recommend logging the error and returning null.', ms: 160 },
];

const GENERIC_REPLY = [
  { d: 'received.\n', ms: 300 },
  { d: '$ translate next\n', ms: 420 },
  { d: 'Elle regarde ', ms: 140 }, { d: 'par la fenêtre ', ms: 140 },
  { d: 'pendant que la pluie tombe.\n', ms: 140 },
  { d: '她望着窗外，雨正在下。\n', ms: 140 },
  { expire: true },
  { d: '\nShe looks out the window ', ms: 150 },
  { d: 'while the rain falls.\n', ms: 150 },
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
const main = $('main');

// ---- profile / adapter selection (explicit mock switch, never inferred) ----
const profile = new URLSearchParams(location.search).get('agent') || 'generic';
const adapter = window.Adapters[profile] || window.Adapters.generic;
const entries = profile === 'devin' ? DEVIN_ENTRIES : GENERIC_ENTRIES;
$('profile-label').textContent = adapter.label;
$('focus-toggle').hidden = profile !== 'devin';
if (profile === 'devin') $('session-name').textContent = 'devin-auth-review';
$('composer-text').placeholder = `Message ${$('session-name').textContent}…`;

// ---- scroll: auto-follow only when pinned to bottom ----
function isPinned() {
  return main.scrollTop + main.clientHeight >= main.scrollHeight - 48;
}
function maybeFollow(wasPinned) {
  if (wasPinned) main.scrollTop = main.scrollHeight;
}

function now() { return new Date().toTimeString().slice(0, 5); }

function appendEntryDOM(e) {
  const div = document.createElement('article');
  div.className = `entry ${e.kind}`;
  const label = e.kind === 'user' ? 'you' : e.kind === 'control' ? 'control' : $('session-name').textContent;
  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  meta.innerHTML = `<span class="sent-label">${label}</span><span>${e.time}</span>`;
  const statusEl = document.createElement('span');
  statusEl.className = 'entry-status';
  meta.appendChild(statusEl);
  const body = document.createElement('div');
  body.className = 'entry-body';
  div.appendChild(meta);
  div.appendChild(body);
  messages.appendChild(div);
  return { div, body, statusEl };
}

function renderEntries() {
  messages.innerHTML = '';
  for (const e of entries) {
    const { body } = appendEntryDOM(e);
    const handled = e.kind === 'output' && adapter.renderBody
      ? safeRender(adapter, e, body)
      : false;
    if (!handled) window.Adapters.generic.renderBody(e, body);
  }
}

function safeRender(ad, e, body) {
  try { return ad.renderBody(e, body) === true; } catch { return false; }
}

// ---- mock streaming engine ----
// A stream is a list of steps: {d: text, ms: delay} deltas and {expire:true}
// interruption markers. Deltas are appended to the live entry in place.
let activeStream = null;
let expireArmed = false;
let nextSendOutcome = null; // 'fail' | 'ambiguous' | null

function playStream(steps) {
  const { body } = appendEntryDOM({ kind: 'output', time: now() });
  const live = adapter.createLive(body);
  let i = 0;
  const stream = {
    paused: false,
    resume() {
      if (!this.paused) return;
      this.paused = false;
      tick();
    },
  };
  function tick() {
    if (stream.paused || i >= steps.length) return;
    const step = steps[i++];
    if (step.expire || (expireArmed && i > 0)) {
      expireArmed = false;
      if (step.expire !== true) i--; // armed injection: replay this step after resume
      stream.paused = true;
      setState('needs_reobserve');
      return;
    }
    const wasPinned = isPinned();
    live.update(step.d);
    maybeFollow(wasPinned);
    if (i < steps.length) setTimeout(tick, step.ms);
    else { live.done(); activeStream = null; }
  }
  activeStream = stream;
  setTimeout(tick, steps[0].ms);
  return stream;
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
  else if (act === 'terminal') openTerminal();
  else if (act === 'state-live') setState('live');
  else if (act === 'state-reobserve') setState('needs_reobserve');
  else if (act === 'state-error') setState('error');
  else if (act === 'state-closed') setState('closed');
  else if (act === 'stream-expire') {
    expireArmed = true;
    toast(activeStream && !activeStream.paused
      ? 'CURSOR_EXPIRED armed — fires on next delta'
      : 'CURSOR_EXPIRED armed — fires on next stream');
  }
  else if (act === 'send-fail') { nextSendOutcome = 'fail'; toast('next send will fail (mock)'); }
  else if (act === 'send-ambiguous') { nextSendOutcome = 'ambiguous'; toast('next send will time out — ambiguous (mock)'); }
  else if (act === 'profile-devin') location.search = '?agent=devin';
  else if (act === 'profile-generic') location.search = '?agent=generic';
  else toast(`${act} — mock affordance only`);
});

// recovery — explicit Re-observe resumes the interrupted stream; never auto-retry
$('reobserve').addEventListener('click', () => {
  setState('attaching');
  setTimeout(() => {
    setState('live');
    toast('re-observed (mock)');
    if (activeStream?.paused) activeStream.resume();
  }, 900);
});

// raw transcript — always the unmodified source text
function showRaw() {
  $('raw-pre').textContent = entries.map(e => `[${e.time}] <${e.kind}> ${e.text}`).join('\n\n');
  $('raw-view').hidden = false;
}
$('raw-close').addEventListener('click', () => { $('raw-view').hidden = true; });

// ---- composer: typing is local-only; Send is the ONLY mutation boundary ----
const ta = $('composer-text');
ta.addEventListener('input', () => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
});
$('send').addEventListener('click', () => {
  const text = ta.value.trim();
  if (!text) return;
  const e = { kind: 'user', time: now(), text };
  entries.push(e);
  const wasPinned = isPinned();
  const { body, statusEl } = appendEntryDOM(e);
  window.Adapters.generic.renderBody(e, body);
  maybeFollow(wasPinned);
  ta.value = '';
  ta.style.height = 'auto';

  // at-most-once write; explicit state machine on the user turn
  statusEl.textContent = 'sending…';
  statusEl.className = 'entry-status st-sending';
  const outcome = nextSendOutcome;
  nextSendOutcome = null;
  setTimeout(() => {
    if (outcome === 'fail') {
      statusEl.textContent = 'failed — not sent';
      statusEl.className = 'entry-status st-failed';
      return;
    }
    if (outcome === 'ambiguous') {
      statusEl.textContent = 'timeout — ambiguous; may have been delivered (no auto-retry)';
      statusEl.className = 'entry-status st-ambiguous';
      return;
    }
    statusEl.textContent = 'delivered';
    statusEl.className = 'entry-status st-delivered';
    // mock agent reply streams in as deltas
    playStream(profile === 'devin' ? DEVIN_REPLY.slice() : GENERIC_REPLY.slice());
  }, 450);
});
document.querySelectorAll('[data-ctl]').forEach(b =>
  b.addEventListener('click', () => toast(`${b.dataset.ctl} — mock control only`)));

// ---- terminal sheet (Advanced): the only per-keystroke streaming path ----
function openTerminal() {
  $('terminal-sheet').hidden = false;
  $('modal-scrim').hidden = false;
  $('term-input').focus();
}
function closeTerminal() {
  $('terminal-sheet').hidden = true;
  $('modal-scrim').hidden = true;
}
$('terminal-close').addEventListener('click', closeTerminal);
$('term-input').addEventListener('input', (e) => {
  // each keystroke is its own mock frame
  $('term-pane').textContent = '$ ' + e.target.value;
});

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
$('modal-scrim').addEventListener('click', () => { closeTransfer(); closeTerminal(); });
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
main.scrollTop = main.scrollHeight;
