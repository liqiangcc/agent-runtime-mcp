# agent-runtime-mcp Web Console

An **upper-layer human interaction component** for `agent-runtime-mcp`. It is
**not part of the seven-tool MCP product** and never modifies `src/`. Its only
coupling to the product is the public MCP contract (`docs/mcp-contract.md`):
the Console spawns `node <repo>/dist/src/server.js` over stdio and calls the
public tools through the official `@modelcontextprotocol/client`.

Current slice (Tasks #61 + #63 + #62 + #65 + #64 + #84): chat-first conversation
view — session list sidebar, backend health banner, a chat composer that sends
`write_text` / `send_control` through the same adapter, a Console-owned bounded
history ring observed per Channel and pushed to the browser over read-only
SSE, an opt-in deployment-layer session lifecycle (create/kill), and an opt-in
Advanced terminal attach view — both off by default and absent unless the
operator enables them — plus an explicit human-driven context transfer: copy
selected output from one visible Channel's rendered history to another visible
Channel, with preview and explicit confirm before exactly one ordinary
`write_text` send.

```text
browser ──HTTP──▶ Console server ──stdio MCP──▶ agent-runtime-mcp ──▶ existing tmux panes
```

## Security posture

- **The Tailscale tailnet is the access boundary.** The Console implements no
  user authentication, roles, or authorization — everyone who can reach it has
  full read **and write/control** capability over every listed Channel. Tailnet
  membership and Tailscale ACLs decide who that is (deployment-layer concern,
  `docs/deployment.md §5`).
- **The bind guard is the only Console-side network control.** Startup refuses
  any `CONSOLE_BIND` that is not (a) a loopback address or (b) a Tailscale
  address (`100.64.0.0/10` or `fd7a:115c:a1e0::/48`) **currently assigned to a
  local network interface**. `0.0.0.0`, `::`, hostnames, and every other
  address exit non-zero. There is no override flag.
- **Origin/Host check.** Every request — including the read-only SSE history
  stream and the terminal WebSocket upgrade — must carry a `Host` equal to the
  bound `address:port`; a present `Origin` must resolve to the same authority.
  With terminal attach disabled (the default) every upgrade request is
  refused: no WebSocket endpoint exists.
- **No terminal payloads in logs.** Structured JSON logs on stderr contain only
  operation, path, status and timing fields; non-scalar fields collapse to a
  type tag. Request and response bodies are never logged.
- **Mechanical facts only.** The list renders `channel_id`,
  `backend_metadata.tmux.session_name`, `title`, `cwd`, `state`,
  `last_activity` and `capabilities`. Missing fields show `unknown`; nothing is
  inferred from terminal content.
- **Lifecycle is opt-in and deployment-layer only.** With
  `CONSOLE_LIFECYCLE_ENABLED` unset the Console exposes no lifecycle surface at
  all (routes `404`). When enabled, exactly one module —
  `console/src/session-lifecycle.ts` — invokes the tmux session create/kill
  verbs as executable + argv (`execFile`, never a shell, no free-form
  command). Session names are validated, creation cwd is canonicalized and
  must live under `CONSOLE_ALLOWED_CWD_ROOTS`, the profile argv comes only
  from the operator-configured `CONSOLE_LIFECYCLE_PROFILES` allowlist, kill
  requires explicit confirmation and refuses `CONSOLE_PROTECTED_SESSIONS`
  (always including `agent-runtime-keeper`), and names must be inside
  `TMUX_ALLOWED_SESSIONS` when that scope is configured. Audit log records
  metadata only — `actor` (the socket peer address, derived mechanically at the
  HTTP boundary and never accepted from the request body), `action`, `session`,
  `result`/`reason` — never argv, output, or secrets.
- **Terminal attach is opt-in, Advanced-only, and deployment-layer.** With
  `CONSOLE_TERMINAL_ENABLED` unset there is no attach surface at all (probe
  `404`, every upgrade refused). When enabled, exactly one module —
  `console/src/terminal-attach.ts` — runs the tmux attach verb through a
  `node-pty` server-side PTY as executable + argv (never a shell). The browser
  supplies only a `channel_id`; the Console resolves the target through the
  public `get_channel` `backend_metadata.tmux` (session name + window/pane
  IDs) — user-typed tmux target grammar is never accepted. Attach runs on the
  same configured tmux socket and inside the same `TMUX_ALLOWED_SESSIONS`
  scope as the MCP; `CONSOLE_MAX_ATTACH` is a hard concurrent cap; each
  viewer gets its own PTY; resize frames propagate; and closing the
  WebSocket/page kills the PTY and its tmux client within a bounded time.
  Audit log records metadata only — `actor` (socket peer address, derived at
  the HTTP boundary), `action`, `session`, `result`/`reason` — never terminal
  bytes or secrets. The browser renderer is vendored `@xterm/xterm`; the
  Terminal view stays behind the Advanced link and never becomes the default
  chat flow.

  A CI guard rejects the tmux session create/kill verbs anywhere under
  `console/` outside `console/src/session-lifecycle.ts`, the tmux attach verb
  anywhere outside `console/src/terminal-attach.ts`, and key-injection,
  pane-piping, and forced-shell execution everywhere under `console/` with no
  exceptions.
- **Context transfer is manual-only.** The `send to…` action on output entries
  never triggers automatically: the operator picks a target from the current
  visible Channel list (raw tmux targets are never accepted), previews the
  exact payload, and confirms. Preview and Cancel perform zero mutations;
  Confirm issues exactly one ordinary `write_text` through the existing
  `/api/channels/:id/text` route and the target history records a normal
  `user_turn`. The envelope is a single mechanical provenance line
  (source session + channel id) followed by the selected text verbatim —
  no semantic interpretation, no role inference, no summarization, no
  auto-forwarding, no routing rules, no persistence of payloads. A 256 KiB
  UI bound rejects oversize selections before any send (never truncated);
  a `TIMEOUT` stays ambiguous and is never auto-retried; a vanished or stale
  target fails with an explicit error, the prior target choice is discarded
  and the list is rebuilt from currently visible Channels — a fresh explicit
  selection is required before anything can be sent again. **Terminal output
  may contain secrets or untrusted instructions — it is transferred only
  by explicit human action, never automatically.**
- **No persistence.** Nothing is written to disk by the Console; conversation
  history lives only in bounded in-process rings (below) and disappears on
  restart. Terminal output is stored and rendered verbatim — no role, prompt,
  or agent-protocol parsing.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `CONSOLE_BIND` | `127.0.0.1` | IP literal to listen on. Loopback, or a locally assigned Tailscale address. Anything else refuses startup. |
| `CONSOLE_PORT` | `8080` | TCP port, 1–65535. |
| `CONSOLE_MCP_ENTRY` | `<repo>/dist/src/server.js` | Path to the built agent-runtime-mcp stdio server entry point. |
| `CONSOLE_MCP_REQUEST_TIMEOUT_MS` | `10000` | Per-call MCP request timeout (max 120000). |
| `CONSOLE_PUBLIC_DIR` | `console/public` | Static UI directory. |
| `CONSOLE_HISTORY_MAX_LINES` | `5000` | Per-Channel ring line ceiling (10–100000). |
| `CONSOLE_HISTORY_MAX_BYTES` | `2097152` | Per-Channel ring byte ceiling (4 KiB–64 MiB). |
| `CONSOLE_HISTORY_MAX_CHANNELS` | `4` | Max Channels observed at once (1–8; the MCP allows at most 8 observers). |
| `CONSOLE_OBSERVE_IDLE_MS` | `1000` | `wait_channel_event` `idle_ms` (250–60000). |
| `CONSOLE_OBSERVE_TIMEOUT_MS` | `15000` | `wait_channel_event` `timeout_ms` (100–60000). |
| `CONSOLE_OBSERVE_POLL_MS` | `2500` | Fallback poll interval when observation is unavailable (500–60000). |
| `CONSOLE_TAIL_LINES` | `400` | Lines requested per bounded `read_channel` tail (10–2000). |
| `CONSOLE_TAIL_BYTES` | `262144` | Bytes requested per `read_channel` tail (4 KiB–**1 MiB**, the MCP's public per-read bound — independent of the ring's total byte ceiling). |
| `CONSOLE_LIFECYCLE_ENABLED` | *(unset = off)* | `true`/`1` enables the deployment-layer lifecycle routes; anything else fails closed. |
| `CONSOLE_LIFECYCLE_PROFILES` | `{}` | JSON object `label → {"argv": [...]}`. **The repository ships an empty default profile set — enabling lifecycle with no profiles exposes no start command.** Each `argv` is a non-empty string array; `{name}` and `{cwd}` are the only substituted placeholders. |
| `CONSOLE_ALLOWED_CWD_ROOTS` | `[]` | JSON array of absolute paths; session creation `cwd` must resolve (via `realpath`) inside one of these resolved roots. |
| `CONSOLE_PROTECTED_SESSIONS` | `agent-runtime-keeper` | Comma-separated session names that can never be killed through the Console; `agent-runtime-keeper` is always protected. |
| `CONSOLE_TERMINAL_ENABLED` | *(unset = off)* | `true`/`1` enables the Advanced terminal attach view; anything else fails closed — the probe `404`s and every WebSocket upgrade is refused. |
| `CONSOLE_MAX_ATTACH` | `4` | Hard cap on concurrent attached terminal viewers (1–16); a refused attach spawns nothing. |
| `TMUX_*` | — | Passed through to the MCP child unchanged (e.g. `TMUX_SOCKET_NAME`, `TMUX_SOCKET_PATH`, `TMUX_ALLOWED_SESSIONS`, `TMUX_TIMEOUT_MS`). The lifecycle and terminal adapters additionally read only the socket selection (`TMUX_SOCKET_NAME`/`TMUX_SOCKET_PATH`) and `TMUX_ALLOWED_SESSIONS` to enforce the same scope — this mirrors MCP scope without changing MCP semantics. |

Reconnect policy: when the MCP child is unreachable the adapter retries with
bounded backoff (3 attempts, 250 ms doubling), then reports `MCP_UNAVAILABLE`
and cools down ~5 s before the next burst. No retry storm; the UI shows an
explicit unavailable state.

## Run

```bash
npm run build              # in the repository root, builds dist/src/server.js
cd console && npm ci && npm run build
CONSOLE_BIND=127.0.0.1 CONSOLE_PORT=8080 \
TMUX_SOCKET_NAME=agent-runtime TMUX_ALLOWED_SESSIONS=my-session \
  node dist/src/server.js
# then browse to http://127.0.0.1:8080/ (Host must match the bound address)
```

On a host joined to a tailnet, set `CONSOLE_BIND` to the machine's Tailscale
IPv4 (`100.x.y.z`) or IPv6 (`fd7a:115c:a1e0::…`) address and browse to that
address instead.

## HTTP API (internal, consumed by the bundled UI only)

- `GET /api/health` → MCP `health` result; `503 MCP_UNAVAILABLE` when the MCP
  process is down.
- `GET /api/channels` → MCP `list_channels` result.
- `GET /api/channels/:id` → MCP `get_channel` result; `404 CHANNEL_NOT_FOUND`.
- `GET /api/channels/:id/history` → `{channel_id, state, ring}` snapshot of the
  Console-owned conversation ring (below); `?format=raw` returns the same ring
  rendered as `text/plain` transcript.
- `GET /api/channels/:id/events` → read-only Server-Sent Events stream
  (`text/event-stream`). Opening it attaches the Channel's observe loop;
  closing it detaches, and the last viewer leaving stops the loop. Sends a
  `snapshot` event then `delta` events (`appended`/`updated` ring entries and
  observation `state`). No request body, no mutations, no WebSocket upgrade.
- `POST /api/channels/:id/text` → `{text: string, submit?: boolean (default true)}`
  forwarded verbatim to MCP `write_text`. Responses:
  `200 {transport_result:'delivered', result}`; `504 TIMEOUT` = **ambiguous —
  the text may have been delivered**; other errors map the MCP code.
- `POST /api/channels/:id/control` → `{control}` where `control` is exactly one
  of `ENTER|INTERRUPT|ESCAPE` (the same closed enum as the MCP; anything else is
  rejected `400 INVALID_ARGUMENT` before the adapter is called).

When `CONSOLE_LIFECYCLE_ENABLED` is on (otherwise every route below is `404`):

- `GET /api/lifecycle` → `{enabled: true, profiles: [...]}` capability probe the
  UI uses to reveal the operator controls.
- `POST /api/lifecycle/sessions` → `{name, cwd, profile}` — whitelisted keys
  only; there is no free-form command field. `200 {session, created:true}`,
  `422 LIFECYCLE_REFUSED` for bad name/profile/cwd/scope, `502 TMUX_ERROR` when
  tmux itself fails.
- `POST /api/lifecycle/kill` → `{name, confirm: true}` — the explicit
  `confirm: true` is required (`400` without it); protected or out-of-scope
  sessions are refused `422` before tmux runs.

When `CONSOLE_TERMINAL_ENABLED` is on (otherwise every surface below is
`404`/refused):

- `GET /api/terminal` → `{enabled: true, maxAttach}` capability probe the UI
  uses to reveal the Advanced → Terminal link.
- `GET /api/channels/:id/terminal` (WebSocket upgrade) → resolves `:id` through
  the public `get_channel`, validates the Channel's own
  `backend_metadata.tmux` target against `TMUX_ALLOWED_SESSIONS`, and reserves
  one `CONSOLE_MAX_ATTACH` slot — all before the handshake, so a malformed
  upgrade can never spawn a PTY. `403` on authority failure, refused target,
  or out-of-scope session; `404` unknown channel; `429` when `active +
  reserved` reaches the cap. Only after a successful `101` does the
  reservation commit spawn exactly one `node-pty` tmux client; a native PTY
  load/spawn failure at that point closes the fresh WebSocket with `1011` and
  releases the slot — no orphan. Client→server frames are JSON only —
  `{type:'input',data}` keystrokes (≤16 KiB) and `{type:'resize',cols,rows}`
  (clamped to 20–400 × 5–120); the parser additionally hard-rejects any frame
  over 64 KiB. Server→client frames are raw PTY output text. The PTY and its
  tmux client die with the socket.

All mutation routes run the same Origin/Host authority check before touching
the adapter: `Host` must equal the bound `address:port` and a present `Origin`
must match it — **anyone who can reach the Console on the tailnet can write and
send controls**; that is the documented trust model, there is no per-user
authorization.

### Ambiguity rule

`write_text` and `send_control` are non-idempotent. A `TIMEOUT` response means
the send may already have been delivered: the Console returns `504` with
`transport_result:'ambiguous'` and **never retries automatically** — the human
decides whether to retry.

### User-turn / control events

Each delivered or ambiguous send emits exactly one in-process event on the
`ConsoleEventBus` (`console/src/events.ts`); rejected sends emit none. These
events are the conversation-history feed consumed by #62:

```text
user-turn: {type:'user-turn', channel_id, text, submit, sent_at, transport_result}
control:   {type:'control',   channel_id, control, sent_at, transport_result}
transport_result ∈ 'delivered' | 'ambiguous'
```

The bus is process-local only; it feeds the history ring described next.

### Conversation history ring

Each Channel gets a bounded in-process `HistoryRing` (default 5,000 lines /
2 MiB) owned by `HistoryHub` (`console/src/observer.ts`). Entries, in order:

- `earlier_output` — the tail snapshot taken at first attach,
- `output_block` — appended output with state `open → paused → closed`,
- `user_turn` / `control` — the Console's own sends (from the bus above),
- `drop_marker` — a leading marker recording how many entries/lines the ring
  ceilings evicted.

Attach ordering is observe-before-read: `get_channel(observe:true)` acquires
the cursor **before** the initial bounded `read_channel` tail, and overlapping
tails are deduped so a marker produced during attach lands exactly once — a
gap is never intentionally created. The loop then waits on
`wait_channel_event`:

- `output_idle` → re-read the tail, dedupe into the current block, mark it
  `paused` (it may resume on the next output);
- `timeout` → heartbeat only: never a block boundary. A timeout carrying
  `activity_observed` re-reads the tail into the still-open block so
  continuous output stays visible; it does not pause or close;
- `channel_closed` → observation state `closed`;
- cursor errors (`CURSOR_EXPIRED`, `OBSERVATION_GAP`,
  `CHANNEL_INSTANCE_CHANGED`) → explicit `needs_reobserve` state; the UI shows
  a banner with a re-observe action instead of pretending continuity;
- `WAITER_LIMIT` / `OBSERVATION_UNSUPPORTED` → bounded `read_channel` polling
  fallback.

The next `user_turn` closes the current block (`closed` is terminal); a
`control` send records but does not close it. The last SSE viewer leaving
stops the loop within one wait timeout; re-opening re-observes and dedupes
rather than replaying.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (bind guard, request authority, logger, history ring/observer, SSE)
```

The real-tmux end-to-end test lives outside `console/` in the repository test
harness (`tests/console/`), which is permitted to prepare disposable tmux
servers; it runs in the `console` CI job after both packages are built.

## Separation

`console/` imports nothing from `src/`; the runtime deployment bundle
(`npm run package:runtime`) must not contain `console/` paths — both are
asserted in CI. Session lifecycle (#65) and terminal attach (#64) exist only
as the isolated deployment-layer adapters described above — they never route
through the MCP, which stays at exactly seven public tools. The `node-pty`,
`ws`, and `@xterm/*` dependencies are Console-only and never enter the
runtime/MCP bundle.
