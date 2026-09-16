// Devin adapter (MOCK) — deep-adaptation sample for Issue #90.
//
// Parses a STABLE mock activity format embedded in agent output into
// collapsible tool/activity cards, and supports incremental updates as
// stream deltas arrive: existing cards are updated IN PLACE, never
// re-appended or duplicated. Presentation-only: this parsing lives only
// inside the adapter layer of this prototype and says nothing about
// runtime/core. If parsing fails or yields nothing, the caller falls back
// to the generic renderer — original content is never dropped.
window.Adapters = window.Adapters || {};

(function () {
  // Mock block markers: a line consisting of «kind» opens a block that runs
  // until a blank line or the next marker. Kinds: thinking, run, read, result.
  const MARKER = /^«(thinking|run|read|result)»\s*$/;
  const TITLES = {
    thinking: 'Thinking',
    run: 'Running command',
    read: 'Read shell',
    result: 'Tool result',
  };
  const ICONS = { thinking: '◌', run: '▸', read: '≡', result: '↩' };

  function parse(text) {
    const lines = text.split('\n');
    const segments = [];
    let cur = null;
    for (const line of lines) {
      const m = line.match(MARKER);
      if (m) {
        cur = { type: m[1], text: '' };
        segments.push(cur);
      } else if (cur && !line.trim()) {
        cur = null; // blank line ends an activity block
      } else if (cur) {
        cur.text += (cur.text ? '\n' : '') + line;
      } else if (line.trim() || segments.length) {
        segments.push({ type: 'text', text: line });
      }
    }
    // merge adjacent text segments
    const merged = [];
    for (const s of segments) {
      const last = merged[merged.length - 1];
      if (s.type === 'text' && last?.type === 'text') last.text += '\n' + s.text;
      else merged.push(s);
    }
    for (const s of merged) if (s.type === 'text') s.text = s.text.trim();
    const hasActivity = merged.some(s => s.type !== 'text' && s.text.trim());
    return hasActivity ? merged : null;
  }

  function previewOf(text) {
    const first = (text || '').trim().split('\n').find(l => l.trim()) || '';
    return first.length > 64 ? first.slice(0, 64) + '…' : first;
  }

  function makeTextNode(seg) {
    const p = document.createElement('div');
    p.className = 'seg-text';
    // Answer/content segments get the Markdown reading surface.
    if (window.Md) window.Md.renderInto(p, seg.text);
    else p.textContent = seg.text;
    return p;
  }

  function makeLiveTextNode(seg) {
    const p = document.createElement('div');
    p.className = 'seg-text';
    const md = window.Md ? window.Md.createLive(p) : null;
    if (md) md.setText(seg.text); else p.textContent = seg.text;
    return { el: p, md };
  }

  function makeCardNode(seg) {
    const d = document.createElement('details');
    d.className = `tool-card tool-${seg.type}`;
    const sum = document.createElement('summary');
    sum.innerHTML =
      `<span class="tool-icon">${ICONS[seg.type]}</span>` +
      `<span class="tool-title">${TITLES[seg.type]}</span>` +
      `<span class="tool-preview"></span>`;
    sum.querySelector('.tool-preview').textContent = previewOf(seg.text);
    const pre = document.createElement('pre');
    pre.className = 'tool-body';
    pre.textContent = seg.text;
    d.appendChild(sum);
    d.appendChild(pre);
    return d;
  }

  function updateNode(el, seg) {
    if (seg.type === 'text') {
      el.textContent = seg.text;
    } else {
      el.querySelector('.tool-body').textContent = seg.text;
      el.querySelector('.tool-preview').textContent = previewOf(seg.text);
    }
  }

  // Wrap a turn's activity rows into ONE compact summary disclosure —
  // nodes are MOVED, never rebuilt: answer DOM identity, scroll and any
  // expanded state are preserved across collapse/expand.
  function collapseTrace(bodyEl, nodes, title) {
    if (!nodes.length) return;
    const det = document.createElement('details');
    det.className = 'trace-sum';
    const sum = document.createElement('summary');
    sum.innerHTML =
      `<span class="tool-icon">◌</span>` +
      `<span class="ts-title">${title}</span>`;
    const steps = document.createElement('div');
    steps.className = 'trace-steps';
    det.appendChild(sum);
    bodyEl.insertBefore(det, nodes[0]);
    for (const el of nodes) steps.appendChild(el);
    det.appendChild(steps);
  }

  window.Adapters.devin = {
    id: 'devin',
    label: 'devin',

    // Static render of a complete entry (history path) — completed turns
    // already settle to one compact summary row + dominant answer.
    renderBody(entry, bodyEl) {
      const segments = parse(entry.text);
      if (!segments) return false; // caller falls back to generic rendering
      let hiddenCount = 0;
      const cards = [];
      for (const seg of segments) {
        if (seg.type === 'text') {
          if (!seg.text.trim()) continue;
          bodyEl.appendChild(makeTextNode(seg));
        } else {
          hiddenCount += 1;
          const card = makeCardNode(seg);
          cards.push(card);
          bodyEl.appendChild(card);
        }
      }
      collapseTrace(bodyEl, cards, `${hiddenCount} tool step${hiddenCount > 1 ? 's' : ''}`);
      if (hiddenCount) {
        const note = document.createElement('div');
        note.className = 'trace-note';
        note.textContent = `${hiddenCount} tool step${hiddenCount > 1 ? 's' : ''} hidden in Focus mode`;
        bodyEl.appendChild(note);
      }
      return true;
    },

    // Incremental render for a streaming entry. `update(delta)` feeds new
    // text; existing segment nodes are updated in place, new segments are
    // appended once, nothing is re-rendered wholesale. A trailing line that
    // could be a partial «marker» is held back until complete — on any
    // uncertainty we buffer rather than render a fabricated state.
    createLive(bodyEl) {
      let acc = '';
      let rendered = []; // aligned with parsed segments
      let done = false;
      let note = null;
      const t0 = Date.now();

      function safeText() {
        const nl = acc.lastIndexOf('\n');
        const tail = acc.slice(nl + 1);
        if (tail.startsWith('«')) return acc.slice(0, nl + 1);
        // a complete marker line with no body yet is also held back —
        // otherwise it would flash as literal text for one frame
        const lines = acc.replace(/\n+$/, '').split('\n');
        if (MARKER.test(lines[lines.length - 1] || ''))
          return acc.slice(0, acc.lastIndexOf(lines[lines.length - 1]));
        return acc;
      }

      function reconcile(force) {
        const text = force ? acc : safeText();
        const segs = parse(text) || (text.trim() ? [{ type: 'text', text: text.trim() }] : []);
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const isLast = i === segs.length - 1;
          if (i < rendered.length && rendered[i].type === seg.type) {
            if (seg.type === 'text' && rendered[i].md) rendered[i].md.setText(seg.text);
            else updateNode(rendered[i].el, seg);
          } else if (i >= rendered.length) {
            let el, md = null;
            if (seg.type === 'text') {
              const t = makeLiveTextNode(seg);
              el = t.el; md = t.md;
            } else {
              el = makeCardNode(seg);
            }
            if (note) bodyEl.insertBefore(el, note); else bodyEl.appendChild(el);
            rendered.push({ type: seg.type, el, md });
          } else {
            // earlier segment changed type — should not happen with
            // append-only buffered input; rebuild tail defensively.
            for (let j = i; j < rendered.length; j++) rendered[j].el.remove();
            rendered.length = i;
            i -= 1;
            continue;
          }
          // in-progress marker on the trailing activity segment
          const live = seg.type !== 'text' && isLast && !done;
          rendered[i].el.classList.toggle('live', live);
        }
        const hiddenCount = rendered.filter(r => r.type !== 'text').length;
        if (hiddenCount && !note) {
          note = document.createElement('div');
          note.className = 'trace-note';
          bodyEl.appendChild(note);
        }
        if (note) note.textContent = `${hiddenCount} tool step${hiddenCount > 1 ? 's' : ''} hidden in Focus mode`;
      }

      function settle() {
        done = true;
        rendered.forEach(r => r.el.classList.remove('live'));
        const acts = rendered.filter(r => r.type !== 'text').map(r => r.el);
        const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
        collapseTrace(bodyEl, acts,
          `Thought ${secs}s · ${acts.length} tool step${acts.length > 1 ? 's' : ''}`);
      }

      return {
        update(delta) { acc += delta; reconcile(); },
        done() { reconcile(true); settle(); },
        abort() { settle(); },
      };
    },
  };
})();
