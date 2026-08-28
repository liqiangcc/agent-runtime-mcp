# Issue-driven Task Model

Independent Worker execution is packaged as:

```text
GitHub Issue
+
docs/tasks/<issue>-<slug>/
├── task.md
└── prompt.md
```

The complete collaboration chain is:

```text
GPT Web Coordinator
→ Task Publisher
→ Publication Gate
→ Task Dispatcher
→ Codex Task Worker
→ Task Reviewer
```

See `collaboration-protocol.md` for role boundaries and dispatch/recovery semantics.

## 1. Durable Task objects

### GitHub Issue

Live coordination snapshot and append-only history.

The required current snapshot is the body block defined by `issue-state-convention.md`:

```text
Status
Active owner
Environment
Task package
Parent
Candidate
PR
Blocker
```

Labels/assignee may mirror this state for UI/search convenience, but are not required for correctness.

Issue comments keep:

```text
Attempt history
Execution Reports
Blocker Reports
Coordinator Reviews
Recovery/Unblock records
Final Acceptance
```

### `task.md`

Stable execution contract:

```text
Goal
Scope / Out of Scope
Architecture Invariants
Implementation Requirements
Claims / Verification Plan
Success Criteria
Evidence Contract
Failure / Blocked rules
```

Dynamic Attempt results do not belong in `task.md`.

### `prompt.md`

Minimal bootstrap/navigation entry for a fresh Worker session. It points to the Issue/Task Contract and must not duplicate or redefine the Contract.

### Canonical Worker handoff

For Codex:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Publisher/Reviewer produces it. Dispatcher transports it unchanged. Worker resolves all real scope from GitHub.

## 2. Specialized repository roles

### `$task-publisher`

```text
Goal
→ status:draft
→ Issue + task.md + prompt.md
→ read-back Publication Gate
→ status:ready
→ canonical handoff
```

Does not execute or Review.

### `$task-dispatcher`

```text
canonical handoff
→ verify ready/no owner/capability route
→ isolated worktree/runtime
→ child Codex
```

Does not claim on behalf of Worker and does not change Task meaning.

Bootstrap mode uses native worktree + tmux. Later dogfooding mode should use `agent-runtime-mcp` as the Runtime transport while preserving exactly the same Issue semantics.

### `$task-worker`

```text
live read
→ claim
→ Attempt N
→ implement/verify
→ durable report
→ release ownership
→ STOP
```

### `$task-reviewer`

```text
Issue + Contract + Candidate + Evidence
→ ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

On unchanged-contract REVISE, Reviewer returns the Issue to ready and emits a fresh canonical handoff for Dispatcher. On Contract change, Reviewer returns to Publisher/Publication Gate.

## 3. Lifecycle

```text
status:draft
→ Publisher Publication Gate
→ status:ready
→ Dispatcher runtime delivery
→ Worker claim
→ status:in-progress
→ Attempt N
→ execution report / blocker report
→ status:review / status:blocked
→ Reviewer
```

Dispatcher runtime delivery does **not** itself change Issue status from ready to in-progress. Only Worker claim does.

## 4. Publication Gate

A Task may become ready only after:

1. Goal is concrete.
2. Issue state block is valid and currently `status:draft`.
3. `task.md` exists and is executable.
4. `prompt.md` exists and points to the exact Task Package.
5. Architecture/security impact has been checked.
6. Dependencies and required capabilities are explicit.
7. Success Criteria are frozen before execution.
8. GitHub read-back confirms committed paths/state.
9. `Active owner: none`.
10. Publisher changes live state to `status:ready` and performs final read-back.
11. Publisher emits the canonical Worker handoff.

A successful file/Issue write alone is not publication.

## 5. Dispatch Gate

Before launching a new child Worker, Dispatcher must independently re-read live state and require:

```text
Issue open
Status: status:ready
Active owner: none
Task Package resolves
required child capabilities/environment match
no already-running issue-linked runtime for this Task
```

If state is in-progress/review/blocked/done, Dispatcher tracks/reports instead of launching a duplicate Worker.

Parallel executions require isolated mutable checkouts. Bootstrap default:

```text
Issue #N
→ <repo>.worktrees/issue-N
→ tmux codex-issue-N
→ Codex Worker
```

## 6. Attempt rule

Each successful Worker transition:

```text
status:ready → status:in-progress
```

starts a new monotonically increasing Attempt number.

A failed/revised Attempt does not normally create a new Issue when Goal/Scope/Success Criteria remain the same.

A dead Dispatcher child does not automatically create Attempt N+1. `status:in-progress + dead runtime` requires Reviewer/Coordinator recovery first.

## 7. Review and redispatch

Unchanged Contract:

```text
Attempt N → status:review
→ Reviewer REVISE
→ status:ready + no owner
→ fresh canonical handoff
→ Dispatcher
→ Worker claim
→ Attempt N+1
```

Contract/bootstrap change:

```text
Reviewer
→ status:draft
→ update canonical/task/bootstrap sources
→ Publisher Publication Gate
→ status:ready
→ Dispatcher
```

BLOCK follows the same principle after concrete unblock conditions are satisfied.

## 8. Runtime integration

The Runtime service is Execution Plane infrastructure, not Task authority.

Bootstrap:

```text
Dispatcher → native tmux → Codex
```

Target dogfooding:

```text
Dispatcher → agent-runtime-mcp → TmuxBackend → Codex
```

The runtime may carry an Issue reference for correlation, but must not claim, select, accept, Review, or close Tasks.

## 9. Final principle

```text
Publisher = make Task executable
Dispatcher = deliver it to an isolated Worker runtime
Worker = execute one Attempt
Reviewer = decide what the result means
GitHub = durable Task authority
```

Chat and terminal state are operational views, not project state.