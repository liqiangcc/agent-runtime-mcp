// Devin adapter (MOCK) — deep-adaptation sample for Issue #90.
//
// Parses a STABLE mock activity format embedded in agent output into
// collapsible tool/activity cards. Presentation-only: this parsing lives
// only inside the adapter layer of this prototype and says nothing about
// runtime/core. If parsing fails or yields nothing, the caller falls back
// to the generic renderer — original content is never dropped.
window.Adapters = window.Adapters || {};

(function () {
  // Mock block markers: a line consisting of «kind» opens a block that runs
  // until the next marker or end of text. Kinds: thinking, run, read, result.
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

  window.Adapters.devin = {
    id: 'devin',
    label: 'devin',
    renderBody(entry, bodyEl) {
      const segments = parse(entry.text);
      if (!segments) return false; // caller falls back to generic rendering
      let hiddenCount = 0;
      for (const seg of segments) {
        if (seg.type === 'text') {
          if (!seg.text.trim()) continue;
          const p = document.createElement('div');
          p.className = 'seg-text';
          p.textContent = seg.text;
          bodyEl.appendChild(p);
        } else {
          hiddenCount += 1;
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
          bodyEl.appendChild(d);
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
  };
})();
