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

## 2. Goal and product positioning (Chat-first)

Give a human one browser place to **talk to** many already-existing tmux-backed agent sessions
(Devin, Codex, Claude Code, Gemini CLI, plain shells) instead of manually switching between tmux
sessions.

Positioning decision (Coordinator, Issue #60, revision 2):

```text
Chat-first, not terminal-first.
Default experience  = a ChatGPT-like conversation page per agent session
tmux                = background runtime only; the default UI shows no command-line styling
Terminal View       = advanced debugging / failure-recovery entry, hidden behind an explicit action
```

The Console is a **presentation / orchestration layer**. It presents mechanical Channel facts in a
conversational shape; it does not understand the agent. Concretely:

- a "user turn" is exactly a message the Console itself sent through `write_text`;
- an "output block" is exactly the mechanically observed output that followed (bounded
  `read_channel` snapshots delimited by `wait_channel_event` quiet or the next user turn);
- the Console never segments terminal output into user/assistant/tool roles, never detects
  prompts, and never parses Devin/Codex/Claude Code/Gemini protocols;
- the raw transcript (unshaped terminal text) stays available behind a toggle.

Primary closed loop that everything else serves:

```text
open browser → pick an agent session → see conversation-style history
→ type a message → see the new output appear as the next block
```

## 3. Placement decision (Coordinator, Issue #60 review)

```text
Trust:      no application-level authentication; the Tailscale tailnet is the access boundary
            (Console binds only to loopback or a Tailscale interface address)
Location:   console/ directory in this repository, own package.json + lockfile
Data path:  Console is an MCP client of the seven public tools for
            list / inspect / read / observe+wait / write_text / send_control / health
Direct tmux: only for two explicitly separated adapters that the MCP cannot and must not provide:
            (a) interactive terminal attach (Terminal View)
            (b) session creation/management (deployment-layer lifecycle)
UX:         Chat-first (§2); Terminal View is an advanced debugging/recovery entry, not the default
Semantics:  conversation shape is derived only from the Console's own sends + observed output;
            agent type / agent status / role parsing are deferred to Future (see §9)
```

The Console must never:

- add, wrap, or shadow public MCP tools with lifecycle or raw-command capability;
- modify `src/` to serve Console needs (product changes require their own product Task);
- re-implement Channel scope, bounds, or input-safety logic that the MCP already owns;
- be shipped inside the runtime deployment bundle (`scripts/package-runtime.mjs` output).

## 4. Layering

```text
browser (desktop / mobile)
   ↓ HTTP over the Tailscale tailnet (tailnet membership/ACL = access control)
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
tailnet access control| Console (the Console does not authenticate users)
observation (facts)   | interpretation (human)
Console-owned history | MCP bounded read
```

Single responsibilities:

```text
agent-runtime-mcp        = bounded, safe Channel communication (unchanged)
MCP client adapter       = translate Console requests into public MCP calls, nothing more
terminal attach adapter  = raw interactive byte stream for one pane, no interpretation
session lifecycle adapter= create/destroy tmux sessions on operator authority, never via MCP
bind guard               = refuse to listen on anything but loopback or a Tailscale address
Console UI               = presentation and human-local state (position, bookmarks, search)
```

## 5. Actors and use cases

### WC-UC1 — See the session list

Actor: operator/human. Outcome: a list of Channels visible in the configured tmux scope with
**mechanical** facts only: `channel_id`, `backend_metadata.tmux.session_name`, `title`, `cwd`,
`state (available|unavailable|unknown)`, `last_activity`, `capabilities`, and backend `health`.

Failure: MCP/backend unavailable → explicit "unavailable" banner; no auto-recovery.
Degradation: missing fields display as unknown; nothing is inferred from terminal text.

### WC-UC2 — Conversation-style history (Chat History)

Actor: human. Outcome: open one agent session and see a ChatGPT-like page: the messages this
Console sent (user turns, right/accent) interleaved with the mechanically observed output that
followed each of them (output blocks, plain, monospace inside a bubble, markdown-safe escaped);
new output appears as the next block; reading position is kept; search and copy work within
what the browser holds. A **Raw transcript** toggle shows the same Console-owned buffer as
unshaped terminal text.

Conversation shape rules (the whole "chat" model):

```text
user turn    = one write_text call issued by this Console (text, timestamp, submit flag, transport result)
output block = bounded read_channel tail observed after that turn, closed by wait_channel_event
               output_idle / timeout or by the next user turn
pre-history  = output that existed before the Console attached is one "earlier output" block
```

No prompt detection, no role inference, no protocol parsing. Output produced by someone typing
directly in tmux appears as output, not as a user turn — the Console only knows what it sent.

Data source: `read_channel` (bounded) plus `get_channel(observe:true)` / `wait_channel_event`
for change notification. **History is Console-owned**: a finite in-memory ring per Channel with
explicit byte/line ceilings, holding both user turns and output blocks. Persistence to disk is
**off by default**; if enabled it is an operator decision with a documented retention limit
(see §8 T5).

Failure: `CHANNEL_NOT_FOUND` / `CHANNEL_UNAVAILABLE` / `CURSOR_*` errors are shown as such.
Degradation: truncation metadata from `read_channel` is surfaced, never hidden; "output paused"
is displayed for `output_idle`, never "done".

### WC-UC3 — Send a message and explicit control

Actor: any human on the tailnet. Outcome: from the chat composer, deliver ordinary text
(`write_text`, `submit=true` by default for a chat message; a multi-line/no-submit mode exists)
or exactly one of `ENTER | INTERRUPT | ESCAPE` (`send_control`, presented as "Stop" / "Enter" /
"Escape" actions, not as key chords) to one Channel. Each send is recorded as a user turn for
WC-UC2.

Rules: the Console does not invent additional key grammar; confirmation is required for
`INTERRUPT`; a mutation timeout is displayed as ambiguous and is **never** auto-retried.

### WC-UC4 — Terminal View (advanced debugging / recovery entry)

Actor: any human on the tailnet who needs to recover a stuck session or interact with a TUI
that the chat composer cannot express. Outcome: an xterm-style interactive terminal attached to
one existing pane, including arbitrary keys and resize. It is reached from an explicit
"Advanced → Terminal" action, is **not** the default view, and is **not** part of the primary
acceptance loop.

This path **does not** go through the MCP (the MCP has no raw-key capability by design). It is a
separate adapter bound to the same tmux socket/scope, bound to the same address as the Console, and it
must never be exposed as an MCP tool.

### WC-UC5 — Create / manage sessions

Actor: any human on the tailnet (feature is operator-enabled, default off). Outcome: create a new tmux session in
the configured socket (optionally with a cwd and a start command chosen from an
operator-configured allowlist), or kill a session.

This is **deployment-layer lifecycle authority** (see `docs/deployment.md §9`). It lives only in
the Console's lifecycle adapter, never in `src/`, never via MCP, and is disabled unless the
operator enables it explicitly.

## 6. MVP scope (ordered)

```text
MVP-1  Console skeleton + Tailscale bind guard + MCP client adapter + session list (WC-UC1)   #61
MVP-2  Send a message / explicit control: mutation routes + composer (WC-UC3)                   #63
MVP-3  Chat History: conversation-style view over Console-owned bounded history + raw toggle    #62
       (WC-UC2) — completes the primary closed loop
MVP-4  Terminal View as advanced debugging/recovery entry (WC-UC4)                               #64
MVP-5  Session lifecycle adapter, operator-enabled (WC-UC5)                                       #65
MVP-6  End-to-end dogfood (primary loop first) and operator deployment guide                    #66
```

Issue #61 was published before the Chat-first revision and is frozen while it executes; its
deliverables (bind guard, MCP client adapter, session list) are unchanged by this revision. Its
Contract text mentioning "Browse View"/"Chat View deferred" is historical and is superseded here
for later Tasks only.

## 7. Success / Failure / Degradation (Console-wide)

Success proves the primary closed loop: open browser → pick an agent session → conversation-style
history → type a message → the new output appears as the next block — from a browser **without**
the MCP product surface changing and **without** the Console interpreting agent semantics.
Terminal View is not on the acceptance path.

Hard failure: listening on a non-loopback, non-Tailscale address; Console-triggered endpoint recreation on
failure; Console reading outside the configured tmux scope; MCP tool surface growth.

Safe degradation: backend unavailable → read-only "unavailable" state; cursor expiry → explicit
re-observe prompt; history ring full → oldest lines drop with a visible marker.

Never inferred: agent identity, task progress, "done/working/blocked" from terminal text.

## 8. Security requirements

- **Access control is delegated to the Tailscale tailnet** (Coordinator decision, Issue #60).
  The Console implements **no** user authentication or roles. This is consistent with
  `docs/deployment.md §5`: the deployment layer (here: tailnet membership and Tailscale ACLs)
  owns who can reach the process. Everyone who can reach the Console can read, write, control,
  attach and — if enabled — manage sessions.
- Consequently the **bind guard is the only Console-side control**: `CONSOLE_BIND` defaults to
  `127.0.0.1`; the server also accepts an address that belongs to a local Tailscale interface
  (`100.64.0.0/10` or the `fd7a:115c:a1e0::/48` range); it **refuses to start** on `0.0.0.0`,
  `::`, or any other non-loopback address. There is no override flag.
- WebSocket/SSE endpoints and state-changing HTTP verify `Origin`/`Host` against the bound
  address so an unrelated website open in the same browser cannot drive the Console.
- T5 (`docs/security.md`): terminal content may contain secrets. Console history is memory-only
  by default, bounded, and excluded from logs. Any persistence is opt-in with retention limits.
- T1/T4: the Console never builds shell strings from user input; the lifecycle adapter executes
  `tmux` as executable + argv with an operator-configured command allowlist.
- T8/S11: terminal output is untrusted data; it is rendered escaped, never executed or used as
  Console policy input.
- Operators who need per-user permissions must implement them with Tailscale ACLs (or place the
  Console behind their own authenticating proxy on the tailnet); that is outside this repository.
- The Console's tmux scope (`TMUX_SOCKET_NAME|PATH`, `TMUX_ALLOWED_SESSIONS`) is the same
  configuration handed to the MCP; the attach/lifecycle adapters must enforce the same allowlist.
- No root; the Console runs as the same ordinary account as the MCP.

Operator runbook (bind to the host's Tailscale address, tailnet ACL examples, systemd user
service, and the explicit no-authentication posture): `docs/web-console-deployment.md`.

## 9. Deferred to Future (explicitly out of MVP)

```text
role/turn parsing of terminal output (user/assistant/tool segmentation, prompt detection)
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
| Open an existing session | MVP, opens the conversation page | WC-UC2 |
| Create session with cwd + command | Operator-enabled lifecycle adapter, argv allowlist only | WC-UC5 / #65 |
| Stop/restart sessions | "Stop" = kill via lifecycle adapter with confirmation; "restart" is deployment supervision and is **not** a Console capability | WC-UC5 / `docs/deployment.md §9` |
| Chat View (markdown, ChatGPT-like) | **MVP default view** as Chat History: user turns = Console sends, output blocks = observed output; no role parsing; markdown is rendered escaped/safe | WC-UC2 / #62 |
| Browse View incl. infinite scrolling | Folded into Chat History's Raw transcript toggle; bounded by the ring ceiling with a visible drop marker | WC-UC2 / #62 |
| Search, copy, bookmarks, keep position | MVP, browser-local | WC-UC2 / #62 |
| Terminal View, Ctrl-C/Escape, arbitrary keys | Advanced debugging/recovery entry via direct attach adapter (not MCP); not the default view | WC-UC4 / #64 |
| Send text; observe updates | MVP via `write_text` / observe+wait | WC-UC3 / #63, WC-UC2 / #62 |
| Jump between sessions | MVP navigation | WC-UC1 |
| Send selected output to another agent session | Deferred (context transfer) — requires its own security review (T5 cross-session data flow) | §9 Future |
| Session history indexing | Deferred; conflicts with memory-only default | §9 Future |
| No writable terminals publicly without authentication | Console is never publicly reachable: it can only bind loopback or a Tailscale address; tailnet membership/ACL is the access control | §8 |

## 12. Repository and CI constraints for `console/`

- own `package.json`, lockfile, TypeScript config; Node.js >= 20; small dependency surface;
- no import from `src/` at runtime; the only product coupling is the public MCP contract;
- `scripts/package-runtime.mjs` output must not contain `console/`;
- the `static-boundary` CI job's `src/` guards stay unchanged; a Console-specific guard must
  reject `new-session|kill-session|attach-session|pipe-pane` outside the two named adapter
  modules and reject any `shell: true`;
- GitHub Actions is the Evidence route for typecheck/unit/integration against real tmux.
