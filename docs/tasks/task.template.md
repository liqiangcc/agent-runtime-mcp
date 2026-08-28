# Task — <title>

## Metadata

```text
GitHub Issue: #<number>
Task ID: <id>
Task kind: implementation | verification | combined | research
Base commit: <sha>
Candidate commit: <sha or n/a>
Session bootstrap: docs/tasks/<issue>-<slug>/prompt.md
Preferred worker: codex
Dispatch route: task-dispatcher
Required capabilities: <capability list>
Hard dependencies: <none or explicit dependencies>
```

> Live status, owner, blocker, active branch/PR/runtime and Attempt results belong in the GitHub Issue / durable execution records, not this file.

## Goal

A single verifiable statement of what this Task must accomplish.

## Why / Context

Explain the product goal, architecture gap, risk or MVP milestone that makes this Task necessary now.

## Canonical / Process Sources

Worker must read at least:

- `AGENTS.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- task-relevant canonical docs listed here

## Preconditions

- Required prior Issue/Task:
- Required runtime/tooling:
- Required permissions:
- Required test environment:
- Current external integration assumptions to verify (if any):
- Existing candidate/branch/PR to reuse:

## Dispatch Requirements

```text
Expected child environment/capabilities:
Bootstrap dispatch allowed: yes | no
Runtime-backed dispatch required: yes | no
Isolation requirement: one Issue = one isolated mutable worktree/runtime
```

Dispatcher transports the canonical Worker handoff only. It does not claim or implement the Task.

If an existing issue-linked worktree/runtime is present, reconcile it rather than overwriting it.

## In Scope

-

## Out of Scope

-

## Architecture Invariants

List only invariants directly relevant to this Task. Reference canonical docs rather than copying everything.

Examples when relevant:

- GitHub remains Task authority.
- Publisher/Dispatcher/Worker/Reviewer authorities remain separate.
- Runtime state must not become Task state.
- tmux-specific behavior remains behind `RuntimeBackend`.
- remote MCP ingress is separate from Runtime Backend routing.
- ordinary text input is separate from control input.
- backend commands use structured process execution, not shell string concatenation.
- remote runtime control must not be exposed through an unauthenticated public endpoint.

## Files Expected to Change

-

## Implementation Requirements

1.

If implementation is not part of this Task, write `N/A`.

## Claims / Verification

```text
C1: <claim>
C2: <claim>
```

### Verification plan

| Claim | Environment / execution plane | Command / method | Required evidence |
|---|---|---|---|
| C1 | <...> | <...> | <...> |
| C2 | <...> | <...> | <...> |

Verification must identify the exact Candidate SHA when behavior depends on code identity.

Do not report tests as PASS when they were not run. For external integration claims, record actual live capability/environment/date rather than relying on design assumptions.

## Security Review

```text
Security-sensitive: yes | no
Threats touched: <T1.. from docs/security.md or n/a>
Required controls: <S1.. from docs/security.md or n/a>
Remote ingress affected: yes | no
```

If implementation weakens a canonical security control, stop and require formal design change.

## Success Criteria

Freeze before execution.

1. SC1:
2. SC2:

```text
C1 PASS when:
C2 PASS when:
```

Do not lower criteria after observing results merely to obtain PASS.

## Failure / Blocked Rules

### FAIL

Define behavior/evidence that means implementation or claim failed.

### BLOCKED

Define missing capability/dependency/environment conditions that prevent further valid execution.

### Resume condition

State the minimum concrete condition required to resume.

## Evidence Contract

At minimum record as applicable:

```text
Attempt:
Worker: codex
Base commit:
Candidate commit:
PR:
Dispatcher/runtime mapping when relevant:
Commands / CI run:
Environment:
Relevant versions:
External integration capability/date (if relevant):
Claim results:
Artifacts / logs:
Known limitations:
```

Do not commit or paste secrets, credentials, private terminal history or unnecessary large artifacts.

## Deliverables

- Code/docs:
- Candidate commit / PR:
- Tests/evidence:
- Task bootstrap prompt:

## Completion Protocol

Publisher:

```text
status:draft
→ materialize/read-back Publication Gate
→ status:ready + no owner
→ canonical Worker handoff
```

Dispatcher:

```text
re-read ready/no-owner/capabilities
→ isolated Worker runtime
→ deliver handoff unchanged
→ no Task-state mutation
```

Worker:

```text
status:ready
→ claim
→ status:in-progress
→ Attempt N
→ execute this Contract only
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ status:review or status:blocked
→ release ownership
→ STOP
```

Reviewer:

```text
read Issue + Contract + candidate/evidence
→ ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns to ready and emits a fresh handoff for Dispatcher. Contract change returns to Publisher. Only Final Acceptance may set `status:done` and close.

Full protocols:

- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-lifecycle-protocol.md`