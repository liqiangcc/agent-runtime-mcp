# Channel Architecture

## 1. Product boundary

`agent-runtime-mcp` is a generic MCP Channel capability layer over already-existing interactive terminal endpoints.

```text
MCP client
   ↓
MCP tool/schema adapter
   ↓
Channel Service
   ↓
ChannelBackend
   ↓
TmuxBackend
   ↓
existing tmux panes
```

The product answers:

> Can an MCP client communicate mechanically with this existing terminal Channel?

It does not answer why the terminal exists, what application meaning its output has, how the endpoint is deployed, or what workflow should happen next.

## 2. Inside the product

- MCP tool/schema contract;
- Channel discovery;
- Channel metadata inspection;
- bounded recent-output read;
- bounded ordinary-text write;
- explicit terminal controls;
- backend/service health;
- backend-neutral `channel_id`;
- structured Channel/backend errors;
- backend scope enforcement.

The current server transport is stdio. That is an implementation adapter, not a deployment topology.

## 3. Outside the product

```text
Worker / Agent identity
Task / Issue / Attempt semantics
workflow scheduling / review
worktree / branch / PR lifecycle
tmux session/pane lifecycle
foreground process startup/restart
recovery / cleanup policy
application semantic interpretation
remote ingress / tunnel / proxy
TLS / DNS / firewall
workspace/client authorization policy
provider account / credential lifecycle
host/service deployment
```

Deployment components may wrap the MCP server, but they are not part of the Channel domain or product roadmap.

## 4. Core invariants

1. Channel is the only public domain object.
2. The MCP operates on endpoints prepared outside the product.
3. Channel output/activity never becomes semantic Agent/Task/application state.
4. Normal callers use `channel_id`, not raw tmux target grammar.
5. Failures never grant endpoint lifecycle authority.
6. There is no Worker or Task registry.
7. Collaboration systems and foreground programs can change without changing the Channel contract.
8. Deployment/network topology can change without changing the Channel contract.
9. Backend-specific mechanics stay behind `ChannelBackend`.
10. MCP capability and workflow control remain separate.

## 5. Internal layers

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

No internal layer needs tunnel/provider/workspace concepts.

## 6. Identity

See `channel-model.md`.

A tmux Channel may derive its locator from configured tmux scope plus pane identity. If a pane is destroyed and recreated, it may become a different Channel. Persistent logical Worker/application identity belongs to an upper layer.

## 7. Failure interpretation

```text
backend unavailable → backend fact
pane missing         → Channel fact
program exits        → terminal observation only
quiet pane           → no semantic conclusion
output says "done"   → no semantic conclusion
```

Network/tunnel/deployment failures, if any, belong to whatever external environment is carrying the MCP connection and are not Channel facts.

## 8. Repository workflow separation

`docs/tasks/`, `AGENTS.md`, GitHub Issues and Web Workers coordinate development of this repository. They are not product concepts and must not leak into MCP code or public schemas.
