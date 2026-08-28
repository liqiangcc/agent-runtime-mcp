# MCP Contract

## 1. Contract rule

The public MCP surface represents generic terminal communication capabilities.

```text
Channel discovery
→ Channel observation
→ Text delivery
→ Explicit control
→ Health
```

It does not model Workers, Tasks, Issues, Agents, workspaces or collaboration policy.

## 2. MVP tools

### `list_channels`

Discover existing channels visible within configured backend scope.

Returns bounded structured summaries:

```text
channel_id
backend_kind
state
capabilities[]
title?
cwd?
last_activity?
```

No terminal output is embedded by default.

### `get_channel`

Inspect one channel's mechanical metadata and capabilities.

Unknown channel returns `CHANNEL_NOT_FOUND`.

### `read_channel`

Read recent output from one channel.

Input concept:

```text
channel_id
lines?
bytes?
```

Requirements:

- finite server-side maximum;
- explicit truncation metadata;
- no wait-for-completion semantics;
- returned text is untrusted and potentially sensitive.

### `write_text`

Deliver ordinary text to one channel.

Input concept:

```text
channel_id
text
submit: boolean
```

Rules:

- multi-line Unicode supported;
- text is data, not shell syntax;
- text is not interpreted as tmux key grammar;
- backend implementation avoids command-string interpolation;
- `submit=true` adds explicit Enter after text delivery.

The MCP does not inspect or constrain the foreground application type. Selecting the correct channel is the caller's responsibility.

### `send_control`

Send one explicit terminal control action.

MVP enum:

```text
ENTER
INTERRUPT
ESCAPE
```

Free-form tmux key grammar is not accepted.

### `health`

Report service/backend health separately from individual channel existence.

## 3. Deliberately omitted

The MVP has no:

```text
list_workers
get_worker
create_worker
restart_worker
destroy_worker
set_external_reference
assign_task
claim_task
wait_until_done
create_worktree
tmux_command
run_shell_command
```

Reasons:

- Worker/Task/Issue concepts belong to upper layers;
- terminal/session lifecycle is prepared outside the Channel MCP;
- arbitrary backend command tunneling would bypass the product boundary;
- semantic completion cannot be proven by the channel layer.

## 4. Composition

A project-specific system may compose tools like:

```text
project dispatcher prepares tmux pane + starts desired CLI
→ list/get channel
→ write_text(task bootstrap)
→ read_channel for observation
→ send_control if needed
```

The Channel MCP neither knows nor records the project Task mapping.

## 5. Input safety

Ordinary text must not be reinterpreted as:

- shell syntax in the MCP service;
- tmux command syntax;
- tmux key names;
- format-string control language.

Control actions use a separate closed enum.

## 6. Output safety

Channel output is untrusted runtime text and may contain sensitive data or adversarial instructions.

The service should normalize terminal control representation as needed for safe text transport, while making no promise of generic secret redaction.

## 7. Bounds and timeouts

All operations have finite bounds.

- inventory has bounded result size;
- reads have max lines/bytes;
- backend commands have timeouts;
- no call waits indefinitely for application-level state.

## 8. Idempotency

- list/get/read/health are read-only;
- `write_text` is not idempotent;
- `send_control` is not idempotent.

Clients must not blindly retry mutation calls after an ambiguous timeout without considering duplicate input risk.

## 9. Backend diagnostics

Optional sanitized backend metadata may be returned for diagnosis, but callers should not need to construct raw tmux targets for normal use.

## 10. Versioning

Breaking changes to channel identity, read/write semantics, control safety or authentication require explicit contract review.

Adding a backend should not require adding Agent/Task semantics.
