# Documentation Map

This repository contains two different kinds of documentation that must not be conflated.

## A. Product contract — agent-runtime-mcp

Reading order:

1. `requirements.md` — product goals and explicit non-goals
2. `channel-architecture.md` — product/system boundary
3. `channel-model.md` — backend-neutral Channel domain model
4. `mcp-contract.md` — public MCP tools and semantics
5. `backends/tmux.md` — first Channel backend
6. `security.md` — terminal-channel security boundary
7. `deployment.md` — secure remote MCP exposure
8. `technology-stack.md` — implementation stack decision
9. `mvp-plan.md` — implementation sequence

Product authority:

```text
requirements.md
→ externally meaningful behavior / scope

channel-architecture.md
→ system boundary and invariants

channel-model.md
→ Channel semantics

mcp-contract.md
→ public MCP behavior

backends/*.md
→ backend-specific behavior

security.md / deployment.md
→ trust/deployment constraints
```

Core design sequence:

```text
communication need
→ Channel capability
→ Channel model
→ backend contract
→ MCP tool
```

The product does **not** define Workers, Tasks, Issues, worktrees, Agent scheduling or tmux lifecycle.

## B. Repository development workflow — not product protocol

This repository is itself developed using:

```text
docs/tasks/
.agents/skills/
AGENTS.md
```

Those files define this project's collaboration lifecycle:

```text
Publisher → Dispatcher → Worker → Reviewer
```

They may use tmux/Codex and may later use Channel MCP as transport, but they are not part of the public MCP capability model.

A future user of `agent-runtime-mcp` may have a completely different collaboration system or no Task system at all.

## Migration note

`architecture.md` and `runtime-model.md` belonged to the earlier managed-Worker Runtime design. The canonical product architecture/model are now `channel-architecture.md` and `channel-model.md`.
