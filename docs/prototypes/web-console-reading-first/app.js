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
  // CURSOR_EXPIRED is no longer scripted into the default reply — inject it
  // on demand via ⋯ → Demo states → "CURSOR_EXPIRED armed" (stream-expire).
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
const params = new URLSearchParams(location.search);
// ?display=standalone — preview shim for reviewers (real standalone is
// detected via the display-mode media query; this only mirrors its CSS).
if (params.get('display') === 'standalone') document.body.classList.add('standalone-sim');

// ---- runtime viewport reconciliation (keyboard/stale aware) ----
// iOS standalone can report a stale/undersized visualViewport.height, so
// we never trust one source blindly. A candidate set is sampled on every
// lifecycle transition; the keyboard heuristic decides whether
// visualViewport is authoritative (keyboard open) or must be rejected in
// favour of the larger stable layout viewport (no keyboard).
// Safe-area is applied exactly once via env() padding on the composer —
// never folded into --app-vh. Re-measurement is a pure style write and
// never touches transcript/scroll/stream/drawer/composer state.
const DIAG = []; // bounded ring buffer for ?debug / diagnostics copy
const DIAG_MAX = 120;
let composing = false;

function diagPush(ev, extra = {}) {
  if (DIAG.length >= DIAG_MAX) DIAG.shift();
  const vv = window.visualViewport || {};
  const comp = document.getElementById('composer').getBoundingClientRect();
  DIAG.push({
    t: new Date().toISOString().slice(11, 23), ev,
    vvH: Math.round(vv.height || 0), vvOT: Math.round(vv.offsetTop || 0), vvPT: Math.round(vv.pageTop || 0),
    ih: window.innerHeight, ch: document.documentElement.clientHeight,
    shellH: Math.round(document.body.getBoundingClientRect().height),
    compTop: Math.round(comp.top), compBot: Math.round(comp.bottom),
    dead: Math.round(window.innerHeight - comp.bottom),
    standalone: matchMedia('(display-mode: standalone)').matches,
    orient: screen.orientation ? screen.orientation.type : `${window.orientation}`,
    focus: document.activeElement?.id || document.activeElement?.tagName || '',
    composing, draftLen: $('composer-text') ? $('composer-text').value.length : 0,
    kbInset: Math.round(kbInset()),
    sy: windowScrollY(),
    ...extra,
  });
}

// Canonical shell model (v15):
// - --app-vh commits ASYMMETRICALLY in standalone: grows freely, shrinks
//   ONLY on explicit lifecycle resets (pageshow / orientationchange /
//   visibility→visible). Keyboard-path events can never shrink the
//   shell — iOS standalone shrinks AND restores innerHeight/clientHeight
//   silently, so a smaller live value is never trusted on those paths.
//   Non-standalone (browser) keeps natural both-direction tracking.
// - --kb-inset = max(0, canonicalShell − (vv.height + vv.offsetTop)),
//   committed only while an editable is focused OR a shrink transition
//   is observed; focusout of the editable clears it immediately.
// - Interaction-flush: any pointerdown/touchstart/scroll (debounced)
//   schedules bounded re-samples (rAF/250ms/600ms) — iOS flushes stale
//   viewport metrics on user interaction, healing stale commits without
//   needing a specific event. Not gated on kbOpen.
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true ||
  document.body.classList.contains('standalone-sim');
