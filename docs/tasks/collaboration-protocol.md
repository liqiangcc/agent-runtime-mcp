# Collaboration Roles and Dispatch Protocol

This document defines the complete Issue-driven execution chain for `agent-runtime-mcp`.

## 1. End-to-end model

```text
Human
  ↓
GPT Web Coordinator
  ↓
Task Publisher
  ↓
GitHub Issue + task.md + prompt.md
  ↓ Publication Gate PASS
status:ready
  ↓
Task Dispatcher
  ↓
isolated execution context
  ↓
Codex Task Worker
  ↓ claim / Attempt N / implementation / evidence
status:review | status:blocked
  ↓
Task Reviewer
  ↓
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

GitHub remains the durable Task authority throughout this chain.

## 2. Role boundaries

### GPT Web Coordinator

Owns project-level decisions:

- goals and priority;
- Task decomposition;
- when to publish;
- which eligible execution route to use;
- recovery decisions;
- final acceptance authority.

The Coordinator may invoke the specialized repository roles below, but those roles do not replace Coordinator authority.

### Task Publisher

Owns Task materialization and Publication Gate only.

```text
Goal
→ Issue status:draft
→ task.md
→ prompt.md
→ GitHub read-back
→ status:ready
→ downstream Worker handoff
```

Publisher does not execute the Task, dispatch a child process, review evidence, or accept/close the Issue.

### Task Dispatcher

Owns transport/orchestration from an already-published Worker handoff to a concrete isolated Codex runtime.

Dispatcher may:

- verify live Issue claimability;
- verify child execution environment/capabilities;
- prepare isolated execution context;
- launch/track/resume the child Codex process;
- deliver the Worker handoff unchanged;
- correlate Issue ↔ runtime/worktree;
- report runtime liveness and recovery state.

Dispatcher must not:

- claim the Issue on behalf of Worker;
- modify Task Scope/Claims/Success Criteria;
- implement the Task itself;
- fabricate `[EXECUTION REPORT]`;
- Review/ACCEPT/close;
- automatically start Attempt N+1 after a dead Worker.

### Task Worker

Owns exactly one Task Attempt:

```text
read live Issue + Task Package
→ claim
→ status:in-progress
→ Attempt N
→ implement/verify
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ status:review or status:blocked
→ Active owner: none
→ STOP
```

Worker does not publish, dispatch another Worker, review, accept, close, or select the next Task.

### Task Reviewer

Owns Coordinator-side evidence review, recovery and iteration:

- inspect Issue history, Task Contract, Candidate/PR and required evidence;
- distinguish Worker outcome from Task acceptance;
- recover stale `status:in-progress` ownership when concretely justified;
- choose `ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED`;
- on unchanged-contract REVISE, return the same Issue to `status:ready` and produce a fresh downstream handoff;
- on Contract change, return to draft and require Publisher republication;
- perform Final Acceptance/closure only after all gates pass.

Reviewer does not implement the Worker Task.

## 3. Handoff object

The canonical Worker handoff is intentionally small:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Semantics:

- Publisher produces it only after Publication Gate PASS.
- Dispatcher transports it unchanged to Codex.
- Worker resolves all real execution scope from GitHub + Task Package.
- Runtime may carry the Issue as non-authoritative correlation metadata.

Do not copy the full `task.md` into Dispatcher launch input.

## 4. Dispatch preflight

Before launching a new Worker runtime, Dispatcher must read live GitHub and require:

```text
Issue is open
Status: status:ready
Active owner: none
Task package resolves
required Worker capabilities are known
actual child execution environment is eligible
no existing healthy issue-linked Worker runtime is already executing the Task
```

If the Issue is `in-progress`, `review`, `blocked`, `done`, or closed, do not launch a second Worker. Switch to tracking/recovery reporting.

## 5. Isolation rule

Parallel Workers must never share one mutable repository checkout.

Bootstrap implementation uses:

```text
one Issue
→ one isolated git worktree
→ one issue-linked tmux session
→ one Codex Worker process
```

Default deterministic mapping:

```text
Issue #123
→ sibling worktree: <repo>.worktrees/issue-123
→ tmux session: codex-issue-123
```

Do not launch child Worker execution from the Coordinator/Dispatcher main checkout.

Do not automatically reset/delete/repoint an existing issue worktree. Existing state is a recovery case until reconciled.

## 6. Two Dispatcher execution modes

### Mode A — Bootstrap native dispatcher

Used while this project cannot yet control Workers through its own MCP API.

```text
Task Dispatcher
→ git worktree
→ native tmux
→ Codex CLI
```

Requirements:

- dispatcher checkout clean and synced before creating a new worktree;
- exact base SHA recorded;
- prompt delivered as literal terminal input, not shell interpolation;
- Issue-linked tmux/worktree mapping reported;
- normal OS/user permissions only.

### Mode B — Runtime-backed dispatcher

Target dogfooding mode after the required `agent-runtime-mcp` capabilities are accepted.

```text
Task Dispatcher
→ agent-runtime-mcp
→ RuntimeBackend
→ TmuxBackend
→ Codex Worker
```

Conceptual composition:

```text
create_worker / get_worker
set_external_reference
send_text
capture_output
send_control / restart_worker when explicitly required
```

The Dispatcher still owns orchestration semantics. `agent-runtime-mcp` remains runtime authority only and must not become GitHub Task authority.

Migration rule:

> Replacing native tmux calls with runtime MCP calls must not change Publisher, Worker, Reviewer, Issue lifecycle, or Task acceptance semantics.

## 7. Tracking and recovery

GitHub durable state wins over runtime observations.

```text
status:ready + no issue runtime
→ published, not executing in this Dispatcher context

status:in-progress + live runtime
→ active Attempt

status:in-progress + dead/missing runtime
→ possible stale ownership; Reviewer/Coordinator recovery required

status:review
→ durable Worker report exists; Reviewer is next authority

status:blocked
→ durable blocker; do not auto-resume

status:done / closed
→ Task complete; runtime/worktree is retained diagnostic state only
```

A quiet pane, prompt text, `done` in terminal output, or Codex process exit never proves Task completion.

Dispatcher must not automatically create a replacement Worker for `status:in-progress + dead runtime`. Reviewer/Coordinator must reconcile durable anchors and start Attempt N+1 when appropriate.

## 8. Review → redispatch loop

Unchanged Contract:

```text
Worker Attempt N
→ status:review
→ Reviewer REVISE
→ status:ready
→ fresh Worker handoff
→ Dispatcher
→ Worker claim
→ Attempt N+1
```

Changed Contract:

```text
Reviewer detects Contract change
→ status:draft
→ update canonical docs/task.md/prompt.md as needed
→ Publisher Publication Gate
→ status:ready
→ fresh handoff
→ Dispatcher
```

BLOCK follows the same rule after the concrete unblock condition is satisfied.

## 9. Cleanup

Dispatcher does not automatically destroy the issue runtime/worktree at Worker completion.

Cleanup is allowed only when:

- no active Worker owns the Issue;
- durable GitHub state has been reconciled;
- no uncommitted/unpushed work would be lost;
- Coordinator/operator explicitly requests cleanup or repository policy explicitly permits it.

## 10. Core invariant

```text
Publisher = make Task executable
Dispatcher = deliver Task to an isolated Worker runtime
Worker = execute one Attempt
Reviewer = decide what the result means
GitHub = durable Task authority
agent-runtime-mcp = runtime authority
```

No role may silently absorb another role's authority merely because it has the technical capability to do so.