# agent-runtime-mcp

A secure MCP communication channel for existing interactive terminal sessions, with tmux as the first backend.

## Product intent

The core product is deliberately small:

```text
remote MCP client
→ agent-runtime-mcp
→ existing terminal channel
```

It provides:

```text
list channels
inspect channel
read bounded output
write text
send explicit control
check health
```

It does **not** decide what the terminal represents.

A channel may contain Codex, another Agent CLI, a shell, a REPL or another interactive program.

## Boundary

Inside product:

- secure remote MCP ingress;
- backend-neutral Channel model;
- existing-channel discovery;
- bounded terminal output read;
- safe text delivery;
- explicit Enter/interrupt/escape control;
- tmux backend health/errors.

Outside product:

- Worker/Agent identity;
- Issue/Task/Attempt semantics;
- scheduling and assignment;
- git worktree/branch/PR lifecycle;
- tmux session/pane creation;
- starting/restarting Codex;
- recovery/cleanup policy;
- mapping a project task to a terminal.

Those concerns belong to whatever upper-layer collaboration or automation system uses this MCP.

## Example composition

A project-specific Dispatcher may do:

```text
create worktree
→ create tmux pane
→ start Codex
→ discover pane through agent-runtime-mcp
→ write_text(task handoff)
```

`agent-runtime-mcp` only owns the communication step.

## Public design target

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

No Worker registry or session lifecycle API is part of the core MVP.

## Documentation

Product contract:

- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/deployment.md`
- `docs/mvp-plan.md`

Repository development process:

- `AGENTS.md`
- `docs/tasks/`
- `.agents/skills/`

The repository workflow is intentionally separate from the product protocol.

## Current phase

Canonical design is being narrowed from the earlier managed-Worker Runtime concept to the Channel-only model before implementation begins.