let vpDebug = null;
let committedVh = 0;                 // canonical shell height
let kbOpen = false, kbWatch = 0;
// #111 — the keyboard threshold. Real soft keyboards occlude hundreds of
// px; anything under this is accessory/rounding noise and means CLOSED.
const KB_MIN = 40;
function stopKbWatch() { clearInterval(kbWatch); kbWatch = 0; }
function startKbWatch() {
  // state-owned polling while the keyboard is believed open OR an
  // editable keeps focus (iOS standalone can hide the keyboard without
  // blurring the field and without firing any viewport event). Each tick
  // re-samples; applyViewport decides closed/open from live metrics.
  if (kbWatch) return;
  kbWatch = setInterval(() => {
    applyViewport('kbwatch');
    if (!kbOpen && !editableFocused()) stopKbWatch();
  }, 300);
}
function kbInset() {
  const vv = window.visualViewport;
  return vv ? Math.max(0, committedVh - (vv.height + vv.offsetTop)) : 0;
}
// keyboard-induced layout-viewport scroll (#111 root cause candidate):
// iOS scrolls the window to reveal the caret and only unscrolls on blur.
function windowScrollY() {
  return Math.round(window.scrollY || window.visualViewport?.pageTop || document.scrollingElement?.scrollTop || 0);
}
function editableFocused() {
  const ae = document.activeElement;
  return ae === $('composer-text') || ae === $('term-input');
}
let kbSuppressed = false;            // editable blured → no keyboard, even if vv still reports shrunk
function applyViewport(ev, { allowShrink = false, dismissKb = false } = {}) {
  if (editableFocused()) kbSuppressed = false;
  else if (dismissKb) kbSuppressed = true;
  const live = Math.max(window.innerHeight, document.documentElement.clientHeight);
  if (!isStandalone() || allowShrink || live > committedVh || !committedVh)
    committedVh = live;
  const rawKb = kbInset();
  // the inset commits only for a real occlusion (> KB_MIN) — focus alone
  // no longer keeps a small residual inset alive; blur suppresses it.
  const kb = Math.round(kbSuppressed ? 0 : (rawKb > KB_MIN ? rawKb : 0));
  document.documentElement.style.setProperty('--app-vh', `${committedVh}px`);
  document.documentElement.style.setProperty('--kb-inset', `${kb}px`);
  kbOpen = kb > 2;
  // keyboard closed (or nothing focused) but the window is still scrolled
  // by the keyboard reveal → put the layout viewport back. Never while the
  // keyboard is open: iOS owns that scroll to keep the caret visible.
  const sy = windowScrollY();
  let unscrolled = false;
  if (!kbOpen && sy > 0) { window.scrollTo(0, 0); unscrolled = true; }
  if (kbOpen || editableFocused()) startKbWatch(); else stopKbWatch();
  diagPush(ev, { src: isStandalone() ? 'layout-asym' : 'layout', kbInset: kb, committedVh, sy, unscrolled });
  if (vpDebug) vpDebug.textContent =
    `vh=${committedVh} kb=${kb} sy=${sy} dead=${Math.round(committedVh - document.getElementById('composer').getBoundingClientRect().bottom)}`;
}
let vhTimer = 0, vhRaf = 0;
function syncAppVh(ev, { reset = false, dismissKb = false } = {}) {
  if (reset) { // explicit lifecycle reset — shrink IS allowed here
    document.documentElement.style.removeProperty('--app-vh');
    document.documentElement.style.removeProperty('--kb-inset');
    committedVh = 0;
  }
  clearTimeout(vhTimer);
  const opts = { allowShrink: reset, dismissKb };
  if (!vhRaf) vhRaf = requestAnimationFrame(() => { vhRaf = 0; applyViewport(ev + ':raf', opts); });
  vhTimer = setTimeout(() => applyViewport(ev + ':settle', opts), 240);
}
// interaction-flush: iOS flushes stale viewport metrics on interaction;
// debounced delayed samples re-read everything — heals stale commits
// whether or not the keyboard was ever believed open.
let flushTimer = 0;
function flushReconcile(ev) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    applyViewport(ev + ':rAF');
    setTimeout(() => applyViewport(ev + ':+250'), 250);
    setTimeout(() => applyViewport(ev + ':+600'), 600);
  }, 60);
}
document.addEventListener('pointerdown', () => flushReconcile('pointerdown'), { passive: true, capture: true });
document.addEventListener('touchstart', () => flushReconcile('touchstart'), { passive: true, capture: true });
document.getElementById('main').addEventListener('scroll', () => flushReconcile('scroll'), { passive: true });
window.addEventListener('pageshow', () => syncAppVh('pageshow', { reset: true }));
window.addEventListener('resize', () => syncAppVh('resize'));
window.addEventListener('orientationchange', () => syncAppVh('orientation', { reset: true }));
window.visualViewport?.addEventListener('resize', () => syncAppVh('vv.resize'));
window.visualViewport?.addEventListener('scroll', () => syncAppVh('vv.scroll'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAppVh('visible', { reset: true }); });
// ?debug=viewport — live measurement readout for real-device capture
if (params.get('debug')) {
  vpDebug = document.createElement('div');
  vpDebug.id = 'vp-debug';
  document.body.appendChild(vpDebug);
}
diagPush('boot');
syncAppVh('boot');
const profile = params.get('agent') || 'generic';
const adapter = window.Adapters[profile] || window.Adapters.generic;
const entries = profile === 'devin' ? DEVIN_ENTRIES : GENERIC_ENTRIES;
$('profile-label').textContent = adapter.label;
$('focus-item').hidden = profile !== 'devin';
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
  const body = document.createElement('div');
  body.className = 'entry-body';
  let statusEl;
  if (e.kind === 'user') {
    // compact bubble, no meta chrome — transport state is a subtle
    // right-aligned caption beneath the bubble, never a banner/card
    statusEl = document.createElement('div');
    statusEl.className = 'entry-status turn-status';
    div.appendChild(body);
    div.appendChild(statusEl);
  } else {
    const label = e.kind === 'control' ? 'control' : $('session-name').textContent;
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.innerHTML = `<span class="sent-label">${label}</span><span>${e.time}</span>`;
    statusEl = document.createElement('span');
    statusEl.className = 'entry-status';
    meta.appendChild(statusEl);
    div.appendChild(meta);
    div.appendChild(body);
    if (e.kind === 'output') {
      // lightweight per-answer actions (copy exact source text / raw view)
      const acts = document.createElement('div');
      acts.className = 'msg-actions';
      const copy = document.createElement('button');
      copy.type = 'button'; copy.title = 'Copy message';
      copy.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      copy.addEventListener('click', () => {
        navigator.clipboard?.writeText(e.text).then(() => toast('copied'));
      });
      const raw = document.createElement('button');
      raw.type = 'button'; raw.textContent = 'raw'; raw.title = 'Raw transcript';
      raw.addEventListener('click', () => showRaw());
      acts.append(copy, raw);
      div.appendChild(acts);
    }
  }
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
  // attaching keeps the strip visible for an in-place interrupted →
  // re-observing → live transition (no vanish/rebuild).
  rec.hidden = !(r || state === 'attaching');
  $('rec-detail').hidden = true;
  $('rec-more').setAttribute('aria-expanded', 'false');
  if (r) {
    rec.className = r.cls;
    $('rec-title').textContent = r.title;
    $('rec-detail').textContent = r.detail;
    $('reobserve').disabled = false;
    $('reobserve').textContent = 'Re-observe';
    $('rec-more').hidden = false;
  } else if (state === 'attaching') {
    rec.className = 'attaching';
    $('rec-title').textContent = 'Re-observing…';
    $('reobserve').disabled = true;
    $('reobserve').textContent = 'Attaching…';
    $('rec-more').hidden = true;
  }
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 1800);
}

