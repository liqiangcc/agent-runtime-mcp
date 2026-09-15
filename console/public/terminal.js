'use strict';

/* Advanced → Terminal view: xterm.js over one WebSocket, bridged server-side
 * to a pty running the scoped tmux attach verb. Input and resize travel as
 * JSON control frames; server→client frames are raw pty output. */

const params = new URLSearchParams(location.search);
const channelId = params.get('channel');
const termEl = document.getElementById('term');
const statusEl = document.getElementById('term-status');
const titleEl = document.getElementById('term-title');

function setStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.className = `banner ${kind}`;
}

const FitCtor = (window.FitAddon && window.FitAddon.FitAddon) || window.FitAddon;
const term = new Terminal({
  convertEol: true,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  cursorBlink: true,
});
const fitAddon = new FitCtor();
term.loadAddon(fitAddon);
term.open(termEl);
fitAddon.fit();

if (!channelId) {
  setStatus('down', 'no channel selected');
} else {
  titleEl.textContent = channelId;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(
    `${proto}://${location.host}/api/channels/${encodeURIComponent(channelId)}/terminal?cols=${term.cols}&rows=${term.rows}`,
  );

  ws.onopen = () => setStatus('ok', 'attached');
  ws.onmessage = (event) => {
    term.write(typeof event.data === 'string' ? event.data : new Uint8Array(event.data));
  };
  ws.onclose = () => setStatus('down', 'detached');
  ws.onerror = () => setStatus('down', 'connection error');

  const send = (msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  term.onData((data) => send({ type: 'input', data }));
  term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
  window.addEventListener('resize', () => fitAddon.fit());
  window.addEventListener('beforeunload', () => ws.close());
}
