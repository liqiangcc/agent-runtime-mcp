// Generic-terminal adapter — fallback rendering path.
// Used whenever no adapter applies or adapter parsing fails.
window.Adapters = window.Adapters || {};

window.Adapters.generic = {
  id: 'generic',
  label: 'generic terminal',
  // No parsing: the entry body is rendered as-is.
  renderBody(entry, bodyEl) {
    bodyEl.classList.add('generic');
    bodyEl.textContent = entry.text;
  },
};
