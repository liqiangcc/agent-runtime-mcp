// Runtime viewport reconciliation (keyboard/stale aware) — Issue #128 port
// of the frozen prototype model (v15, incl. the #111 standalone shell floor).
// iOS standalone can report a stale/undersized visualViewport.height, so no
// single source is trusted blindly. A candidate set is sampled on every
// lifecycle transition; the keyboard heuristic decides whether
// visualViewport is authoritative (keyboard open) or must be rejected in
// favour of the larger stable layout viewport (no keyboard).
// Safe-area is applied exactly once via env() padding on the composer —
// never folded into --app-vh. Re-measurement is a pure style write and
// never touches transcript/scroll/stream/drawer/composer state.

const DIAG = []; // bounded ring buffer for ?debug / diagnostics copy
const DIAG_MAX = 120;
let composing = false;
let composerEl = null;
let textEl = null;

function diagPush(ev, extra = {}) {
  if (DIAG.length >= DIAG_MAX) DIAG.shift();
  const vv = window.visualViewport || {};
  const comp = composerEl ? composerEl.getBoundingClientRect() : { top: 0, bottom: 0 };
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
    composing, draftLen: textEl ? textEl.value.length : 0,
    kbInset: Math.round(kbInset()),
    sy: windowScrollY(),
    ...extra,
  });
}

// Canonical shell model (frozen v15):
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
// px; anything under this is status-bar/accessory/rounding noise (the
// real-device launch gap was 68px) and means CLOSED.
const KB_MIN = 120;
// #111 root cause (real-device HUD): at standalone cold launch WebKit
// reports innerHeight/clientHeight/visualViewport ALL ~68px short while the
// canvas is painted full-screen, so the shell stops short of the bottom.
// No page metric can see it; iOS corrects the metrics only on the first
// touch. In standalone the web view covers the whole screen, so
// screen.{height,width} is the truth — this is the standalone shell floor.
function screenExtent() {
  const s = window.screen;
  if (!s || !s.height || !s.width) return 0;
  const portrait = screen.orientation
    ? screen.orientation.type.startsWith('portrait')
    : window.innerHeight >= window.innerWidth;
  return portrait ? Math.max(s.height, s.width) : Math.min(s.height, s.width);
}
// accept the screen extent only for a plausible chrome-sized gap
const SCREEN_GAP_MAX = 160;
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
// keyboard-induced layout-viewport scroll: iOS scrolls the window to reveal
// the caret and only unscrolls on blur.
function windowScrollY() {
  return Math.round(window.scrollY || window.visualViewport?.pageTop || document.scrollingElement?.scrollTop || 0);
}
function editableFocused() {
  const ae = document.activeElement;
  return ae === textEl || ae === document.getElementById('term-input');
}
let kbSuppressed = false;            // editable blurred → no keyboard, even if vv still reports shrunk
function applyViewport(ev, { allowShrink = false, dismissKb = false } = {}) {
  if (editableFocused()) kbSuppressed = false;
  else if (dismissKb) kbSuppressed = true;
  let live = Math.max(window.innerHeight, document.documentElement.clientHeight);
  // standalone = full-screen web view: the screen extent is the floor for
  // the shell height, regardless of what stale metrics WebKit reports.
  const sh = isStandalone() ? screenExtent() : 0;
  if (sh > live && sh - live <= SCREEN_GAP_MAX) live = sh;
  if (!isStandalone() || allowShrink || live > committedVh || !committedVh)
    committedVh = live;
  const rawKb = kbInset();
  // the inset commits only for a real occlusion (> KB_MIN) AND only while
  // an editable is focused — a soft keyboard cannot be up otherwise, so a
  // launch-time vv/innerHeight mismatch can never become a phantom inset.
  const kb = Math.round((kbSuppressed || !editableFocused()) ? 0 : (rawKb > KB_MIN ? rawKb : 0));
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
  diagPush(ev, { src: isStandalone() ? 'layout-asym' : 'layout', kbInset: kb, committedVh, sh, sy, unscrolled });
  if (vpDebug) {
    const vv = window.visualViewport;
    const compBot = composerEl ? Math.round(composerEl.getBoundingClientRect().bottom) : 0;
    // dead is measured against the screen extent when standalone: that is
    // the value the user actually sees (innerHeight itself can be stale)
    const ref = sh || window.innerHeight;
    vpDebug.textContent =
      `vh=${committedVh} ih=${window.innerHeight} ch=${document.documentElement.clientHeight} vvH=${Math.round(vv?.height ?? -1)} sh=${sh} ` +
      `kb=${kb} sy=${sy} compBot=${compBot} dead=${ref - compBot} ` +
      `focus=${document.activeElement?.id || '-'} ${ev}`;
  }
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

function setHud(on) {
  if (on && !vpDebug) {
    vpDebug = document.createElement('div');
    vpDebug.id = 'vp-debug';
    document.body.appendChild(vpDebug);
    applyViewport('hud');
  } else if (!on && vpDebug) { vpDebug.remove(); vpDebug = null; }
  try { localStorage.setItem('vpHud', on ? '1' : ''); } catch { /* ignore */ }
}

/**
 * Wire the frozen viewport model to the live shell. scrollEl is the
 * conversation scroller (interaction-flush source). Returns the controls the
 * app needs: diagPush (IME/send instrumentation), setComposing (IME guard),
 * setHud (overflow menu), copyDiag (bounded ring export — draft length only).
 */
export function initViewport({ composer, text, scroll }) {
  composerEl = composer;
  textEl = text;
  const params = new URLSearchParams(location.search);
  if (params.get('display') === 'standalone') document.body.classList.add('standalone-sim');

  document.addEventListener('pointerdown', () => flushReconcile('pointerdown'), { passive: true, capture: true });
  document.addEventListener('touchstart', () => flushReconcile('touchstart'), { passive: true, capture: true });
  scroll.addEventListener('scroll', () => flushReconcile('scroll'), { passive: true });
  window.addEventListener('pageshow', () => syncAppVh('pageshow', { reset: true }));
  window.addEventListener('resize', () => syncAppVh('resize'));
  window.addEventListener('orientationchange', () => syncAppVh('orientation', { reset: true }));
  window.visualViewport?.addEventListener('resize', () => syncAppVh('vv.resize'));
  window.visualViewport?.addEventListener('scroll', () => syncAppVh('vv.scroll'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAppVh('visible', { reset: true }); });

  let hudWanted = !!params.get('debug');
  try { hudWanted = hudWanted || localStorage.getItem('vpHud') === '1'; } catch { /* ignore */ }
  if (hudWanted) setHud(true);
  diagPush('boot');
  syncAppVh('boot');
  // launch settle (#111): iOS standalone can report a stale (smaller)
  // innerHeight / vv.height at first paint and correct it later WITHOUT any
  // event — the asymmetric model grows on the next sample, so give it
  // samples during the first seconds instead of waiting for a touch.
  for (const ms of [80, 200, 400, 700, 1000, 1500, 2200, 3000, 4500]) setTimeout(() => applyViewport(`launch+${ms}`), ms);
  window.addEventListener('load', () => syncAppVh('load'));
}

export {
  diagPush,
  setHud,
  startKbWatch,
  syncAppVh,
  isStandalone,
  screenExtent,
};

export function setComposing(v) { composing = v; }

/** Bounded diagnostics export — timestamps/events, viewport candidates,
 *  focus+composition flags, draft LENGTH only (never draft content). */
export function copyDiag() {
  diagPush('diag-copy');
  return JSON.stringify(DIAG, null, 1);
}
