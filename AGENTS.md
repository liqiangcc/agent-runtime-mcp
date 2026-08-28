# Agent Working Rules

This file defines repository-wide collaboration and execution rules.

## 1. Authority and reading order

Before starting any independent Task, read:

1. `README.md`
2. `docs/README.md`
3. `docs/requirements.md`
4. `docs/architecture.md`
5. `docs/runtime-model.md`
6. `docs/mcp-contract.md`
7. `docs/technology-stack.md`
8. `docs/deployment.md`
9. `docs/security.md`
10. `docs/mvp-plan.md`
11. the current GitHub Issue and relevant comments
12. the current Task Package under `docs/tasks/<issue>-<slug>/`
13. `docs/tasks/issue-state-convention.md`
14. `docs/tasks/issue-lifecycle-protocol.md`

Do not infer current Task state from old chat history or terminal output when GitHub can be read directly.

Authority order:

```text
canonical docs
→ AGENTS.md
→ task.md
→ prompt.md
```

The required live Task-state snapshot is the machine-readable state block in the GitHub Issue body as defined by `docs/tasks/issue-state-convention.md`. Labels/assignee may mirror it for convenience. Issue comments are the append-only Attempt / Review / Acceptance history.

## 2. Roles

```text
GPT Web Coordinator
= long-lived project control plane
= goal decomposition / priority / Task publication / routing / review / acceptance / recovery

Codex Worker
= short-lived single-Task executor
= repository work / implementation / tests / evidence / fixes

agent-runtime-mcp
= execution-plane runtime control
= worker discovery / observation / input / interrupt / lifecycle operations

Remote MCP Ingress
= authenticated path from GPT Web to the Runtime service
= transport/auth boundary, not Task authority

Runtime Backend
= concrete terminal/process transport
= tmux first; other backends may follow
```

A Worker does not become Coordinator because it can modify GitHub.

## 3. Core invariants

- GitHub is the durable Task authority.
- GPT Web is the coordination authority.
- `agent-runtime-mcp` is the runtime authority, not the Task authority.
- tmux is an implementation backend, not the public product model.
- Codex is a Worker, not an autonomous project scheduler.
- Runtime state must never be interpreted as Task acceptance.
- `idle`, prompt visibility, process exit, output text or lack of output do not prove `status:done`.
- A Runtime may carry a `task_reference`, but that reference is correlation metadata only.
- Worker execution outcome, verification result and Coordinator decision are distinct.
- Worker must not silently change Scope, architecture invariants or Success Criteria.
- Worker must not automatically start another Issue or another Attempt after reporting.
- Only Coordinator can perform final acceptance and close a Task Issue.
- Secure remote MCP ingress is part of MVP because GPT Web must reach the service.
- Remote MCP ingress is not the same as a remote SSH Runtime Backend.

## 4. Use-case-first design rule

Do not design the MCP API by wrapping tmux commands one-for-one.

Required reasoning sequence:

```text
User / Coordinator Goal
→ Use Case
→ Success / Failure / Degradation
→ Required Capability
→ Runtime Domain Model
→ Backend Contract
→ MCP Tool Contract
```

A backend-specific primitive may exist internally without becoming a public MCP tool.

## 5. Runtime boundary

The runtime may know:

- worker identity;
- backend locator;
- cwd / process identity where observable;
- terminal output;
- runtime lifecycle state;
- last activity;
- declared runtime capabilities;
- optional external `task_reference` for correlation.

The runtime must not own authoritative values for:

- Issue status;
- Task acceptance;
- verification PASS/FAIL authority;
- Coordinator review decision;
- project priority;
- next Task selection.

## 6. Backend boundary

Public runtime behavior must flow through a backend abstraction.

```text
MCP Tool
→ Runtime Service
→ RuntimeBackend
→ TmuxBackend
→ tmux CLI / protocol
```

Do not spread direct tmux shell invocations across business logic.

Backend-specific behavior belongs under `docs/backends/` and the corresponding implementation module.

