# Channel Model

## 1. Purpose

`agent-runtime-mcp` exposes terminal communication channels through MCP.

The product model is **Channel**, not Worker, Task, Issue, Agent, Codex session, worktree, or process scheduler.

A Channel is an already-existing interactive terminal endpoint that the configured backend can observe and/or write to.

## 2. Core entity

```text
Channel
├── channel_id
├── backend_kind
├── backend_locator?      # diagnostic/opaque
├── state
├── capabilities[]
├── title?                # backend-provided display metadata
├── cwd?                  # observable metadata only
├── last_activity?        # mechanical I/O observation only
└── backend_metadata?     # structured backend-owned mechanical identity/metadata
```

### `channel_id`

Stable-enough API identity for addressing one channel during its lifetime. Callers should not need to construct raw tmux target syntax.

The first backend may derive identity from tmux pane identity plus configured server/socket scope. Cross-recreation persistence is not a product guarantee.

### `backend_kind`

MVP:

```text
tmux
```

Future channel backends may include PTY or SSH terminal transports, but adding them must not introduce Agent/Task semantics into the core model.

### `backend_locator`

Backend-owned diagnostic address. It may be returned in sanitized form but is not the semantic public model and callers are not required to parse it.

### `backend_metadata`

Optional backend-owned structured mechanical metadata. It carries backend facts without turning them into Worker/Task/application identity.

For every successfully discovered tmux Channel, `backend_metadata.tmux` is complete:

```text
session_name : string
window_id    : string
window_index : integer >= 0
pane_id      : string
pane_index   : integer >= 0
```

`session_name`, `window_id`, and `pane_id` are tmux-owned textual values. The indices are current positions and may change when tmux renumbers or rearranges windows/panes. This metadata is suitable for selecting a host tmux Channel structurally; normal read/write/control addressing still uses opaque `channel_id`.

Title, cwd and terminal output are observations/display data and are not host tmux identity authority.

## 3. Channel state

State is deliberately mechanical:

```text
available
unavailable
unknown
```

Optional backend metadata may report process/terminal facts, but the Channel MCP does not infer semantic states such as:

```text
idle
busy
working
done
waiting-review
blocked
```

Those meanings belong to upper-layer clients or collaboration systems.

## 4. Capabilities

A Channel exposes explicit transport capabilities:

```text
read
write-text
control
```

Backend/service capability may additionally expose:

```text
health
inventory
```

The MCP does not expose Worker-create, Task-assign, Issue-claim, restart-policy, worktree-management, or scheduler capabilities.

## 5. Output observation

```text
ChannelRead
├── channel_id
├── captured_at
├── text
├── truncated
├── line_count?
└── byte_count?
```

Requirements:

- finite server-side bounds;
- explicit truncation;
- no durable full-history storage by default;
- captured text is untrusted and potentially sensitive;
- no semantic Task/Agent state inference from text;
- captured text is not backend identity authority.

## 6. Text input

Ordinary text is transported as data:

```text
WriteText
├── channel_id
├── text
└── submit: true | false
```

`submit=true` means text delivery followed by explicit Enter semantics.

The MCP does not inspect whether the foreground program is Codex, a shell, REPL, editor, or another interactive program. The caller is responsible for choosing the correct channel; for tmux, structured `backend_metadata.tmux` can identify the host session/window/pane without parsing terminal text.

## 7. Control input

MVP control actions are intentionally narrow:

```text
ENTER
INTERRUPT
ESCAPE
```

The public API does not accept arbitrary tmux key grammar.

## 8. Discovery semantics

The backend discovers channels that are visible within the configured backend boundary.

For tmux, deployment may restrict discovery by configured socket/server/account/session filters. Successful tmux Channels expose the complete five-field `backend_metadata.tmux` snapshot described above. Malformed required backend identity fails closed rather than silently omitting identity fields.

The Channel MCP does not maintain a separate Worker registry or Task mapping.

If an upper layer wants a mapping such as:

```text
Issue #12 → tmux pane %7
```

that mapping belongs to that upper layer.

## 9. Lifecycle boundary

Core MVP does not create, restart, destroy, or recover tmux sessions/panes.

```text
session/pane creation
process startup
Codex startup
worktree creation
restart/recovery policy
cleanup policy
```

are outside the Channel MCP.

If a referenced channel disappears, return a structured channel-not-found/unavailable result. Do not recreate it automatically.

## 10. Deliberately absent concepts

The Channel model has no authoritative fields for:

```text
worker_id
agent_type
task_reference
issue_status
task_status
attempt
priority
review_status
accepted
next_task
worktree
branch
PR
```

These are all upper-layer concerns.

## 11. Boundary test

A proposed MCP capability belongs in the core only if it remains useful when:

- GitHub is replaced by another task system;
- Codex is replaced by another CLI program;
- there is no Issue/Task model at all;
- the tmux pane was prepared manually by a human.

This keeps the product a communication channel rather than a collaboration framework or remote development scheduler.
