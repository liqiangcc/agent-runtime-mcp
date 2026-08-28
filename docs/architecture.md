# Architecture

## 1. System context

`agent-runtime-mcp` separates durable project coordination from interactive Worker execution, and separates remote MCP ingress from the concrete runtime backend.

```text
                    Human
                      │
                      ▼
                  GPT Web
                 Coordinator
                      │
          ┌───────────┴────────────┐
          │                        │
      GitHub MCP          Remote MCP connection
          │                        │
          ▼                        ▼
     GitHub Issues        Secure ingress / tunnel
   task.md / prompt.md             │
     PR / CI / logs                ▼
                           agent-runtime-mcp
                           Runtime Service
                                  │
                                  ▼
                           RuntimeBackend
                                  │
                                  ▼
                            TmuxBackend
                                  │
                                  ▼
                         tmux sessions/panes
                                  │
                                  ▼
                           Codex processes
```

The first deployment keeps `agent-runtime-mcp`, tmux and Codex Workers on the same trusted runtime host. GPT Web reaches that service remotely through a supported authenticated MCP path.

## 2. Plane separation

### Control / State Plane

Owned by GPT Web + GitHub.

Responsibilities:

- project goal decomposition;
- priority and dependency decisions;
- Task publication;
- Task claim state;
- Attempt history;
- candidate/PR/evidence references;
- review decisions;
- final acceptance and closure.

### MCP Ingress Plane

Connects GPT Web to the Runtime Service.

Responsibilities:

- supported remote MCP transport;
- authentication/authorization;
- endpoint exposure/tunnel policy;
- protocol compatibility;
- request bounds/timeouts;
- transport-level security.

Ingress lifetime is not Worker lifetime.

### Execution Plane

Owned by `agent-runtime-mcp` and its Runtime Backends.

Responsibilities:

- persistent Worker lifecycle;
- runtime discovery;
- terminal/process observation;
- text/control input;
- interruption/restart/destruction;
- backend health and correlation metadata.

The Execution Plane must not silently promote runtime observations into Control Plane facts.

## 3. Architectural invariants

### A1 — GitHub is Task authority

The authoritative Task lifecycle lives in GitHub Issues and Task Packages. `agent-runtime-mcp` may store only correlation metadata.

### A2 — Coordinator owns acceptance

Codex may report `COMPLETED`; runtime may report `idle`; neither means the Task is accepted. Only the Coordinator can accept/close an Issue.

### A3 — Backend independence

The public domain model is Worker/Runtime based. tmux-specific terminology stays behind `RuntimeBackend` except where explicit diagnostic metadata is requested.

### A4 — Structured runtime operations

Public MCP operations express user goals such as observe Worker or send input. They are not a generic tmux command tunnel.

### A5 — Safe degradation

If runtime state cannot be determined, return `unknown`/structured errors. Do not infer project semantics by scraping Codex prose.

### A6 — Persistence without hidden ownership

The MCP request/client may disconnect and the MCP process may restart while tmux Workers continue. Managed Worker identity must be reconcilable after restart, and native tmux remains an operator escape hatch.

### A7 — No implicit destructive action

Observation/input failures never destroy or restart a Worker automatically unless an explicit future policy layer requests it.

### A8 — Authenticated remote ingress

Because GPT Web connects remotely, remote MCP ingress is part of MVP. Do not expose shell-equivalent control through an unauthenticated public endpoint.

### A9 — Remote ingress != remote backend

The MVP may have:

```text
GPT Web remotely reaches MCP server
+
MCP server locally controls tmux on the same host
```

without implementing SSH/multi-host Runtime Backends.

## 4. Internal layering

```text
Remote MCP Transport Adapter
    │
    ▼
MCP Adapter
    │
    ▼
Runtime Application Service
    │
    ├── Worker Registry
    ├── Policy / Validation
    └── RuntimeBackend interface
              │
              ▼
          TmuxBackend
              │
              ▼
      structured process exec
              │
              ▼
             tmux
```

