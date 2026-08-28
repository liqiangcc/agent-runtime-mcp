# Task — MVP-001 Runtime core and tmux worker discovery

## Metadata

```text
GitHub Issue: #2
MVP phase: Phase 1
Task kind: combined implementation + verification
Design base commit: 2da33033052975b1f49e4e9b30737e9097c4a105
Session bootstrap: docs/tasks/2-runtime-core-tmux-discovery/prompt.md
Expected worker: codex
Environment: env:codex
Required capabilities: github-read-write, repository-code-authoring, node-typescript, automated-test
Hard publication dependencies: Phase 0 canonical docs committed
```

Live status, owner, Candidate, PR and blocker are stored in Issue #2 according to `docs/tasks/issue-state-convention.md`.

## Goal

Implement the first executable `agent-runtime-mcp` slice: a TypeScript/Node MCP server core with backend-neutral Worker/registry semantics and **read-only managed tmux Worker discovery**, exposing `list_workers` and `get_worker` without terminal input, Worker creation or GitHub Task-state inference.

## Why now

Phase 0 has frozen the core boundaries. This Task establishes the smallest code path that proves:

```text
MCP tool
→ Runtime Service
→ RuntimeBackend
→ TmuxBackend
→ structured tmux query
```

while preserving:

```text
GitHub Task state
!= runtime state
```

It is intentionally read-only so later output/input/lifecycle capabilities can build on a reviewed Worker identity and backend contract.

## Canonical documents

Worker must read and preserve:

- `docs/requirements.md`
- `docs/architecture.md`
- `docs/runtime-model.md`
- `docs/mcp-contract.md`
- `docs/technology-stack.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/mvp-plan.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`

## Technology decision

Use the current official MCP TypeScript SDK **v2 stable line** through `@modelcontextprotocol/server`, as frozen by `docs/technology-stack.md`.

Use Node structured child-process APIs for tmux execution. Do not implement backend commands through shell-concatenated strings.

Phase 1 may expose a local development/test transport supported by the official SDK. Authenticated remote ChatGPT ingress belongs to MVP-005 and is out of scope here.

## In Scope

1. Initialize a TypeScript/Node project with lockfile-backed dependency management.
2. Add the official MCP server SDK v2.
3. Define backend-neutral Worker/runtime/error types required by this slice.
4. Define a `RuntimeBackend` abstraction sufficient for discovery/inspection.
5. Define a managed Worker registry abstraction plus a small durable local implementation suitable for MVP evolution.
6. Implement a `TmuxBackend` availability/query path using structured argv and structured tmux format fields.
7. Reconcile registry records with actual tmux panes conservatively.
8. Distinguish managed registry-backed Workers from unmanaged tmux entities.
9. Implement Runtime Service operations for `list_workers` and `get_worker`.
10. Register MCP tools `list_workers` and `get_worker` with structured schemas/results.
11. Implement structured error classification for relevant discovery failures.
12. Add automated tests and CI sufficient to verify this Task.
13. Document local development/test usage needed to exercise the slice.

## Out of Scope

- `capture_output`;
- `send_text`;
- `send_control`;
- arbitrary `send-keys`;
- `create_worker`;
- `restart_worker`;
- `destroy_worker`;
- `set_external_reference` mutation API;
- Codex semantic idle/done parsing;
- GitHub API access from the runtime server;
- automatic Issue claim/assignment;
- raw `tmux_command` or `run_shell_command` MCP tools;
- authenticated remote MCP ingress / Secure MCP Tunnel;
- SSH/Docker/PTY backends;
- multi-host scheduling.

## Architecture invariants

1. `worker_id` is the public stable identity; callers do not construct tmux target syntax.
2. tmux details stay behind `RuntimeBackend` / `TmuxBackend`.
3. Registry identity and backend runtime reality are distinct.
4. A registry record with a missing tmux locator is not reported as healthy/alive.
5. A tmux pane without a managed registry record is not silently adopted as a Worker.
6. Runtime status does not contain authoritative Issue/task/review/verification fields.
7. Do not infer Task state or success from pane contents, shell prompt shape, inactivity or process exit.
8. No public raw shell/tmux command escape hatch.
9. Backend process execution uses structured executable + argv with shell disabled.
10. Normal operation does not require root.

## Implementation requirements

### R1 — Project skeleton

Create a maintainable source layout separating at least:

```text
MCP transport/tool registration
Runtime Service/domain
Registry
RuntimeBackend contract
TmuxBackend
```

Exact filenames are implementation details.

### R2 — Worker model

The implemented model must represent the Phase-1 subset of canonical Worker semantics, including at least:

```text
worker_id
backend_kind
backend locator internally/diagnostically
runtime_state
cwd? where observable
capabilities[]
state source/evidence where useful
```

Do not add authoritative Task fields.

### R3 — Registry

Provide a registry interface and a minimal durable local implementation.

Phase 1 does not need a public mutation tool. Tests/integration setup may seed registry data directly through the repository abstraction/fixture.

Registry handling must distinguish:

```text
valid managed record
stale/missing backend runtime
invalid/conflicting record
```

Do not automatically import arbitrary existing tmux sessions.

### R4 — tmux query

Use tmux machine-oriented format fields rather than parsing human `tmux ls` prose.

Use structured process invocation such as:

```text
executable: tmux
args: [...]
shell: false
finite timeout
```

The exact format string may evolve, but must identify the concrete pane locator needed for reconciliation.

### R5 — Conservative runtime state

Phase 1 does not need to solve semantic `idle` detection.