// focus mode (devin adapter only) — secondary affordance in overflow menu
function toggleFocus() {
  document.body.classList.toggle('focus');
  $('focus-item').textContent = document.body.classList.contains('focus') ? 'Exit focus mode' : 'Focus mode';
}

// ---- sessions drawer (canvas-translation model) ----
// The drawer is a fixed surface beneath the app; opening translates the
// whole conversation canvas right with a rounded leading corner — the
// transcript is never rebuilt or disturbed.
const drawerEl = $('drawer'), scrimEl = $('drawer-scrim'), canvasEl = $('canvas');

function drawerOpen() { return document.body.classList.contains('drawer-open'); }
function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  scrimEl.hidden = !open;
}
function drawerW() { return drawerEl.getBoundingClientRect().width || 300; }

// ---- swipe session navigation ----
// Swipe-right on the reading area slides the canvas open; swipe-left on the
// drawer or exposed canvas strip closes it. Clear horizontal intent only;
// vertical scroll, local scrollers and interactive surfaces always win.
// The outermost 28px of the left edge is a guard zone (iOS back gesture).
const EDGE_GUARD = 28;
const INTENT_PX = 14;
const INTENT_RATIO = 1.6;
const VELOCITY = 0.45; // px/ms flick threshold
let swipe = null;