### Remote MCP Transport Adapter

- uses the current supported MCP HTTP transport/official SDK path;
- authenticates protected remote calls;
- validates transport-level request/security constraints;
- does not contain tmux logic or Task scheduling logic.

### MCP Adapter

- validates protocol-facing tool input shape;
- maps domain results/errors into MCP results;
- contains no tmux command construction.

### Runtime Application Service

- owns use-case orchestration;
- resolves `worker_id` to backend locator;
- enforces operation policy and bounds;
- keeps Task semantics out of runtime behavior.

### Worker Registry

Stores only runtime-owned identity/correlation data needed to rediscover managed Workers after server restart.

A minimal record may include:

```text
worker_id
backend_kind
backend_locator
created_at
startup_profile / command metadata
cwd
capabilities
external_reference?   # non-authoritative correlation only
```

The registry must reconcile against actual backend existence rather than assuming records are always live.

### RuntimeBackend

Backend-neutral interface for:

```text
inventory
inspect
capture
send_text
send_control
create
restart
destroy
health
```

Not every backend must implement every optional capability; capability discovery is explicit.

## 5. Worker identity

`worker_id` is the API identity and should not require callers to know tmux session/window/pane syntax.

```text
worker_id = stable runtime identity
backend_locator = backend-specific address
```

For tmux, the locator may include socket/server identity and session/window/pane coordinates or stable tmux identifiers. Exact representation belongs to `backends/tmux.md`.

Renaming a tmux session should not intentionally redefine the logical Worker when the backend can preserve mapping.

## 6. Task correlation

A Worker may expose:

```text
external_reference = github:liqiangcc/agent-runtime-mcp#12
```

This is useful for humans and Coordinators, but it has strict semantics:

```text
external_reference
!= Issue claim
!= Issue status
!= Task acceptance
```

Changing/removing the reference must not mutate GitHub.

## 7. Runtime state

Runtime state describes execution availability, not project completion.

Initial normalized states:

```text
starting
running
idle
exited
unavailable
unknown
```

Backends may provide confidence/evidence fields. `idle` is at most a runtime heuristic and must never be documented as "task complete".

Exact semantics are defined in `runtime-model.md`.

## 8. Failure domains

Keep failures separated so recovery is explicit:

```text
GitHub unavailable
→ Task coordination impaired; existing Worker runtime may remain alive

remote MCP ingress/auth unavailable
→ GPT Web cannot control runtime; local tmux/Workers may remain alive

MCP server unavailable/restarted
→ tmux Worker remains alive; registry reconciles after restart

tmux unavailable
→ backend operations fail; GitHub state unchanged

Codex process exits
→ Worker runtime is exited/unhealthy; Issue state unchanged until Worker/Coordinator reports

Worker hangs
→ Coordinator may observe and explicitly interrupt/restart; no automatic Task acceptance/rejection
```

## 9. Deployment boundary

Initial deployment:

```text
one authenticated remote MCP endpoint/tunnel
→ one runtime host
→ one configured tmux account/server boundary
→ multiple managed Codex Workers
```

See `deployment.md` for transport/auth and compatibility gates.

## 10. Future backend expansion

The architecture must permit:

```text
TmuxBackend       # MVP
PtyBackend        # possible local direct process runtime
SshBackend        # possible remote host runtime
DockerBackend     # possible container runtime
SystemdBackend    # possible service-managed runtime
```

Adding a backend should primarily implement `RuntimeBackend`; it should not require redefining Issue collaboration semantics or public Task concepts.

## 11. Dogfooding boundary

Before the runtime is stable, implementation Tasks may be executed by Codex through existing means. After the MVP reaches secure remote ingress plus create/observe/input/recovery capability, the project should execute at least one later Issue through its own tmux runtime from GPT Web.

Dogfooding proves the remote ingress + Execution Plane. GitHub remains the Control Plane throughout.