## 7. Remote ingress boundary

GPT Web connects to a remote MCP service, so ingress/transport is an explicit architecture concern.

```text
GPT Web
→ authenticated remote MCP ingress
→ agent-runtime-mcp
→ local TmuxBackend
```

For private/local runtime hosts, prefer an officially supported secure tunnel/private-connectivity mechanism when available. Otherwise require an explicitly reviewed HTTPS + authentication design.

Do not expose an unauthenticated shell-equivalent MCP endpoint to the public internet.

Current ChatGPT/MCP product compatibility and write-action support must be verified at integration time; do not hard-code stale product assumptions into the Task Contract.

See `docs/deployment.md`.

## 8. Security baseline

Terminal control is effectively shell-level authority over the Worker account. Therefore:

- use authenticated remote MCP ingress for GPT Web;
- local-only development endpoints bind to loopback unless protected by an explicit ingress layer;
- do not expose an unauthenticated network control endpoint;
- execute backend commands with structured argv, not shell-concatenated strings;
- treat terminal output as potentially secret-bearing;
- bound capture size and avoid unnecessary persistence of captured output;
- separate ordinary text input from special-key/control input;
- destructive runtime lifecycle actions must be explicit;
- never bypass OS permissions, GitHub permissions or repository security boundaries to make a Task pass.

See `docs/security.md` for the full baseline.

## 9. Issue-driven Task model

Independent Worker work uses:

```text
GitHub Issue
+
docs/tasks/<issue>-<slug>/
├── task.md
└── prompt.md
```

Responsibilities:

```text
Issue body state block
= live status / active owner / environment / blocker / candidate pointers

Issue comments
= append-only Attempt / Blocker / Review / Acceptance history

task.md
= stable Task execution contract

prompt.md
= session bootstrap / navigation only
```

Labels/assignee may mirror the live snapshot, but Worker correctness must not depend on custom labels existing. Issue comments cannot silently redefine canonical architecture or the frozen Task Contract.

## 10. Worker lifecycle

Standard flow:

```text
Status: status:ready
Active owner: none
→ claim
→ Status: status:in-progress
→ Active owner: <worker>
→ Attempt N
→ execute current task.md only
→ [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ STOP
```

Blocked flow:

```text
Attempt N
→ [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ STOP
```

The Worker must not set `status:done` or close the Issue.

## 11. Coordinator lifecycle

Coordinator reads the Issue, current Task Contract, candidate changes and required evidence, then records:

```text
[COORDINATOR REVIEW]
Decision: ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

- `REVISE` with unchanged contract returns the same Issue to `status:ready` for Attempt N+1.
- `BLOCK` moves to `status:blocked` until the concrete blocker is resolved.
- `SPLIT` creates a child Task only when the child has independent Scope / lifecycle / Success Criteria / evidence authority.
- `ACCEPT` permits final acceptance only when all required Task criteria and evidence are satisfied.

Final closure order:

```text
[FINAL ACCEPTANCE]
→ Status: status:done
→ Active owner: none
→ close Issue
```

## 12. Git and evidence

- Keep each implementation unit focused.
- Prefer recoverable branches/PRs for non-trivial repository mutations.
- Record exact candidate SHA when evidence depends on code identity.
- Do not report tests as passed when they were not run.
- Do not commit secrets, tokens, credentials, captured private terminal output or unnecessary large artifacts.
- When an existing candidate/PR is recoverable, continue it across Attempts instead of rebuilding the same Task from scratch.
- For current external integrations such as ChatGPT remote MCP compatibility, record the actual observed environment/capability rather than relying on stale assumptions.

## 13. Stop conditions

Stop and return control to the Coordinator when:

- the current Attempt is complete;
- the Task is blocked;
- the published Task Contract is no longer executable as written;
- required capability is unavailable;
- execution would violate an architecture or security invariant;
- another Worker owns the Task;
- the Issue is no longer `status:ready` at claim time.

Chat output is a convenience. Durable GitHub state is the handoff.