document.addEventListener('pointerdown', (e) => {
  if (swipe || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (window.getSelection()?.toString()) return;
  if (drawerOpen()) {
    if (e.target.closest('#drawer') || e.target.closest('#drawer-scrim'))
      swipe = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, lx: e.clientX, lt: e.timeStamp, mode: 'maybe', dir: 'close' };
    return;
  }
  if (!e.target.closest('#main')) return;
  if (e.clientX < EDGE_GUARD) return;
  if (e.target.closest('pre, .md-table, #raw-view, textarea, input, select, a, button, summary, #terminal-sheet')) return;
  swipe = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, lx: e.clientX, lt: e.timeStamp, mode: 'maybe', dir: 'open' };
});

document.addEventListener('pointermove', (e) => {
  if (!swipe || !e.isPrimary) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  swipe.vx = (e.clientX - swipe.lx) / Math.max(1, e.timeStamp - swipe.lt);
  swipe.lx = e.clientX; swipe.lt = e.timeStamp;
  if (swipe.mode === 'maybe') {
    if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { swipe = null; return; }
    if (swipe.dir === 'open' && dx > INTENT_PX && dx > INTENT_RATIO * Math.abs(dy)) swipe.mode = 'drag';
    else if (swipe.dir === 'close' && dx < -INTENT_PX && -dx > INTENT_RATIO * Math.abs(dy)) swipe.mode = 'drag';
    else if (Math.abs(dx) > 14 || Math.abs(dy) > 14) { swipe = null; return; }
    else return;
    canvasEl.classList.add('dragging');
    drawerEl.classList.add('dragging');
    canvasEl.style.transition = 'none';
  }
  const W = drawerW();
  const t = swipe.dir === 'open'
    ? Math.max(0, Math.min(W, dx))
    : Math.max(0, Math.min(W, W + dx));
  canvasEl.style.transform = `translateX(${t}px)`;
});

function endSwipe(e, cancelled) {
  if (!swipe) return;
  const s = swipe;
  swipe = null;
  canvasEl.classList.remove('dragging');
  drawerEl.classList.remove('dragging');
  canvasEl.style.transition = '';
  canvasEl.style.transform = '';
  if (s.mode !== 'drag') return;
  const dx = cancelled ? 0 : e.clientX - s.x0;
  const v = cancelled ? 0 : (s.vx || 0);
  const W = drawerW();
  if (s.dir === 'open') setDrawer(dx > W * 0.35 || v > VELOCITY);
  else setDrawer(!(dx < -W * 0.25 || v < -VELOCITY));
}
document.addEventListener('pointerup', (e) => endSwipe(e, false));
document.addEventListener('pointercancel', (e) => endSwipe(e, true));

$('drawer-btn').addEventListener('click', () => setDrawer(true));
$('drawer-scrim').addEventListener('click', () => setDrawer(false));
$('drawer-search').addEventListener('click', () => toast('session search — mock affordance only'));
$('new-session').addEventListener('click', () => toast('new session — mock affordance only'));
$('session-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('.session');
  if (!li) return;
  document.querySelectorAll('.session').forEach(s => s.classList.remove('active'));
  li.classList.add('active');
  $('session-name').textContent = li.querySelector('.s-name').textContent;
  setDrawer(false);
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
  if (act === 'focus') toggleFocus();
  else if (act === 'raw') showRaw();
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
  else if (act === 'fullscreen') {
    // Optional user-triggered enhancement only — we never script-hide
    // browser chrome, and failure must not disturb session state.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen)
      document.documentElement.requestFullscreen().catch(() => toast('fullscreen not available here'));
    else toast('fullscreen not supported on this browser');
  }
  else if (act === 'diag-copy') {
    diagPush('diag-copy');
    const payload = JSON.stringify(DIAG, null, 1);
    (navigator.clipboard?.writeText(payload) || Promise.reject())
      .then(() => toast('diagnostics copied'))
      .catch(() => { $('raw-pre').textContent = payload; $('raw-view').hidden = false; toast('clipboard blocked — diagnostics shown in raw view'); });
  }
  else if (act === 'profile-devin') location.search = '?agent=devin';
  else if (act === 'profile-generic') location.search = '?agent=generic';
  else toast(`${act} — mock affordance only`);
});

