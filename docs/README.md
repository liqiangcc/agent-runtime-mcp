# Documentation Map

This repository contains three different concerns that must not be conflated.

## A. Product contract — agent-runtime-mcp

Reading order:

1. `requirements.md` — product goals and non-goals
2. `channel-architecture.md` — system boundary and separation points
3. `channel-model.md` — backend-neutral Channel model
4. `mcp-contract.md` — public MCP tools and semantics
5. `backends/tmux.md` — tmux backend mechanics
6. `security.md` — safety inside the MCP capability boundary
7. `technology-stack.md` — implementation stack
8. `mvp-plan.md` — product capability sequence

Core design sequence:

```text
use case
→ separation point
→ Channel capability
→ backend contract
→ MCP tool
```

The product surface is:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

The product does not define Worker/Task semantics, endpoint lifecycle, workflow control or deployment infrastructure.

## B. Deployment guidance — not product capability

`deployment.md` exists to document the boundary around the MCP process.

Tunnel/provider/network/TLS/DNS/firewall/workspace authorization are operator concerns. They are not product Tasks or MCP domain concepts.

## C. Repository development workflow — not product protocol

This repository is developed using:

```text
AGENTS.md
docs/tasks/
GitHub Issues
separate GPT Web Worker conversations
GitHub Actions
```

Default repository flow:

```text
Coordinator publishes
→ separate Web GPT Worker claims one Attempt
→ GitHub Actions supplies executable Evidence
→ Coordinator reviews
```

These collaboration concepts must not appear in public MCP schemas or Channel logic.

## Migration note

`architecture.md` and `runtime-model.md` belong to the earlier managed-Worker Runtime design. The canonical product architecture/model are `channel-architecture.md` and `channel-model.md`.
