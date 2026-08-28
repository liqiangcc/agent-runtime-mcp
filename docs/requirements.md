# Requirements

## 1. Product goal

Provide a secure MCP communication channel for existing interactive terminal endpoints.

The product lets an MCP client remotely:

```text
discover channel
→ inspect channel metadata
→ read bounded recent output
→ write ordinary text
→ send a small explicit set of control actions
```

The first backend is tmux.

The product boundary is **terminal channel transport**, not Worker management, Agent scheduling, Task coordination, repository workspace management, or tmux lifecycle automation.

## 2. Intended usage

A higher-level system may prepare a terminal however it wants:

```text
create worktree
→ create tmux session/pane
→ start Codex / shell / REPL / another CLI
→ use agent-runtime-mcp as the communication path
```

Those preparation steps are outside this MCP.

The MCP does not need to know why the channel exists or what program is running inside it.

## 3. Core use cases

### UC0 — Secure remote access

An authorized MCP client can reach the service through a supported secure remote MCP path without exposing unauthenticated terminal-input authority.

### UC1 — Discover channels

List existing terminal channels visible within the configured backend boundary.

Results are structured; callers do not parse human `tmux ls` output.

### UC2 — Inspect a channel

Return mechanical metadata for one channel, such as backend, availability, optional cwd/title and supported capabilities.

The MCP does not classify semantic Agent/Task state.

### UC3 — Read channel output

Read a bounded amount of recent terminal output with explicit truncation metadata.

### UC4 — Write ordinary text

Send bounded multi-line Unicode text as data to a selected channel without shell interpolation or accidental tmux-key interpretation.

Text/control separation is explicit:

- LF (`\n`) and TAB (`\t`) are allowed ordinary text characters;
- other Unicode control characters in the `Cc` category are rejected by `write_text` so ESC/interrupt-like controls cannot bypass `send_control`;
- `submit=false` means the MCP appends no additional Enter action; it does not promise how the foreground application interprets embedded LF characters;
- `submit=true` performs text delivery first, then adds one explicit Enter action only after successful text delivery.

### UC5 — Send explicit control input

Support a small closed set:

```text
ENTER
INTERRUPT
ESCAPE
```

Free-form terminal/tmux key grammar is not part of ordinary text input.

### UC6 — Check service/backend health

Distinguish remote MCP ingress health from backend availability and channel existence.

## 4. Required MVP capabilities

```text
remote-mcp-ingress
inventory
channel-inspection
bounded-read
text-write
control-input
backend-health
```

Not required:

```text
worker-registry
worker-create
worker-restart
worker-destroy
external-task-reference
worktree-management
process-startup
session-lifecycle
scheduler
```

## 5. Channel semantics

Canonical domain model: `docs/channel-model.md`.

Key requirements:

- channel identity is backend-neutral at the MCP boundary;
- tmux target syntax is not required from normal callers;
- channel state is mechanical (`available | unavailable | unknown`);
- no semantic `idle`, `busy`, `working`, `done`, `blocked`, or review state;
- output is bounded;
- input is bounded;
- last activity, if exposed, is an I/O observation only;
- missing facts degrade to unknown rather than being inferred from terminal prose.

## 6. Explicit product boundary

The MCP must not own or interpret:

- Worker identity or Worker lifecycle;
- Agent type (Codex, Claude Code, shell, REPL, etc.);
- GitHub Issue/Task/Attempt state;
- project priority or scheduling;
- Task assignment or claim;
- success/acceptance/review decisions;
- git worktree/branch/PR lifecycle;
- tmux session/pane creation policy;
- process startup/restart/recovery policy;
- cleanup policy.

A higher-level collaboration system may compose these concerns with Channel MCP tools.

## 7. tmux lifecycle boundary

For MVP, tmux channels are prepared outside the MCP.

The service may discover and communicate with already-existing panes, but it does not:

```text
new-session
new-window
split-window
kill-session
kill-pane
start Codex
restart Codex
create worktree
```

If a channel disappears, return a structured failure; do not recreate it.

## 8. Backend visibility policy

Deployment must define what tmux scope is visible to the service, for example:

- configured tmux socket/server;
- operating-system account boundary;
- optional session-name/filter allowlist.

The MCP must not silently expand beyond the configured terminal namespace.

## 9. Remote ingress requirements

- GPT Web or another MCP client must reach the server through a currently supported authenticated remote MCP integration path.
- Private/local deployment should prefer supported private/tunnel connectivity when appropriate.
- Direct network exposure requires HTTPS and standards-compatible authentication/authorization.
- UI confirmation is not the server authorization boundary.
- current MCP SDK/transport compatibility must be verified at implementation time.

## 10. Security requirements

Terminal write access is approximately terminal-input authority for every exposed channel.

Therefore:

- unauthenticated remote write access is forbidden;
- backend commands use structured argv/process APIs and explicit stdin/data paths, not shell string concatenation;
- ordinary text is transported as bounded data;
- ordinary text cannot smuggle explicit ESC/interrupt control characters through the text API;
- control input is a closed enum;
- reads are bounded and potentially sensitive;
- service logs do not record full terminal text/write payloads by default;
- the service runs with ordinary least-privilege OS permissions;
- no root is required for normal operation.

See `docs/security.md`.

## 11. Operational requirements

Structured failures should include categories such as:

```text
CHANNEL_NOT_FOUND
CHANNEL_UNAVAILABLE
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
INVALID_ARGUMENT
CAPABILITY_UNSUPPORTED
PERMISSION_DENIED
TIMEOUT
AUTHENTICATION_REQUIRED
```

Operations have finite input/output bounds and finite timeouts and do not wait for semantic completion.

Mutation calls are non-idempotent. An ambiguous timeout must not trigger a blind automatic retry inside the core MCP.

## 12. Non-goals

The MVP does not attempt to:

- replace GitHub/Jira/another collaboration system;
- manage Agent Workers;
- choose or assign Tasks;
- infer Agent completion from terminal output;
- start/restart/destroy terminal sessions;
- create repository workspaces;
- provide a generic host-admin API;
- expose arbitrary tmux command grammar;
- store complete terminal history;
- manage distributed execution hosts.

## 13. MVP success criteria

The first usable version is successful when an authenticated remote MCP client can:

1. discover an already-existing tmux pane as a Channel;
2. inspect that Channel through structured metadata;
3. read bounded recent output;
4. write bounded multi-line Unicode text safely as ordinary data;
5. send Enter/interrupt/escape explicitly through the closed control API;
6. receive structured failure when the pane/backend disappears;
7. reconnect and rediscover currently existing panes without a separate Worker registry;
8. perform all of the above without knowing Codex, Worker, Issue, Task, worktree, or collaboration semantics;
9. avoid unauthenticated public terminal control;
10. demonstrate one upper-layer collaboration flow using the MCP purely as transport, with all Task meaning remaining outside the product.
