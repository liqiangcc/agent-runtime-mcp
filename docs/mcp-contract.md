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

Issue #32 records an additive contract revision before implementation: the current main runtime still exposes six tools, while the target contract below exposes seven after a Candidate is implemented and verified.

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

When observation is supported, `capabilities[]` additionally contains `observe`. Observation is a bounded `snapshot_change` model; it is not a byte-stream or semantic state feed.

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

For a current tmux Channel, `get_channel` returns the same complete five-field `backend_metadata.tmux` identity snapshot as `list_channels` for that pane at that moment. It accepts optional `observe: boolean` (default `false`). With `observe:true`, it creates or joins the shared observer and returns:

```text
observation.cursor        # opaque, lease-bound
observation.channel_instance  # opaque endpoint-generation value
observation.model         # snapshot_change
observation.issued_at
observation.valid_until
observation.continuity     # complete
```

The cursor must be acquired before an upper-layer write. It is not a read offset or authorization bypass.

### `wait_channel_event`

Wait for a bounded mechanical observation of output activity followed by observed quiet. This is the seventh public tool in the Issue #32 target contract.

Input:

```text
channel_id
after_cursor
idle_ms
timeout_ms
```

The result contains `reason: output_idle | timeout | channel_closed`, `channel_id`, opaque `channel_instance`, UTC ISO-8601 wall-clock `observed_at` plus optional UTC ISO-8601 first/last activity timestamps, `activity_observed`, `observation_model: snapshot_change`, `idle_ms`, `timeout_ms`, and exactly one continuation field: `next_cursor`. Monotonic timestamps are internal only for idle/deadline calculations.

`output_idle` requires new snapshot activity strictly after `after_cursor` and advances `next_cursor`. `timeout` preserves `after_cursor`; it never acknowledges internally sampled activity. `channel_closed` is returned only for confirmed same-server same-instance loss. `BACKEND_UNAVAILABLE` and uncertain disappearance remain explicit failures, never closure. Cancellation returns no successful result and releases the waiter.

The server uses a monotonic absolute deadline. A late backend sample completed at/after the deadline cannot beat `timeout`; a stale/overrun sample is a continuity error. Quiet is never application completion or success.

For tmux, every sample revalidates configured visibility and the server-generation/pane identity immediately before and immediately after `capture-pane`; a mismatch or failed `/proc` identity read discards the capture and invalidates observation. Pane id plus server generation is the endpoint lifetime basis; session names and window/pane indices are mutable location metadata. A pane process replacement is a new Channel instance unless the backend can prove continuity.

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
→ get_channel(observe=true) before write_text when a bounded wait is needed
→ read_channel if terminal observation is needed
→ write_text
→ wait_channel_event
→ read_channel
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
- observation leases, history, waiters and sampling concurrency are finite;
- `idle_ms`/`timeout_ms` have finite server-side maxima and use a monotonic clock;
- no operation waits for application semantic state.

For v0.2.0 the server limits are fixed: `idle_ms` default 1000 (range 250..60000), `timeout_ms` default 30000 (range 100..60000), 250 ms sampling with no public tuning, 8 observers globally, 2 waiters per Channel and 16 globally, 2 global sampling subprocess batches, 200 capture lines/64 KiB per sample, 256 history records/64 KiB, 4 MiB retained observer state, and a 5-minute cursor lease with a 15-minute observer lifetime cap. These are implementation ceilings to verify on the Candidate, not promises about web-host or tunnel timeouts.

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
