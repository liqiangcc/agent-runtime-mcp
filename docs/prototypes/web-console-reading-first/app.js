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
  { kind: 'user', time: '09:47', text: 'Write it up as a formatted report.' },
  { kind: 'output', time: '09:47', text:
`«thinking»
I'll write the report with headings, a findings table, and a short fix list — keeping it readable on mobile.

# Auth Module Review 认证模块审查

## Summary 概述

The **auth module** (~540 LOC) centers on \`session.ts\`. 验证逻辑正确拒绝过期 token, but the *refresh path* silently degrades.

> Token expiry is enforced; refresh failures are swallowed — the caller cannot tell a stale session from a fresh one.

## Findings 发现

| Area | Status | Note |
| --- | --- | --- |
| Expiry check | pass | rejects expired tokens |
| Refresh path | issue | swallows errors at \`tokens.ts:18\` |
| Middleware | pass | thin delegation, clean |

### Details

1. Verify path is correct — \`verifySession()\` returns null on expiry.
2. Refresh path returns the **stale session** on error.
   - nested: the catch discards the original error
   - nested: no metric or log line is emitted
3. See [tokens.ts on GitHub](https://github.com/example/repo/blob/main/src/auth/tokens.ts) for the exact code.

#### Suggested fix

\`\`\`ts
} catch (err) {
  log.warn('refresh failed', { err });
  return null;
}
\`\`\`

- [x] Document the silent-refresh behavior
- [ ] Fix \`tokens.ts:18\` error swallowing
- [ ] Add a refresh-failure metric

---

A deliberately long token for wrap testing: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c and a long link https://example.com/some/very/long/path/with/many/segments/and?query=params&more=stuff to verify safe wrapping.` },
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
  // markdown answer streams in; constructs are unclosed mid-flight
  { d: '## Test Report\n\n', ms: 130 },
  { d: 'All **14 tests** pass ', ms: 130 }, { d: '— 全部通过。\n\n', ms: 130 },
  { d: '- `auth.refresh` keeps the session\n', ms: 130 },
  { d: '- `session.verify` rejects expiry\n\n', ms: 130 },
  { d: '```\n$ npm test -- auth\n', ms: 200 },
  { d: '  14 passing, 0 failing\n', ms: 250 },
  { expire: true }, // CURSOR_EXPIRED interrupts mid-stream (fence still unclosed); Re-observe resumes
  { d: '```\n\n', ms: 130 },
  { d: '| Check | Result |\n| --- | --- |\n', ms: 160 },
  { d: '| refresh | pass |\n', ms: 160 },
  { d: '| verify | pass |\n\n', ms: 160 },
  { d: 'Recommend logging the refresh error before returning `null`.', ms: 160 },
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

// ---- swipe session navigation ----
// Swipe-right on the reading area opens the drawer; swipe-left on the open
// drawer closes it. Clear horizontal intent only; vertical scroll and
// locally scrollable/interactive surfaces always win. The extreme left edge
// is a guard zone (iOS back gesture lives there — we don't fight it).
const drawerEl = $('drawer'), scrimEl = $('drawer-scrim');
const EDGE_GUARD = 28;   // px — stay out of the browser edge-gesture zone
const INTENT_PX = 14;    // horizontal intent distance
const INTENT_RATIO = 1.6;
let swipe = null;

function drawerW() { return drawerEl.getBoundingClientRect().width || 300; }

document.addEventListener('pointerdown', (e) => {
  if (swipe || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (window.getSelection()?.toString()) return;
  if (drawerEl.classList.contains('open')) {
    if (e.target.closest('#drawer') || e.target.closest('#drawer-scrim'))
      swipe = { x0: e.clientX, y0: e.clientY, mode: 'maybe', dir: 'close' };
    return;
  }
  if (!e.target.closest('#main')) return;
  if (e.clientX < EDGE_GUARD) return;
  if (e.target.closest('pre, .md-table, #raw-view, textarea, input, select, a, button, summary, #terminal-sheet')) return;
  swipe = { x0: e.clientX, y0: e.clientY, mode: 'maybe', dir: 'open' };
});

document.addEventListener('pointermove', (e) => {
  if (!swipe || !e.isPrimary) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  if (swipe.mode === 'maybe') {
    if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { swipe = null; return; }
    if (swipe.dir === 'open' && dx > INTENT_PX && dx > INTENT_RATIO * Math.abs(dy)) swipe.mode = 'drag';
    else if (swipe.dir === 'close' && dx < -INTENT_PX && -dx > INTENT_RATIO * Math.abs(dy)) swipe.mode = 'drag';
    else if (Math.abs(dx) > 14 || Math.abs(dy) > 14) { swipe = null; return; } // wrong-direction gesture
    else return;
    drawerEl.style.transition = 'none';
    scrimEl.style.transition = 'none';
  }
  const W = drawerW();
  if (swipe.dir === 'open') {
    drawerEl.style.transform = `translateX(${Math.min(0, -W + dx)}px)`;
    scrimEl.hidden = false;
    scrimEl.style.opacity = Math.min(1, Math.max(0, dx / W));
  } else {
    const t = Math.max(-W, Math.min(0, dx));
    drawerEl.style.transform = `translateX(${t}px)`;
    scrimEl.style.opacity = Math.max(0, 1 + dx / W);
  }
});

function endSwipe(e, cancelled) {
  if (!swipe) return;
  const s = swipe;
  swipe = null;
  drawerEl.style.transition = '';
  scrimEl.style.transition = '';
  drawerEl.style.transform = '';
  scrimEl.style.opacity = '';
  if (s.mode !== 'drag') return;
  const dx = cancelled ? 0 : e.clientX - s.x0;
  const W = drawerW();
  if (s.dir === 'open') {
    const open = dx > W * 0.35;
    drawerEl.classList.toggle('open', open);
    scrimEl.hidden = !open;
  } else {
    const closed = dx < -W * 0.25;
    drawerEl.classList.toggle('open', !closed);
    scrimEl.hidden = closed;
  }
}
document.addEventListener('pointerup', (e) => endSwipe(e, false));
document.addEventListener('pointercancel', (e) => endSwipe(e, true));

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
$('composer-plus').addEventListener('click', () => toast('attach — mock affordance only'));
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
