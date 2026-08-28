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

Live coordination snapshot and append-only history.

The required current snapshot is the machine-readable body block defined by `issue-state-convention.md`:

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

### Handoff profile

`handoffs/codex.md` defines how GPT Web Coordinator hands one already-published Task to Codex. The handoff syntax does not own Task Scope or state.

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

See `issue-lifecycle-protocol.md` for the complete state machine and `issue-state-convention.md` for the live state representation.

## Publication Gate

A Coordinator may publish a Task to Codex only after:

1. Issue Goal is concrete.
2. Issue body state block is valid and currently `status:draft`.
3. `task.md` exists and is executable.
4. `prompt.md` exists and points to the exact Task Package.
5. Architecture/security impact has been checked.
6. Dependencies and required capabilities are explicit.
7. Success Criteria are frozen before execution.
8. GitHub read-back confirms the committed paths/state.
9. `Active owner: none`.
10. Coordinator changes the live state to `status:ready` and performs one final read-back.

Only then does the Coordinator output the Codex downstream entry from `handoffs/codex.md`, normally:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

If the skill is unavailable, use the fallback entry defined by that handoff profile.

## Attempt rule

Each successful `status:ready → status:in-progress` claim starts a new monotonically increasing Attempt number.

A failed or revised Attempt does not normally create a new Issue when Goal/Scope/Success Criteria remain the same.

## Coordinator vs Worker

Codex Worker:

```text
read live GitHub
→ claim
→ execute one Attempt
→ durable report
→ release ownership
→ stop
```

GPT Web Coordinator:

```text
decompose
→ materialize Issue + Task Package
→ Publication Gate
→ publish/route
→ review
→ ACCEPT | REVISE | BLOCK | SPLIT
→ final acceptance / next Attempt
```

Worker must never self-accept, close the Issue, or automatically start the next Task.

## Runtime integration

When `agent-runtime-mcp` itself becomes capable of safe write actions, GPT Web may deliver the same Codex handoff text through a managed runtime Worker.

That changes only the transport:

```text
GPT Web
→ GitHub decides Task
→ agent-runtime-mcp transports bootstrap
→ Codex claims through GitHub
```

The runtime does not become Task authority.