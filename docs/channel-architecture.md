# Channel Architecture

## Product boundary

`agent-runtime-mcp` is a communication adapter between an MCP client and existing interactive terminal endpoints.

```text
upper-layer orchestration
        ↓
remote MCP ingress
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

## Inside the product

- authenticated MCP ingress;
- channel discovery;
- channel metadata inspection;
- bounded recent-output read;
- ordinary text delivery;
- explicit terminal control actions;
- backend and channel health/error reporting;
- backend-neutral channel identifiers.

## Outside the product

- Worker/Agent identity;
- Task/Issue/Attempt semantics;
- project scheduling and review;
- worktree/branch/PR management;
- tmux session/pane creation;
- program startup/restart;
- recovery and cleanup policy;
- mapping a project Task to a particular terminal.

## Core invariants

1. Channel is the public domain object.
2. MVP operates on endpoints prepared outside the MCP.
3. The service does not infer semantic Agent/Task state from terminal text or activity.
4. Normal clients address `channel_id`, not raw tmux target grammar.
5. Failures do not create/restart/destroy terminal endpoints.
6. The service stores no Worker registry or Task registry.
7. Changing the collaboration system or interactive program must not require changing the Channel contract.
8. Network access to write-capable channels requires explicit authentication/authorization.

## Internal layers

```text
MCP transport adapter
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

## Identity

See `channel-model.md`.

A tmux implementation may derive a channel handle from configured tmux server/socket scope plus pane identity. If a pane is destroyed and recreated, it may appear as a new channel. Persistent logical Worker identity is intentionally an upper-layer concern.

## Failure interpretation

- backend unavailable → backend error;
- pane missing → channel not found/unavailable;
- program exits but pane remains → still a channel fact only;
- quiet terminal → no semantic conclusion;
- terminal output says "done" → no semantic conclusion.

## Repository development workflow

This repository uses `docs/tasks/` and `.agents/skills/` to coordinate its own development. That workflow is separate from the product architecture. It may later consume Channel MCP as a transport, but it is not implemented by Channel MCP itself.
