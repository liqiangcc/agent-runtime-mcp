# Requirements

## 1. Product goal

`agent-runtime-mcp` provides generic MCP capabilities for communicating with already-existing interactive terminal Channels.

The product lets an MCP client:

```text
discover Channel
→ inspect mechanical metadata
→ read bounded recent output
→ write bounded ordinary text
→ send a small explicit control set
→ inspect backend/service health
```

The first backend is tmux.

The product boundary is **MCP Channel capability**, not deployment, network reachability, tunnel/provider integration, authentication topology, Worker management, Task coordination, workspace management, or terminal lifecycle.

## 2. Core use cases

### UC1 — Discover Channels
List existing terminal Channels visible inside the configured backend scope.

### UC2 — Inspect a Channel
Return mechanical metadata and supported capabilities without inferring Agent/Task/application state.

### UC3 — Read bounded output
Read finite recent terminal output with explicit truncation metadata.

### UC4 — Write ordinary text
Send bounded multi-line Unicode text as data without shell interpolation or caller-controlled tmux key grammar.

Rules:
- LF (`\n`) and TAB (`\t`) are allowed ordinary text;
- other Unicode `Cc` controls are rejected by `write_text`;
- `submit=false` adds no extra Enter;
- `submit=true` adds one explicit Enter only after successful text transport.

### UC5 — Send explicit control
Support exactly:

```text
ENTER
INTERRUPT
ESCAPE
```

### UC6 — Check backend/service health
Report mechanical backend/service health independently from Channel inventory, application readiness, Worker/Task state, deployment reachability, or recovery policy.

## 3. Required MVP capabilities

```text
inventory
channel-inspection
bounded-read
text-write
control-input
backend-health
```

Canonical public tools:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

## 4. Explicit product boundary

The MCP does not own or interpret:

```text
Worker / Agent identity or lifecycle
Issue / Task / Attempt semantics
scheduling / assignment / review
worktree / branch / PR lifecycle
tmux session/pane creation or destruction
process startup / restart / recovery
application success / completion semantics
deployment topology
remote ingress / tunnel / proxy
TLS / DNS / firewall / host administration
workspace/client authorization policy
provider account or credential lifecycle
```

Those concerns may exist around the MCP, but they are not MCP capabilities of this product.

## 5. Channel semantics

See `docs/channel-model.md`.

Key requirements:
- Channel identity is backend-neutral at the MCP boundary;
- normal callers use `channel_id`, not raw tmux target grammar;
- Channel state is mechanical (`available | unavailable | unknown`);
- no semantic `idle`, `working`, `done`, `blocked`, or review state;
- input/output are bounded;
- missing facts degrade to unknown rather than being inferred from terminal prose.

## 6. tmux lifecycle boundary

Tmux endpoints are prepared outside the MCP.

The service may communicate with already-existing panes, but it does not perform:

```text
new-session
new-window
split-window
kill-session
kill-pane
respawn-pane
start/restart interactive program
create worktree
```

If a Channel disappears, return a structured failure. Do not recreate it.

## 7. Backend visibility policy

Configuration defines the tmux namespace visible to the backend, for example:
- one tmux socket/server;
- one OS account;
- optional exact session allowlist.

No MCP operation may silently expand beyond that scope.

## 8. Transport and deployment boundary

The current implementation can run as an MCP server over stdio.

How an operator makes that MCP server reachable from another machine or product is a **deployment concern**. Tunnel choice, public/private networking, proxying, authentication, TLS and workspace integration are not product acceptance criteria for `agent-runtime-mcp`.

A future generic MCP transport adapter may be added only if a distinct MCP-capability use case requires it. It must not turn deployment/provider semantics into Channel semantics.

## 9. Security requirements

Within the MCP capability boundary:
- backend commands use structured executable/argv/stdin paths, never shell string interpolation;
- ordinary text is bounded data;
- explicit controls use a closed enum;
- Channel scope is enforced for read/write/control;
- reads and writes are finite;
- full terminal payloads are not logged by default;
- normal operation requires no root;
- failures do not trigger endpoint lifecycle actions;
- non-idempotent mutations are not blindly retried after ambiguous timeouts.

If an operator exposes the MCP remotely, securing that deployment is the operator/deployment layer's responsibility and must not be modeled as Channel state.

## 10. Structured failures

The product may report categories such as:

```text
CHANNEL_NOT_FOUND
CHANNEL_UNAVAILABLE
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
INVALID_ARGUMENT
CAPABILITY_UNSUPPORTED
PERMISSION_DENIED
TIMEOUT
```

Operations do not wait for application-level semantic completion.

## 11. Non-goals

The MVP does not attempt to:
- deploy itself to a network;
- verify or manage a tunnel/provider;
- implement workspace authorization policy;
- replace GitHub/Jira/another collaboration system;
- manage Agent Workers;
- infer application completion;
- create/restart/destroy terminal endpoints;
- provide a generic host-admin or shell-command API;
- store complete terminal history;
- manage distributed hosts.

## 12. MVP success criteria

The Channel MCP capability set is complete when an MCP client can:

1. discover an already-existing tmux pane as a Channel;
2. inspect it through structured metadata;
3. read bounded recent output;
4. write bounded ordinary Unicode text safely;
5. send ENTER / INTERRUPT / ESCAPE explicitly;
6. query mechanical backend/service health;
7. receive structured failure when a Channel/backend disappears;
8. do all of the above without Worker/Task/application semantics;
9. do all of the above without endpoint lifecycle authority;
10. demonstrate one upper-layer use case that consumes the six MCP capabilities while keeping workflow meaning outside the product.
