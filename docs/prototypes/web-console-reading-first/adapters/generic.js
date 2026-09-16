// Generic-terminal adapter — fallback rendering path.
// Used whenever no adapter applies or adapter parsing fails.
// Streams faithfully: raw append-only, no interpretation.
window.Adapters = window.Adapters || {};

window.Adapters.generic = {
  id: 'generic',
  label: 'generic terminal',
  // No parsing: the entry body is rendered as-is.
  renderBody(entry, bodyEl) {
    bodyEl.classList.add('generic');
    bodyEl.textContent = entry.text;
  },
  // Incremental render: append raw deltas to a single text node.
  createLive(bodyEl) {
    bodyEl.classList.add('generic');
    const node = document.createTextNode('');
    bodyEl.appendChild(node);
    return {
      update(delta) { node.textContent += delta; },
      done() {},
      abort() {},
    };
  },
};
