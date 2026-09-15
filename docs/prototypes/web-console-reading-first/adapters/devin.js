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
    p.textContent = seg.text;
    return p;
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

  window.Adapters.devin = {
    id: 'devin',
    label: 'devin',

    // Static render of a complete entry (history path).
    renderBody(entry, bodyEl) {
      const segments = parse(entry.text);
      if (!segments) return false; // caller falls back to generic rendering
      let hiddenCount = 0;
      for (const seg of segments) {
        if (seg.type === 'text') {
          if (!seg.text.trim()) continue;
          bodyEl.appendChild(makeTextNode(seg));
        } else {
          hiddenCount += 1;
          bodyEl.appendChild(makeCardNode(seg));
        }
      }
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

      function safeText() {
        const nl = acc.lastIndexOf('\n');
        const tail = acc.slice(nl + 1);
        return tail.startsWith('«') ? acc.slice(0, nl + 1) : acc;
      }

      function reconcile() {
        const segs = parse(safeText()) || (safeText().trim() ? [{ type: 'text', text: safeText().trim() }] : []);
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const isLast = i === segs.length - 1;
          if (i < rendered.length && rendered[i].type === seg.type) {
            updateNode(rendered[i].el, seg);
          } else if (i >= rendered.length) {
            const el = seg.type === 'text' ? makeTextNode(seg) : makeCardNode(seg);
            if (note) bodyEl.insertBefore(el, note); else bodyEl.appendChild(el);
            rendered.push({ type: seg.type, el });
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

      return {
        update(delta) { acc += delta; reconcile(); },
        done() { done = true; acc += ''; reconcile(); rendered.forEach(r => r.el.classList.remove('live')); },
        abort() { done = true; rendered.forEach(r => r.el.classList.remove('live')); },
      };
    },
  };
})();