Prefer states that can be supported mechanically, for example `running`, `exited`, `unavailable` or `unknown`. Never parse terminal prose for completion.

### R6 — MCP tools

Expose only this Task's read operations:

```text
list_workers
get_worker
```

Tool results must be bounded structured data and must not include terminal capture output.

`get_worker` for an unknown `worker_id` must return/raise a stable structured `WORKER_NOT_FOUND` classification through the chosen MCP error/result strategy.

### R7 — Error model

At minimum cover relevant categories:

```text
WORKER_NOT_FOUND
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
INVALID_ARGUMENT
TIMEOUT
REGISTRY_CONFLICT
```

Do not leak environment variables or arbitrary child-process output into normal errors.

### R8 — Development entry

Provide a documented local entry/test route using an official SDK-supported transport appropriate for development. It does not need to satisfy ChatGPT remote ingress in this phase.

## Verification claims

### C1 — Architecture boundary

The implementation preserves backend-neutral Worker identity, does not expose a raw tmux/shell MCP API, and contains no authoritative GitHub Task-state model.

### C2 — Managed discovery

A seeded managed registry record whose tmux pane exists is returned by `list_workers`/`get_worker` with a mechanically supported runtime state.

### C3 — Managed/unmanaged separation

An unrelated tmux session/pane without a managed registry record is not returned as a normal managed Worker.

### C4 — Stale reconciliation

A registry record whose tmux pane is missing is classified conservatively and never reported as a healthy live Worker.

### C5 — Backend unavailable

When tmux is unavailable/unreachable, the API produces the defined structured backend error/state behavior without crashing the server or inventing Worker liveness.

### C6 — Safe process execution

Automated tests/static review demonstrate that tmux commands use structured executable/argv invocation with no untrusted shell interpolation.

### C7 — MCP contract

The official MCP server registers functional `list_workers` and `get_worker` tools whose schemas/results match this Task and the canonical contract.

## Verification plan

### J1 — typecheck / unit

Required. Run the repository's pinned typecheck and unit-test commands.

Must cover registry reconciliation, errors, managed/unmanaged behavior, MCP service/tool behavior and process-runner behavior through fakes/mocks where appropriate.

### J2 — real tmux integration

Required on a Linux environment where tmux can be installed/run.

Create an isolated test tmux session/socket namespace where practical, seed the matching temporary registry, and prove C2–C5 without touching unrelated operator sessions.

Integration cleanup is mandatory even on test failure.

### J3 — CI

Required. Add GitHub Actions on a GitHub-hosted Linux runner for the portable checks and real tmux integration. The workflow may install tmux explicitly if the runner image does not provide the required version.

CI is verification execution infrastructure; it does not claim the Issue.

## Security review

Task must verify:

- no `shell: true` for tmux/backend execution;
- no arbitrary shell/tmux MCP tool;
- no terminal-output capture in this slice;
- no environment-variable dump in errors;
- tests use isolated tmux names/socket and cleanup;
- registry file behavior does not grant automatic control over unmanaged sessions;
- server can run as an ordinary user.

## Success criteria

Task is eligible for Coordinator ACCEPT only when all are true:

1. TypeScript/Node project and official MCP SDK v2 server skeleton are committed.
2. Runtime domain/backend/registry boundaries are represented in code rather than tmux calls being spread through tool handlers.
3. `list_workers` and `get_worker` work through Runtime Service + TmuxBackend.
4. Managed vs unmanaged tmux behavior is proven.
5. Stale registry and tmux-unavailable behavior are tested and conservative.
6. Structured errors satisfy the published contract for this slice.
7. No Task-state inference exists.
8. No raw shell/tmux control tool exists.
9. Required unit/typecheck/integration CI passes on the exact Candidate SHA.
10. README/developer documentation explains how to run the Phase-1 slice locally.
11. `[EXECUTION REPORT]` records exact Candidate SHA, commands, CI run/evidence and limitations.

Success Criteria must not be weakened after execution merely to accept the result.

## Evidence contract

Execution Report must include:

```text
Attempt
Base commit
Candidate commit
PR if any
Node version
TypeScript version
@modelcontextprotocol/server version
package manager + lockfile
unit/typecheck commands and results
real tmux integration command/result
tmux version used in integration
GitHub Actions run/job reference
Claims C1-C7 result
known limitations
```

Do not include secret-bearing terminal content or environment dumps.

## Failure / blocked handling

### FAIL

Examples:

- tests fail on the Candidate;
- unmanaged tmux panes are treated as managed Workers;
- stale records are reported live;
- tool handler directly exposes raw tmux syntax;
- implementation requires shell interpolation;
- required CI/integration fails due implementation behavior.

### BLOCKED

Examples:

- required GitHub write/CI capability is unavailable;
- official MCP SDK cannot be installed/resolved in the execution environment for external reasons;
- required Linux/tmux integration cannot be executed and no accepted equivalent Evidence authority is available.

Do not bypass architecture/security constraints to avoid BLOCKED.

## Deliverables

- TypeScript/Node project skeleton and lockfile.
- Runtime/domain/registry/backend implementation.
- `TmuxBackend` read-only discovery.
- MCP `list_workers` / `get_worker` tools.
- automated unit + real tmux integration tests.
- GitHub Actions verification.
- developer documentation.
- Candidate commit/PR and Issue Execution Report.

## Completion protocol

Follow `docs/tasks/issue-lifecycle-protocol.md` exactly:

```text
claim one Attempt
→ implement/verify
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ status:review or status:blocked
→ Active owner: none
→ STOP
```

Worker must not set `status:done`, close Issue #2, or start MVP-002.