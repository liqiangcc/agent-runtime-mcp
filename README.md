# agent-runtime-mcp

MCP-based persistent runtime for coordinating terminal-based AI workers, with tmux as the first execution backend.

## Project intent

`agent-runtime-mcp` provides the **execution plane** used by a long-lived GPT Web Coordinator to remotely observe and control persistent Codex workers without making terminal state the source of truth for project work.

```text
                    GPT Web
                   Coordinator
                       │
          ┌────────────┴────────────┐
          │                         │
       GitHub MCP           Remote MCP ingress
          │                         │
   Control / State Plane     authenticated/tunnel
          │                         │
     GitHub Issues            agent-runtime-mcp
                                    │
                              Execution Plane
                                    │
                               RuntimeBackend
                                    │
                                   tmux
                                    │
                            ┌───────┼───────┐
                            │       │       │
                          Codex   Codex   Codex
```

## Core boundaries

- **GPT Web** is the project Coordinator: planning, task split, publication, review, acceptance and recovery.
- **GitHub Issue** is the live Task state and append-only coordination history.
- **`task.md`** is the stable Task execution contract.
- **Codex** is a short-lived Worker that executes one Issue Attempt at a time.
- **Remote MCP ingress** is the authenticated path by which GPT Web reaches the Runtime service.
- **`agent-runtime-mcp`** owns runtime observation and control, not project Task state.
- **tmux** is the first Runtime Backend, not the public architecture boundary.

The central invariant is:

> **Runtime state is not Task state.**

An idle pane does not mean an Issue is complete. A Worker can only report execution results; the GPT Web Coordinator decides whether the Task is accepted.

Another important separation is:

```text
remote MCP ingress
!= remote Runtime Backend
```

The MVP requires secure GPT Web → MCP access, while SSH/multi-host Runtime Backends can remain future work.

## Design approach

The project follows a use-case-first sequence:

```text
Coordinator / Operator Goal
→ Use Case
→ Required Capability
→ Runtime Model
→ Backend Contract
→ MCP Tool Contract
```

It intentionally does **not** start from tmux commands and expose them one-for-one as MCP tools.

## Documentation

- [`docs/README.md`](docs/README.md) — documentation authority and reading order
- [`docs/requirements.md`](docs/requirements.md) — product goals, use cases and non-goals
- [`docs/architecture.md`](docs/architecture.md) — control-plane / ingress / execution-plane architecture
- [`docs/runtime-model.md`](docs/runtime-model.md) — Worker and Runtime domain model
- [`docs/mcp-contract.md`](docs/mcp-contract.md) — MCP capability and tool contract
- [`docs/deployment.md`](docs/deployment.md) — GPT Web remote MCP ingress and deployment topology
- [`docs/backends/tmux.md`](docs/backends/tmux.md) — tmux backend design
- [`docs/security.md`](docs/security.md) — security boundaries
- [`docs/mvp-plan.md`](docs/mvp-plan.md) — implementation sequence and dogfooding plan
- [`docs/tasks/README.md`](docs/tasks/README.md) — Issue-driven Task packaging

## Collaboration model

The repository uses the same high-level Issue-driven collaboration pattern as `liqiangcc/jellyfin-web-media-gateway`, adapted to this project's smaller scope:

```text
GPT Web Coordinator
→ publish Issue + task.md + prompt.md
→ status:ready

Codex Worker
→ claim one Task
→ Attempt N
→ implement / verify
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ stop

GPT Web Coordinator
→ review durable GitHub evidence
→ ACCEPT | REVISE | BLOCK | SPLIT
→ final acceptance / next Attempt
```

Chat is operational context; GitHub is durable project state.

## Current phase

The repository is in **design/bootstrap** phase. The immediate goal is to freeze the collaboration contract, runtime boundaries, secure remote-ingress requirements, MVP use cases and tmux backend contract before implementing the MCP server.