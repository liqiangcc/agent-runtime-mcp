// Reading surface — Issue #128 port of the frozen prototype structure,
// bound to real Channel data. Turn structure comes ONLY from
// projectConversation (compiled /modules/projection.js); program-specific
// text structure comes ONLY from the chosen Adapter. The renderer consumes
// Segment[]/Turn[]; it never re-derives boundaries, never infers the agent.
//
// Rendering rules (frozen):
// - in-place incremental: appended text feeds live nodes; existing segment
//   nodes update in place; nodes reparent into the trace summary, never
//   rebuild;
// - settle = turn.settled && adapter.settleHint(tail) !== 'busy' — the
//   caller combines observed fact with the hint;
// - adapter.parse === null → generic verbatim for that turn, visibly marked
//   'raw' (fail-open, never fabricated structure);
// - truncated segments render an honest label + Terminal View entry;
// - chrome segments render as muted structural lines — content stays
//   reachable, byte-identical truth lives in Raw transcript / Terminal View.

import { projectConversation } from '/modules/projection.js';
import { genericAdapter } from '/modules/adapter.js';
import { devinAdapter } from '/modules/devin-adapter.js';

const ADAPTERS = { generic: genericAdapter, devin: devinAdapter };

const TOOL_ICON = '⏺';
const TOOL_ICON_OPEN = '○';
// last line could still be a partially-drawn grammar marker — hold it back
// rather than flash a fabricated/ambiguous segment for one frame
const ANCHOR_LEAD = /^\s*[⏺○│└❭─✱✓⠀-⣿[]/;

function previewOf(text) {
  const first = (text || '').split('\n').map((l) => l.trim()).find((l) => l) || '';
  return first.length > 64 ? `${first.slice(0, 64)}…` : first;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ---------------- generic (verbatim) turn surface ---------------- */

function genericSurface(bodyEl) {
  const pres = new Map(); // blockId -> {pre, len}
  return {
    kind: 'generic',
    ensureBlock(id) {
      if (!pres.has(id)) {
        const pre = el('pre', 'entry-body seg-raw');
        const block = el('div', 'block');
        block.appendChild(pre);
        bodyEl.appendChild(block);
        pres.set(id, { pre, len: 0, block });
      }
      return pres.get(id);
    },
    feed(id, text) {
      const b = this.ensureBlock(id);
      if (text.startsWith(b.pre.textContent)) {
        b.pre.appendChild(document.createTextNode(text.slice(b.len)));
      } else {
        b.pre.textContent = text;
      }
      b.len = text.length;
      return b.block;
    },
    settle() { /* verbatim surface has nothing to collapse */ },
  };
}

/* ---------------- devin turn surface ---------------- */

function makeChromeNode(seg) {
  if (seg.kind === 'sep') return el('hr', 'seg-chrome seg-sep');
  const label = {
    idle_prompt: '❭ prompt — idle',
    busy_prompt: '❭ prompt — guiding',
    status: 'status',
    spinner: '⠿ activity',
  }[seg.kind] || seg.kind;
  return el('div', `seg-chrome chrome-${seg.kind}`, label);
}

function makeTruncNode(seg, terminalHref) {
  const row = el('div', 'seg-trunc');
  row.append(el('span', 'seg-trunc-label', `… ${seg.lines} lines folded by the TUI — content unavailable`));
  if (terminalHref) {
    const a = el('a', 'seg-trunc-link', 'Terminal View');
    a.href = terminalHref;
    row.append(a);
  }
  return row;
}

function makeToolNode(seg) {
  const d = el('details', 'tool-card');
  if (seg.open) d.classList.add('live');
  const sum = el('summary');
  sum.append(
    el('span', 'tool-icon', seg.open ? TOOL_ICON_OPEN : TOOL_ICON),
    el('span', 'tool-title', seg.title || 'activity'),
    el('span', 'tool-preview', previewOf(seg.status || seg.body)),
  );
  const pre = el('pre', 'tool-body', seg.body + (seg.status ? `\n└ ${seg.status}` : ''));
  d.append(sum, pre);
  return d;
}

function updateToolNode(d, seg) {
  const icon = d.querySelector('.tool-icon');
  icon.textContent = seg.open ? TOOL_ICON_OPEN : TOOL_ICON;
  d.classList.toggle('live', seg.open);
  d.querySelector('.tool-title').textContent = seg.title || 'activity';
  d.querySelector('.tool-preview').textContent = previewOf(seg.status || seg.body);
  d.querySelector('.tool-body').textContent = seg.body + (seg.status ? `\n└ ${seg.status}` : '');
}

function devinSurface(bodyEl, terminalHref) {
  let acc = '';
  let rendered = []; // aligned with parsed segments
  let settledDone = false;
  let rawPre = null;
  let rawShown = false;
  const t0 = Date.now();

  function markRaw() {
    if (!rawShown) {
      rawShown = true;
      bodyEl.classList.add('raw-fallback');
      const chip = el('span', 'raw-chip', 'raw');
      chip.title = 'devin grammar not recognised — showing verbatim text';
      bodyEl.parentElement?.querySelector('.turn-head')?.appendChild(chip);
    }
    if (!rawPre) {
      rawPre = el('pre', 'entry-body seg-raw');
      bodyEl.appendChild(rawPre);
    }
  }

  function safeText() {
    if (acc.endsWith('\n')) return acc;
    const nl = acc.lastIndexOf('\n');
    const tail = acc.slice(nl + 1);
    return ANCHOR_LEAD.test(tail) ? acc.slice(0, nl + 1) : acc;
  }

  function reconcile(force) {
    const text = force ? acc : safeText();
    const segs = devinAdapter.parse(text);
    if (segs === null) {
      // fail-open: verbatim text, visibly marked raw
      markRaw();
      for (const r of rendered) r.el.remove();
      rendered = [];
      rawPre.textContent = text;
      return;
    }
    if (rawPre) { rawPre.remove(); rawPre = null; }
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (i < rendered.length && rendered[i].type === seg.type) {
        const r = rendered[i];
        if (seg.type === 'text' && r.md) r.md.setText(seg.text);
        else if (seg.type === 'tool') updateToolNode(r.el, seg);
        else if (seg.type === 'truncated') {
          // honest label stays in sync with the observed fold count
          r.el.querySelector('.seg-trunc-label').textContent =
            `… ${seg.lines} lines folded by the TUI — content unavailable`;
        }
      } else if (i >= rendered.length) {
        let node, md = null;
        if (seg.type === 'text') {
          node = el('div', 'seg-text');
          md = window.Md ? window.Md.createLive(node) : null;
          if (md) md.setText(seg.text); else node.textContent = seg.text;
        } else if (seg.type === 'tool') node = makeToolNode(seg);
        else if (seg.type === 'truncated') node = makeTruncNode(seg, terminalHref);
        else node = makeChromeNode(seg);
        bodyEl.appendChild(node);
        rendered.push({ type: seg.type, el: node, md });
      } else {
        // earlier segment changed type — rebuild tail defensively
        for (let j = i; j < rendered.length; j++) rendered[j].el.remove();
        rendered.length = i;
        i -= 1;
      }
    }
    // segments dropped from the tail (resync) — remove surplus nodes
    while (rendered.length > segs.length) rendered.pop().el.remove();
  }

  return {
    kind: 'devin',
    ensureBlock() { /* devin parses the joined turn text */ return null; },
    feed(_id, fullTurnText) {
      acc = fullTurnText; // resync-safe: reconcile re-parses acc in place
      reconcile(false);
    },
    settle() {
      if (settledDone) return;
      settledDone = true;
      reconcile(true);
      const cards = rendered.filter((r) => r.type === 'tool').map((r) => r.el);
      cards.forEach((c) => c.classList.remove('live'));
      if (!cards.length) return;
      const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
      const det = el('details', 'trace-sum');
      const sum = el('summary');
      sum.append(
        el('span', 'tool-icon', '◌'),
        el('span', 'ts-title', `Thought ${secs}s · ${cards.length} tool step${cards.length > 1 ? 's' : ''}`),
      );
      const steps = el('div', 'trace-steps');
      det.appendChild(sum);
      bodyEl.insertBefore(det, cards[0]);
      for (const c of cards) steps.appendChild(c); // MOVE, never rebuild
      det.appendChild(steps);
    },
  };
}

/* ---------------- conversation view ---------------- */

export function createConversation({ messagesEl, entryDomId, onEntryActions, getTerminalHref }) {
  const turnViews = new Map(); // key -> {el, bodyEl, surface, adapterId, settled, prevText}
  let adapterId = 'generic';

  function setAdapter(id) {
    adapterId = ADAPTERS[id] ? id : 'generic';
    reset();
  }

  function reset() {
    turnViews.clear();
    messagesEl.textContent = '';
  }

  function turnKey(turn) { return `turn-${turn.id}`; }

  function userCaption(user) {
    if (!user) return '';
    const bits = [];
    if (!user.submit) bits.push('sent without Enter');
    if (user.transport_result === 'ambiguous') bits.push('? timeout — may have been delivered (no auto-retry)');
    else bits.push('✓ delivered');
    return bits.join(' · ');
  }

  function buildUser(entry) {
    const wrap = el('div', 'entry user');
    wrap.id = entryDomId(entry.id);
    const bubble = el('div', 'entry-body', entry.text);
    const status = el('div', 'turn-status ' + (entry.transport_result === 'ambiguous' ? 'st-ambiguous' : 'st-delivered'), userCaption(entry));
    wrap.append(bubble, status);
    return wrap;
  }

  function buildControl(entry) {
    const label = entry.control === 'INTERRUPT' ? 'Stop' : entry.control === 'ENTER' ? 'Enter' : 'Escape';
    const row = el('div', 'control-line',
      `control: ${label} · ${entry.transport_result}${entry.transport_result === 'ambiguous' ? ' (may have been delivered)' : ''}`);
    row.id = entryDomId(entry.id);
    return row;
  }

  function buildEarlier(turn) {
    const det = el('details', 'turn earlier');
    const sum = el('summary');
    const lines = turn.earlier.text.split('\n').length;
    sum.textContent = `earlier output · ${lines} lines`;
    const pre = el('pre', 'entry-body seg-raw', turn.earlier.text);
    det.append(sum, pre);
    return det;
  }

  function ensureTurn(turn, refNode) {
    const key = turnKey(turn);
    let view = turnViews.get(key);
    if (!view) {
      const elTurn = el('article', 'turn');
      elTurn.dataset.turnId = key;
      const head = el('div', 'turn-head');
      const body = el('div', 'turn-body');
      elTurn.append(head, body);
      const terminalHref = getTerminalHref ? getTerminalHref() : null;
      const surface = adapterId === 'devin' ? devinSurface(body, terminalHref) : genericSurface(body);
      view = { el: elTurn, bodyEl: body, surface, adapterId, settled: false, prevText: '', controls: new Map() };
      turnViews.set(key, view);
      messagesEl.insertBefore(elTurn, refNode);
    }
    return view;
  }

  function updateTurn(view, turn) {
    // user bubble + transport caption — rebuilt only when the entry changed
    if (turn.user) {
      const sig = `${turn.user.text}${turn.user.submit}${turn.user.transport_result}`;
      if (view.userSig !== sig) {
        view.userSig = sig;
        const existing = view.el.querySelector('.entry.user');
        const fresh = buildUser(turn.user);
        if (existing) existing.replaceWith(fresh); else view.el.insertBefore(fresh, view.el.firstChild);
        onEntryActions?.(fresh, turn.user);
      }
    }
    // control lines in order
    for (const ctl of turn.controls) {
      let row = view.controls.get(ctl.id);
      const fresh = buildControl(ctl);
      if (row) { row.replaceWith(fresh); } else { view.el.appendChild(fresh); }
      view.controls.set(ctl.id, fresh);
    }
    // output surface: feed joined block text (append-only fast path)
    const fullText = turn.blocks.map((b) => b.text).join('\n');
    if (view.surface.kind === 'generic') {
      // feed is incremental; run it ungated so block lifecycle state also
      // refreshes when text did not change (paused → closed on next send)
      for (const b of turn.blocks) {
        const blockEl = view.surface.feed(b.id, b.text);
        if (blockEl) {
          blockEl.dataset.state = b.state;
          if (!blockEl.dataset.entryId) {
            blockEl.dataset.entryId = String(b.id);
            blockEl.id = entryDomId(b.id);
            onEntryActions?.(blockEl, b);
          }
        }
      }
      view.prevText = fullText;
    } else if (fullText !== view.prevText) {
      const lastBlock = turn.blocks[turn.blocks.length - 1];
      view.surface.feed(lastBlock?.id ?? 0, fullText);
      // turn-level affordances bound to the last block entry; text reads
      // live so copy/send-to always sees the current surface content
      if (lastBlock && !view.actionsDone) {
        view.actionsDone = true;
        const proxy = { id: lastBlock.id, kind: 'output_block', _liveSurface: true, get text() { return view.prevText; } };
        onEntryActions?.(view.el.querySelector('.turn-head'), proxy);
      }
      view.prevText = fullText;
    }
    // settle: observed turn.settled AND hint not busy — the caller combines
    const adapter = ADAPTERS[view.adapterId];
    const hint = adapter.settleHint(fullText.slice(-2000));
    if (turn.settled && hint !== 'busy' && !view.settled) {
      view.settled = true;
      view.surface.settle();
    }
  }

  /**
   * Reconcile DOM to the projected turns. Entries arrive already mirrored;
   * this derives structure and updates in place.
   * Returns {appendedNodes:boolean} so the caller can scroll-follow.
   */
  function reconcile(entries) {
    const turns = projectConversation(entries);
    let appended = false;
    for (const turn of turns) {
      // earlier_output before the first user_turn → one collapsed disclosure;
      // any output_block on the synthetic turn still renders normally
      if (turn.id === 0 && turn.earlier) {
        const ekey = 'turn-earlier';
        let eview = turnViews.get(ekey);
        if (!eview) {
          const det = buildEarlier(turn);
          det.id = entryDomId(turn.earlier.id);
          messagesEl.prepend(det);
          // actions must live on the summary — a closed <details> hides
          // its non-summary children
          onEntryActions?.(det.querySelector('summary'), turn.earlier);
          eview = { el: det, earlier: true, prevEarlier: '' };
          turnViews.set(ekey, eview);
          appended = true;
        } else if (eview.prevEarlier !== turn.earlier.text) {
          eview.el.querySelector('pre').textContent = turn.earlier.text;
          eview.el.querySelector('summary').textContent = `earlier output · ${turn.earlier.text.split('\n').length} lines`;
        }
        eview.prevEarlier = turn.earlier.text;
        if (turn.blocks.length === 0 && turn.controls.length === 0) continue;
      }
      const key = turnKey(turn);
      let view = turnViews.get(key);
      if (!view) appended = true;
      view = ensureTurn(turn, null);
      updateTurn(view, turn);
    }
    return appended;
  }

  return { reconcile, setAdapter, reset, get adapterId() { return adapterId; } };
}

export const KNOWN_ADAPTERS = Object.keys(ADAPTERS);