// recovery — compact strip: details expander + explicit Re-observe;
// never auto-retry, transition happens in place in the same strip
$('rec-more').addEventListener('click', () => {
  const d = $('rec-detail');
  d.hidden = !d.hidden;
  $('rec-more').setAttribute('aria-expanded', String(!d.hidden));
});
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
// IME safety: never mutate the field (height, value) while a composition
// session is active — iOS Safari can drop/duplicate composed characters
// when layout shifts mid-composition.
ta.addEventListener('compositionstart', () => { composing = true; diagPush('compositionstart'); });
ta.addEventListener('compositionend', () => {
  composing = false;
  diagPush('compositionend');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
});
ta.addEventListener('focus', () => { diagPush('focus'); startKbWatch(); });
ta.addEventListener('blur', () => { diagPush('blur'); syncAppVh('blur', { dismissKb: true }); });
// send disc rests dimmed until there is a draft (visual only — the click
// handler still guards on the exact draft text)
const syncSendState = () => { $('send').disabled = !ta.value.trim(); };
syncSendState();
ta.addEventListener('input', () => {
  syncSendState();
  if (composing) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
});
$('send').addEventListener('click', () => {
  const text = ta.value; // exact visible draft — never trimmed/mutated
  if (!text.trim()) return;
  diagPush('send', { draftLen: text.length });
  const e = { kind: 'user', time: now(), text };
  entries.push(e);
  const wasPinned = isPinned();
  const { body, statusEl } = appendEntryDOM(e);
  window.Adapters.generic.renderBody(e, body);
  maybeFollow(wasPinned);
  ta.value = '';
  ta.style.height = 'auto';
  syncSendState();

  // at-most-once write; explicit state machine on the user turn —
  // subtle caption under the bubble, never a banner; ambiguous/failed
  // NEVER auto-retries
  statusEl.textContent = 'sending…';
  statusEl.className = 'entry-status turn-status st-sending';
  const outcome = nextSendOutcome;
  nextSendOutcome = null;
  setTimeout(() => {
    if (outcome === 'fail') {
      statusEl.textContent = '✕ failed — not sent';
      statusEl.className = 'entry-status turn-status st-failed';
      return;
    }
    if (outcome === 'ambiguous') {
      statusEl.textContent = '? timeout — may have been delivered (no auto-retry)';
      statusEl.className = 'entry-status turn-status st-ambiguous';
      return;
    }
    statusEl.textContent = '✓ delivered';
    statusEl.className = 'entry-status turn-status st-delivered';
    // mock agent reply streams in as deltas
    playStream(profile === 'devin' ? DEVIN_REPLY.slice() : GENERIC_REPLY.slice());
  }, 450);
});
// "+" opens the collapsed-by-default Advanced input panel (Stop/Enter/Esc,
// type-only toggle). Collapsed it reserves zero height.
$('composer-plus').addEventListener('click', () => {
  const adv = $('advanced');
  const open = adv.hidden;
  adv.hidden = !open;
  $('composer-plus').setAttribute('aria-expanded', String(open));
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
$('term-input').addEventListener('focus', () => { diagPush('focus'); startKbWatch(); });
$('term-input').addEventListener('blur', () => { diagPush('blur'); syncAppVh('blur', { dismissKb: true }); });
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
