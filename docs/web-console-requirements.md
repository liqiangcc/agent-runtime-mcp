# Web Console Requirements (upper-layer component)

Parent Goal: GitHub Issue #60.

## 1. Status and authority

The Web Console is an **upper-layer human interaction component**. It is **not** part of the
`agent-runtime-mcp` product (the seven-tool Channel MCP). This document is the reviewed and
corrected version of the original Issue #60 proposal and is the canonical requirement for the
Console layer only.

This file supersedes the original proposal text committed as `1db4327` ("docs: add agent session
web console requirements"), whose items are mapped in §11.

Canonical product authority remains:

```text
docs/requirements.md
docs/channel-architecture.md
docs/channel-model.md
docs/mcp-contract.md
docs/security.md
docs/deployment.md
```

If anything in this document appears to conflict with those documents, the product documents
win and this document must be corrected.

## 2. Goal

Give a human one browser place to **discover, observe, and interact with** many already-existing
tmux-backed terminal sessions (Devin, Codex, Claude Code, Gemini CLI, plain shells) instead of
manually switching between tmux sessions.

## 3. Placement decision (Coordinator, Issue #60 review)

```text
Location:   console/ directory in this repository, own package.json + lockfile
Data path:  Console is an MCP client of the seven public tools for
            list / inspect / read / observe+wait / write_text / send_control / health
Direct tmux: only for two explicitly separated adapters that the MCP cannot and must not provide:
            (a) interactive terminal attach (Terminal View)
            (b) session creation/management (deployment-layer lifecycle)
Semantics:  agent type / agent status / chat-turn rendering are deferred to Future (see §9)
```

The Console must never:

- add, wrap, or shadow public MCP tools with lifecycle or raw-command capability;
- modify `src/` to serve Console needs (product changes require their own product Task);
- re-implement Channel scope, bounds, or input-safety logic that the MCP already owns;
- be shipped inside the runtime deployment bundle (`scripts/package-runtime.mjs` output).

## 4. Layering

```text
browser (desktop / mobile)
   ↓ HTTPS + authenticated session
Console server (console/)
   ├── MCP client adapter ──── stdio ───▶ agent-runtime-mcp (seven tools)  ──▶ existing panes
   ├── terminal attach adapter ── pty ──▶ tmux attach/pipe on the same socket ──▶ existing panes
   └── session lifecycle adapter ───────▶ tmux new-session/kill-session (operator authority)
```

Separation points:

```text
Console UI            | Console server
Console server        | agent-runtime-mcp (MCP contract is the boundary)
MCP data path         | direct-tmux adapters (attach, lifecycle)
authentication/authz  | channel operation
observation (facts)   | interpretation (human)
Console-owned history | MCP bounded read
```

Single responsibilities:

```text
agent-runtime-mcp        = bounded, safe Channel communication (unchanged)
MCP client adapter       = translate Console requests into public MCP calls, nothing more
terminal attach adapter  = raw interactive byte stream for one pane, no interpretation
session lifecycle adapter= create/destroy tmux sessions on operator authority, never via MCP
auth layer               = decide who may read / who may write or control / who may manage lifecycle
Console UI               = presentation and human-local state (position, bookmarks, search)
```

## 5. Actors and use cases

### WC-UC1 — See the session list

Actor: operator/human. Outcome: a list of Channels visible in the configured tmux scope with
**mechanical** facts only: `channel_id`, `backend_metadata.tmux.session_name`, `title`, `cwd`,
`state (available|unavailable|unknown)`, `last_activity`, `capabilities`, and backend `health`.

Failure: MCP/backend unavailable → explicit "unavailable" banner; no auto-recovery.
Degradation: missing fields display as unknown; nothing is inferred from terminal text.

### WC-UC2 — Browse bounded output (Browse View)

Actor: human. Outcome: read the recent output of one Channel as a scrollable page; keep the
reading position when new output arrives; search and copy within what the browser holds.

Data source: `read_channel` (bounded) plus `get_channel(observe:true)` / `wait_channel_event`
for change notification. **History is Console-owned**: a finite in-memory ring per Channel with
explicit byte/line ceilings. Persistence to disk is **off by default**; if enabled it is an
operator decision with a documented retention limit (see §8 T5).

Failure: `CHANNEL_NOT_FOUND` / `CHANNEL_UNAVAILABLE` / `CURSOR_*` errors are shown as such.
Degradation: truncation metadata from `read_channel` is surfaced, never hidden.

### WC-UC3 — Send text and explicit control

Actor: authenticated human with write permission. Outcome: deliver ordinary text
(`write_text`, optional `submit`) or exactly one of `ENTER | INTERRUPT | ESCAPE`
(`send_control`) to one Channel.

Rules: the Console does not invent additional key grammar; confirmation is required for
`INTERRUPT`; a mutation timeout is displayed as ambiguous and is **never** auto-retried.

### WC-UC4 — Full interactive terminal (Terminal View)

Actor: authenticated human with terminal permission. Outcome: an xterm-style interactive
terminal attached to one existing pane, including arbitrary keys and resize.

This path **does not** go through the MCP (the MCP has no raw-key capability by design). It is a
separate adapter bound to the same tmux socket/scope, guarded by the same auth layer, and it
must never be exposed as an MCP tool.

### WC-UC5 — Create / manage sessions

Actor: authenticated operator with lifecycle permission. Outcome: create a new tmux session in
the configured socket (optionally with a cwd and a start command chosen from an
operator-configured allowlist), or kill a session.

This is **deployment-layer lifecycle authority** (see `docs/deployment.md §9`). It lives only in
the Console's lifecycle adapter, never in `src/`, never via MCP, and is disabled unless the
operator enables it explicitly.

## 6. MVP scope (ordered)

```text
MVP-1  Console skeleton + auth gate + MCP client adapter + session list (WC-UC1)
MVP-2  Browse View: bounded read + observe/wait refresh + Console-owned bounded history (WC-UC2)
MVP-3  Send text / explicit control with write authorization (WC-UC3)
MVP-4  Terminal View: direct tmux attach adapter (WC-UC4)
MVP-5  Session lifecycle adapter, operator-enabled (WC-UC5)
MVP-6  End-to-end dogfood and operator deployment guide
```

## 7. Success / Failure / Degradation (Console-wide)

Success proves: a human can list, browse, write, control, and attach to existing sessions from a
browser **without** the MCP product surface changing and **without** the Console interpreting
agent semantics.

Hard failure: unauthenticated write/control/lifecycle; Console-triggered endpoint recreation on
failure; Console reading outside the configured tmux scope; MCP tool surface growth.

Safe degradation: backend unavailable → read-only "unavailable" state; cursor expiry → explicit
re-observe prompt; history ring full → oldest lines drop with a visible marker.

Never inferred: agent identity, task progress, "done/working/blocked" from terminal text.

## 8. Security requirements

- **Authentication is a hard precondition**, not an environment hope. The Console server binds to
  loopback by default; any non-loopback bind requires a configured auth mode (reverse-proxy
  trusted identity header from an allowlisted proxy, or a local bearer/session secret). Reads,
  writes/controls, terminal attach, and lifecycle are **separately authorized** roles.
- WebSocket/SSE endpoints verify `Origin`; state-changing HTTP uses CSRF protection.
- T5 (`docs/security.md`): terminal content may contain secrets. Console history is memory-only
  by default, bounded, and excluded from logs. Any persistence is opt-in with retention limits.
- T1/T4: the Console never builds shell strings from user input; the lifecycle adapter executes
  `tmux` as executable + argv with an operator-configured command allowlist.
- T8/S11: terminal output is untrusted data; it is rendered escaped, never executed or used as
  Console policy input.
- The Console's tmux scope (`TMUX_SOCKET_NAME|PATH`, `TMUX_ALLOWED_SESSIONS`) is the same
  configuration handed to the MCP; the attach/lifecycle adapters must enforce the same allowlist.
- No root; the Console runs as the same ordinary account as the MCP.

## 9. Deferred to Future (explicitly out of MVP)

```text
Chat View / ChatGPT-style turn rendering
agent type / agent status columns
context transfer between agents
output annotations, agent comparison
mobile-first redesign (MVP must merely be usable on mobile)
```

Any future "agent type" must come from operator-declared metadata (session naming convention or
tmux user option), never from parsing terminal output.

## 10. Non-goals

- replace tmux or agent-runtime-mcp;
- build an agent execution engine;
- parse agent-specific protocols;
- add MCP tools for lifecycle, raw tmux, or raw shell;
- store complete terminal history by default;
- act as remote ingress/tunnel/TLS for the MCP itself.

## 11. Mapping of the original proposal items

| Original proposal item | Disposition | Where |
|---|---|---|
| List tmux sessions; name, title, cwd | MVP, mechanical facts via MCP | WC-UC1 / #61 |
| `repository` column | Derived only from `cwd` shown as-is (no git inspection in MVP) | WC-UC1 |
| `agent type`, `status` | Deferred; would require operator-declared metadata | §9 Future |
| Open an existing session | MVP | WC-UC2 / WC-UC4 |
| Create session with cwd + command | Operator-enabled lifecycle adapter, argv allowlist only | WC-UC5 / #65 |
| Stop/restart sessions | "Stop" = kill via lifecycle adapter with confirmation; "restart" is deployment supervision and is **not** a Console capability | WC-UC5 / `docs/deployment.md §9` |
| Chat View (markdown, ChatGPT-like) | Deferred | §9 Future |
| Browse View incl. infinite scrolling | MVP within the bounded Console-owned ring; "infinite" is bounded by the ring ceiling with a visible drop marker | WC-UC2 / #62 |
| Search, copy, bookmarks, keep position | MVP, browser-local | WC-UC2 / #62 |
| Terminal View, Ctrl-C/Escape, arbitrary keys | MVP via direct attach adapter (not MCP) | WC-UC4 / #64 |
| Send text; observe updates | MVP via `write_text` / observe+wait | WC-UC3 / #63, WC-UC2 / #62 |
| Jump between sessions | MVP navigation | WC-UC1 |
| Send selected output to another agent session | Deferred (context transfer) — requires its own security review (T5 cross-session data flow) | §9 Future |
| Session history indexing | Deferred; conflicts with memory-only default | §9 Future |
| No writable terminals publicly without authentication | Strengthened into a hard precondition with roles and loopback default | §8 |

## 12. Repository and CI constraints for `console/`

- own `package.json`, lockfile, TypeScript config; Node.js >= 20; small dependency surface;
- no import from `src/` at runtime; the only product coupling is the public MCP contract;
- `scripts/package-runtime.mjs` output must not contain `console/`;
- the `static-boundary` CI job's `src/` guards stay unchanged; a Console-specific guard must
  reject `new-session|kill-session|attach-session|pipe-pane` outside the two named adapter
  modules and reject any `shell: true`;
- GitHub Actions is the Evidence route for typecheck/unit/integration against real tmux.
