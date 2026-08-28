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
11. `docs/tasks/README.md`
12. `docs/tasks/collaboration-protocol.md`
13. the current GitHub Issue and relevant comments
14. the current Task Package under `docs/tasks/<issue>-<slug>/`
15. `docs/tasks/issue-state-convention.md`
16. `docs/tasks/issue-lifecycle-protocol.md`

Do not infer current Task state from old chat history or terminal output when GitHub can be read directly.

Authority order:

```text
canonical docs
→ AGENTS.md
→ task.md
→ prompt.md
```

The required live Task-state snapshot is the Issue body state block defined by `docs/tasks/issue-state-convention.md`. Labels/assignee may mirror it for convenience. Issue comments are append-only Attempt / Blocker / Review / Acceptance history.

## 2. Collaboration roles

```text
GPT Web Coordinator
= long-lived project control plane
= goal decomposition / priority / role invocation / final authority

Task Publisher
= materialize Issue + task.md + prompt.md
= run Publication Gate
= produce canonical Worker handoff

Task Dispatcher
= deliver one published handoff to one isolated Codex runtime
= worktree/runtime orchestration + tracking/recovery evidence only

Task Worker
= claim and execute exactly one Task Attempt
= implementation / tests / evidence / report

Task Reviewer
= Coordinator-side review / recovery / iteration / final acceptance

agent-runtime-mcp
= execution-plane runtime authority
= worker discovery / observation / input / interrupt / lifecycle operations

Runtime Backend
= concrete terminal/process transport
= tmux first; other backends may follow
```

Role chain:

```text
GPT Web Coordinator
→ Task Publisher
→ status:ready + canonical handoff
→ Task Dispatcher
→ isolated Codex runtime
→ Task Worker claim / Attempt N
→ status:review | status:blocked
→ Task Reviewer
→ ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

No role gains another role's authority merely because it has technical write access.

## 3. Role separation invariants

- Publisher never claims, executes, dispatches, Reviews, accepts, or closes.
- Dispatcher never claims on behalf of Worker, changes Task Contract, implements, fabricates reports, Reviews, accepts, closes, or automatically starts Attempt N+1.
- Worker executes exactly one claimed Attempt, reports durably, releases ownership, and stops.
- Reviewer does not implement the Task. It decides what durable Worker/evidence results mean.
- Reviewer returning a Task to `status:ready` produces a fresh handoff; Dispatcher performs the runtime delivery.
- Contract changes return to Publisher/Publication Gate rather than being encoded only in comments.
- Only Coordinator/Reviewer final acceptance may set `status:done` and close an accepted Task.

See `docs/tasks/collaboration-protocol.md`.

## 4. Core architecture invariants

- GitHub is the durable Task authority.
- GPT Web is the coordination authority.
- `agent-runtime-mcp` is the runtime authority, not the Task authority.
- tmux is an implementation backend, not the public product model.
- Codex is a Worker, not an autonomous project scheduler.
- Runtime state must never be interpreted as Task acceptance.
- `idle`, prompt visibility, process exit, output text or lack of output do not prove `status:done`.
- A Runtime may carry an external Issue reference, but it is correlation metadata only.
- Worker execution outcome, verification result, runtime liveness and Reviewer decision are distinct.
- Task Scope, Claims, Success Criteria and architecture/security invariants cannot be silently changed during execution.
- Secure remote MCP ingress is part of MVP because GPT Web must reach the service.
- Remote MCP ingress is not the same as a remote SSH Runtime Backend.

## 5. Use-case-first design rule

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

## 6. Runtime boundary

The runtime may know:

- worker identity;
- backend locator;
- cwd / process identity where observable;
- terminal output;
- runtime lifecycle state;
- last activity;
- declared runtime capabilities;
- optional external Issue reference for correlation.

The runtime must not own authoritative values for:

- Issue status;
- Task acceptance;
- verification PASS/FAIL authority;
- Reviewer decision;
- project priority;
- next Task selection;
- Attempt creation.

## 7. Backend boundary

Public runtime behavior flows through a backend abstraction:

```text
MCP Tool
→ Runtime Service
→ RuntimeBackend
→ TmuxBackend
→ tmux
```

Do not spread direct tmux shell invocations across business logic. Backend-specific behavior belongs under `docs/backends/` and the corresponding implementation module.

## 8. Remote ingress boundary

```text
GPT Web
→ authenticated remote MCP ingress
→ agent-runtime-mcp
→ local RuntimeBackend
```

For private/local runtime hosts, prefer an officially supported secure tunnel/private-connectivity mechanism when available. Otherwise require reviewed HTTPS + authentication.

Do not expose an unauthenticated shell-equivalent MCP endpoint to the public internet. Current ChatGPT/MCP compatibility and write-action support must be verified at integration time.

## 9. Security baseline

Terminal control is effectively shell-level authority over the Worker account. Therefore:

- authenticate remote MCP ingress;
- local-only development endpoints bind to loopback unless explicitly protected;
- use structured executable/argv, not shell-concatenated strings;
- treat captured terminal output as potentially secret-bearing;
- bound capture size and avoid unnecessary persistence;
- separate ordinary text input from special control input;
- destructive runtime actions are explicit;
- never bypass OS/GitHub/repository security boundaries to make a Task pass.

See `docs/security.md`.

## 10. Issue-driven Task model

Independent Worker work uses:

```text
GitHub Issue
+
docs/tasks/<issue>-<slug>/
├── task.md
└── prompt.md
```

```text
Issue body state block
= live status / active owner / environment / blocker / candidate pointers

