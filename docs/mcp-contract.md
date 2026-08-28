# MCP Contract

## 1. Contract rule

The public MCP surface represents generic terminal Channel capabilities:

```text
Channel discovery
→ Channel observation
→ Text delivery
→ Explicit control
→ Backend health
```

It does not model Workers, Tasks, Issues, Agents, workspaces, deployment providers or collaboration policy.

## 2. MVP tools

### `list_channels`
Discover existing Channels visible within configured backend scope.

Returns bounded structured summaries:

```text
channel_id
backend_kind
backend_locator?
state
capabilities[]
title?
cwd?
last_activity?
backend_metadata?
```

For every successfully returned `backend_kind: tmux` Channel, `backend_metadata.tmux` is required and complete:

```text
session_name : string
window_id    : string
window_index : integer >= 0
pane_id      : string
pane_index   : integer >= 0
```

These fields are backend-owned mechanical tmux facts. `session_name` is the current host tmux label, not Worker/Task/Agent identity. The indices are current positions and may change with tmux layout. `backend_locator` remains opaque/diagnostic; clients are not required to parse it.

### `get_channel`
Inspect one Channel's mechanical metadata and capabilities. Unknown Channel returns `CHANNEL_NOT_FOUND`.

For a current tmux Channel, `get_channel` returns the same complete five-field `backend_metadata.tmux` identity snapshot as `list_channels` for that pane at that moment.

### `read_channel`
Read bounded recent output.

Input:

```text
channel_id
lines?
bytes?
```

Rules:
- finite server maximum;
- explicit truncation;
- no wait-for-completion semantics;
- output is untrusted and potentially sensitive;
- terminal output is not host backend identity authority.

### `write_text`
Deliver bounded ordinary text to one Channel.

Input:

```text
channel_id
text
submit: boolean
```

Rules:
- multi-line Unicode supported within a finite UTF-8 bound;
- LF and TAB are allowed ordinary text;
- other Unicode `Cc` controls are rejected;
- text is data, not shell/tmux key grammar;
- backend execution uses structured process + literal stdin/data paths;
- `submit=false` adds no extra Enter;
- `submit=true` adds one explicit Enter only after text delivery succeeds mechanically;
- mutation addressing remains the opaque `channel_id`; no session selector is added.

Success proves mechanical transport only, not application success.

### `send_control`
Send one explicit terminal control.

Enum:

```text
ENTER
INTERRUPT
ESCAPE
```

Free-form key grammar is not accepted.

### `health`
Report backend/service mechanical health independently from Channel existence and application readiness.

## 3. Deliberately omitted

The product has no:

```text
list_workers
get_worker
create_worker
restart_worker
destroy_worker
assign_task
claim_task
wait_until_done
create_worktree
tmux_command
run_shell_command
create_tunnel
configure_proxy
configure_tls
configure_firewall
manage_workspace_auth
```

Reasons:
- Worker/Task/application semantics belong to upper layers;
- terminal lifecycle is prepared outside Channel MCP;
- deployment/network/auth topology belongs to the operator environment;
- arbitrary backend command tunneling bypasses the product boundary;
- semantic completion cannot be proven by the Channel layer.

## 4. Composition

An upper layer may compose:

```text
prepare terminal externally
→ list/get Channel
→ choose a tmux Channel from backend_metadata.tmux when backend structure matters
→ read_channel if terminal observation is needed
→ write_text
→ send_control if needed
→ interpret application result outside MCP
```

Choosing a host tmux session from structured backend metadata does not give terminal output, title or cwd identity authority.

How the MCP process itself is deployed or reached is not part of this contract.

## 5. Input safety

Ordinary text must not be reinterpreted by the MCP service as:
- shell syntax;
- tmux command syntax;
- tmux key names;
- format-string control language;
- an alternate path for explicit ESC/interrupt controls.

## 6. Output safety

Channel output is untrusted runtime text and may contain sensitive data or adversarial instructions. No generic secret-redaction guarantee is made. It must not override backend-owned structural identity such as `backend_metadata.tmux`.

## 7. Bounds and timeouts

- inventory is bounded;
- reads have finite max lines/bytes;
- writes have a finite UTF-8 byte maximum;
- backend commands have finite timeouts;
- no operation waits for application semantic state.

## 8. Idempotency and ambiguous mutation

- list/get/read/health are read-only;
- `write_text` and `send_control` are not idempotent;
- ambiguous mutation timeout is reported honestly;
- core MCP does not blindly retry mutation calls.

Retry/recovery policy belongs to the upper layer.

## 9. Backend diagnostics and identity metadata

Structured `backend_metadata` may expose sanitized backend-owned mechanical facts needed to inspect or distinguish Channels. For tmux, the five-field identity object above is part of the successful Channel response contract.

`backend_locator` remains opaque/diagnostic. Normal mutation callers still address a Channel with `channel_id` and do not construct raw tmux targets.

## 10. Transport/deployment separation

The current implementation uses an MCP stdio adapter.

A different generic MCP transport adapter may be introduced later if required, but provider/tunnel/TLS/DNS/workspace deployment semantics must not enter Channel tools or domain state.

## 11. Versioning

Breaking changes to Channel identity, read/write semantics, control safety, health semantics or the public tool surface require explicit contract review.

Adding backend-owned response metadata is additive when existing inputs and fields remain unchanged. Adding a backend or changing deployment must not require adding Worker/Task/application semantics.
