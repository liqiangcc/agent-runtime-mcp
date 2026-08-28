# Issue-driven Task Model

Independent Worker execution is packaged as:

```text
GitHub Issue
+
docs/tasks/<issue>-<slug>/
├── task.md
└── prompt.md
```

## Responsibilities

### GitHub Issue

Live coordination snapshot and append-only history:

```text
status
active owner
blocker
candidate / PR summary
Attempt history
Execution Reports
Coordinator Reviews
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

Minimal bootstrap/navigation entry for a fresh Codex Worker session.

It points to the Issue and Task Contract and reminds the Worker how to claim/report/stop. It must not duplicate or redefine the Task Contract.

## Lifecycle

```text
status:draft
→ Publication Gate
→ status:ready
→ Codex claim
→ status:in-progress
→ Attempt N
→ execution report / blocker report
→ status:review / status:blocked
→ GPT Web Coordinator review
```

See `issue-lifecycle-protocol.md` for the complete state machine.

## Publication Gate

A Coordinator may publish a Task to Codex only after:

1. Issue Goal is concrete.
2. `task.md` exists and is executable.
3. `prompt.md` exists and points to the exact Task Package.
4. Architecture/security impact has been checked.
5. Dependencies and required capabilities are explicit.
6. Success Criteria are frozen before execution.
7. GitHub read-back confirms the committed paths/state.
8. Issue is moved to `status:ready` with no active Worker owner.

The Coordinator then gives Codex a minimal entry such as:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

If the skill is unavailable, the fallback prompt must tell Codex to read `AGENTS.md`, the live Issue/comments, `prompt.md`, `task.md`, and the Issue lifecycle protocol before claiming.

## Attempt rule

Each successful `status:ready → status:in-progress` claim starts a new monotonically increasing Attempt number.

A failed or revised Attempt does not normally create a new Issue when Goal/Scope/Success Criteria remain the same.

## Coordinator vs Worker

Codex Worker:

```text
claim
→ execute one Attempt
→ durable report
→ release ownership
→ stop
```

GPT Web Coordinator:

```text
publish
→ route
→ review
→ ACCEPT | REVISE | BLOCK | SPLIT
→ final acceptance / next Attempt
```

Worker must never self-accept, close the Issue, or automatically start the next Task.