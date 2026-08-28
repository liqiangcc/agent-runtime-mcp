# Channel Architecture

## Product boundary

`agent-runtime-mcp` is the **Channel communication core** between an MCP transport and already-existing interactive terminal endpoints.

```text
remote / upper-layer client
        ↓
secure ingress adapter / tunnel     # deployment composition
        ↓
local MCP transport                 # currently stdio
        ↓
Channel Service
        ↓
ChannelBackend
        ↓
TmuxBackend
        ↓
existing tmux panes
```

The upper layer decides why a terminal exists, what program runs there, what workspace it uses, and what instructions should be sent.

The secure remote path may be supplied by an external supported MCP ingress adapter. Remote network reachability does **not** have to be implemented inside the Channel core.

## Inside the Channel core

- MCP tool/schema contract;
- local MCP transport adapter (MVP implementation: stdio);
- channel discovery;
- channel metadata inspection;
- bounded recent-output read;
- bounded ordinary text delivery;
- explicit terminal control actions;
- backend/service health reporting;
- backend-neutral channel identifiers;
- structured Channel/backend errors.

## Deployment composition around the core

A deployment may add:

- authenticated remote MCP tunnel/ingress;
- client/workspace authorization;
- local process supervision for the MCP server;
- network/private-connectivity prerequisites.

Those components may make the Channel MCP remotely reachable, but they must not redefine Channel semantics.

For the MVP remote path, a supported external tunnel may bridge a remote client to the existing local stdio MCP server without adding a public listener to `agent-runtime-mcp`.

A future direct-public HTTP deployment, if needed, is a separate transport adapter concern and must use the then-current MCP HTTP/auth rules. It is not required merely to prove the Channel product.

## Outside the product domain

- Worker/Agent identity;
- Task/Issue/Attempt semantics;
- project scheduling and review;
- worktree/branch/PR management;
- tmux session/pane creation;
- program startup/restart inside panes;
- recovery and cleanup policy;
- mapping a project Task to a particular terminal;
- tunnel/provider account provisioning;
- DNS/firewall/host administration.

## Core invariants

1. Channel is the public domain object.
2. MVP operates on terminal endpoints prepared outside the MCP.
3. The service does not infer semantic Agent/Task state from terminal text or activity.
4. Normal clients address `channel_id`, not raw tmux target grammar.
5. Failures do not create/restart/destroy terminal endpoints.
6. The service stores no Worker registry or Task registry.
7. Changing the collaboration system or foreground program must not require changing the Channel contract.
8. Write-capable remote access must pass a reviewed authorization boundary **before** it reaches the Channel core.
9. Network ingress and Channel semantics have different reasons to change and remain separable.
10. Remote connection/tunnel lifetime does not own Channel/tmux-pane lifetime.

## Internal layers

```text
local MCP transport adapter
→ MCP schema adapter
→ Channel application service
→ ChannelBackend
→ TmuxBackend
```

The Channel service exposes operations equivalent to:

```text
list
inspect
read
write_text
send_control
health
```

No internal layer needs to know whether a remote caller arrived through a tunnel, direct HTTP adapter, or another supported ingress composition.

## Identity

See `channel-model.md`.

A tmux implementation may derive a channel handle from configured tmux server/socket scope plus pane identity. If a pane is destroyed and recreated, it may appear as a new channel. Persistent logical Worker identity is intentionally an upper-layer concern.

## Failure interpretation

- secure ingress/tunnel unavailable → remote reachability failure, not a Channel fact;
- authorization rejected → caller does not enter protected Channel operations;
- backend unavailable → backend error;
- pane missing → channel not found/unavailable;
- program exits but pane remains → still a channel fact only;
- quiet terminal → no semantic conclusion;
- terminal output says `done` → no semantic conclusion.

None of these failures grants endpoint lifecycle authority to the Channel core.

## Repository development workflow

This repository uses `docs/tasks/` to coordinate its own development. That workflow is separate from the product architecture. It may consume Channel MCP as transport, but it is not implemented by Channel MCP itself.