Issue comments
= append-only Attempt / Blocker / Review / Acceptance history

task.md
= stable execution contract

prompt.md
= Worker bootstrap/navigation only

canonical Worker handoff
= minimal Issue + prompt entry produced by Publisher/Reviewer
```

## 11. Publication and dispatch

Publisher publishes only after read-back Publication Gate PASS:

```text
status:draft
→ materialize/read-back
→ status:ready
→ Active owner: none
→ canonical handoff
```

Dispatcher then verifies live `status:ready + no owner + environment/capability match` before launching a child Worker.

During bootstrap the Dispatcher may use:

```text
one Issue
→ one isolated git worktree
→ one issue-linked tmux session
→ one Codex Worker
```

After the required runtime capabilities are accepted, Dispatcher should migrate to:

```text
Task Dispatcher
→ agent-runtime-mcp
→ RuntimeBackend
→ Codex
```

This transport migration must not change Issue/Attempt semantics.

## 12. Worker lifecycle

Standard flow:

```text
Status: status:ready
Active owner: none
→ Worker claim
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

Worker must not dispatch another Worker, start another Issue/Attempt, set `status:done`, or close the Issue.

## 13. Reviewer lifecycle and redispatch

Reviewer reads Issue history, Task Contract, Candidate/PR and required Evidence, then chooses:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE:

```text
Reviewer
→ status:ready
→ Active owner: none
→ fresh canonical handoff
→ Dispatcher
→ Worker claim
→ Attempt N+1
```

Contract change:

```text
Reviewer
→ status:draft
→ canonical/task/bootstrap update
→ Publisher Publication Gate
→ status:ready
→ Dispatcher
```

Interrupted `status:in-progress + dead/missing runtime` is a recovery condition. Dispatcher reports liveness; Reviewer/Coordinator reconciles durable commits/PR/evidence and decides whether to release stale ownership and create Attempt N+1. Dispatcher must not auto-replace the Worker.

Final closure order:

```text
[FINAL ACCEPTANCE]
→ Status: status:done
→ Active owner: none
→ close Issue
```

## 14. Git isolation and evidence

- One concurrent Issue execution must have one isolated mutable worktree/runtime context.
- Never run parallel child Workers from the Coordinator/Dispatcher main checkout.
- Keep each implementation unit focused.
- Prefer recoverable branches/PRs for non-trivial mutations.
- Record exact Candidate SHA when evidence depends on code identity.
- Do not report tests as passed when not run.
- Do not commit secrets, tokens, credentials or captured private terminal output.
- Reuse valid existing candidate/PR across Attempts instead of rebuilding the Task from scratch.

## 15. Stop conditions

A Worker stops when the Attempt is complete/blocked or cannot execute the frozen Contract safely.

A Dispatcher stops launching when the Issue is not ready/unowned, routing mismatches, or an issue-linked runtime/worktree requires recovery.

A Publisher keeps a Task draft when Publication Gate cannot pass.

A Reviewer returns control to Publisher for Contract change, Dispatcher for a new unchanged-contract Attempt, or closes only after Final Acceptance.

Chat output is convenience. Durable GitHub state is the handoff.