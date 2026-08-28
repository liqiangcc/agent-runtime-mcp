# agent-runtime-mcp

MCP-based persistent runtime for coordinating terminal-based AI workers, with tmux as the first execution backend.

## Project intent

`agent-runtime-mcp` provides the **execution plane** used by a long-lived GPT Web Coordinator to remotely observe and control persistent Codex Workers without making terminal state the source of truth for project work.

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

- **GPT Web** is the project Coordinator and final coordination authority.
- **GitHub Issue** is live Task state and append-only coordination history.
- **`task.md`** is the stable Task execution contract.
- **Task Publisher** makes one Task executable through Publication Gate.
- **Task Dispatcher** delivers an already-published handoff to one isolated Codex runtime; it does not claim the Issue.
- **Task Worker** claims and executes exactly one Attempt, reports, releases ownership and stops.
- **Task Reviewer** reviews durable evidence, handles recovery/iteration and decides acceptance.
- **Remote MCP ingress** is how GPT Web reaches the Runtime service.
- **`agent-runtime-mcp`** owns runtime observation/control, not project Task state.
- **tmux** is the first Runtime Backend, not the public architecture boundary.

Central invariant:

> **Runtime state is not Task state.**

An idle pane does not mean an Issue is complete. A Worker can report execution results; Reviewer/Coordinator decides whether the Task is accepted.

Another important separation:

```text
remote MCP ingress
!= remote Runtime Backend
```

The MVP requires secure GPT Web → MCP access, while SSH/multi-host Runtime Backends can remain future work.

## Design approach

```text
Coordinator / Operator Goal
→ Use Case
→ Required Capability
→ Runtime Model
→ Backend Contract
→ MCP Tool Contract
```

The project intentionally does **not** expose tmux commands one-for-one as MCP tools.

## Documentation

- [`docs/README.md`](docs/README.md) — documentation authority and reading order
- [`docs/requirements.md`](docs/requirements.md) — product goals, use cases and non-goals
- [`docs/architecture.md`](docs/architecture.md) — control-plane / ingress / execution-plane architecture
- [`docs/runtime-model.md`](docs/runtime-model.md) — Worker and Runtime domain model
- [`docs/mcp-contract.md`](docs/mcp-contract.md) — MCP capability/tool contract
- [`docs/technology-stack.md`](docs/technology-stack.md) — frozen implementation stack
- [`docs/deployment.md`](docs/deployment.md) — remote MCP ingress/deployment topology
- [`docs/backends/tmux.md`](docs/backends/tmux.md) — tmux backend design
- [`docs/security.md`](docs/security.md) — security boundaries
- [`docs/mvp-plan.md`](docs/mvp-plan.md) — implementation/dogfooding sequence
- [`docs/tasks/README.md`](docs/tasks/README.md) — Issue-driven Task model
- [`docs/tasks/collaboration-protocol.md`](docs/tasks/collaboration-protocol.md) — Publisher → Dispatcher → Worker → Reviewer
- [`docs/tasks/issue-lifecycle-protocol.md`](docs/tasks/issue-lifecycle-protocol.md) — publication/dispatch/attempt/recovery/review/closure

## Collaboration model

The repository uses the collaboration structure proven in `liqiangcc/jellyfin-web-media-gateway`, adapted to this project's execution-runtime goal:

```text
GPT Web Coordinator
        ↓
Task Publisher
        ↓
Issue + task.md + prompt.md
        ↓ Publication Gate
status:ready
        ↓
Task Dispatcher
        ↓ isolated Worker runtime
Task Worker
        ↓ claim
status:in-progress / Attempt N
        ↓ implementation + evidence
status:review | status:blocked
        ↓
Task Reviewer
        ↓
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Important boundaries:

```text
Publisher ≠ Worker
Dispatcher ≠ Worker
Dispatcher launch ≠ Issue claim
Worker result ≠ Review acceptance
runtime state ≠ Task state
```

### Bootstrap development

Until this project can manage its own Worker lifecycle/input, Dispatcher uses:

```text
isolated git worktree
→ issue-linked native tmux session
→ Codex CLI
```

### Runtime-backed dogfooding

After the required Runtime tools are accepted:

```text
Task Dispatcher
→ agent-runtime-mcp
→ RuntimeBackend
→ Codex Worker
```

Only the execution transport changes. GitHub Issue/Attempt/Review semantics remain unchanged.

Chat and terminal output are operational views; GitHub is durable project state.

## Current phase

Phase 0 collaboration/architecture bootstrap is complete enough to publish MVP implementation Tasks. The first implementation slice, MVP-001, is intended to execute through the bootstrap Dispatcher so the full collaboration chain is exercised before runtime-backed dogfooding becomes possible.