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
Required capabilities: <capability list>
Hard dependencies: <none or explicit dependencies>
```

> Live status, owner, blocker, active branch/PR and Attempt results belong in the GitHub Issue, not this file.

## Goal

A single verifiable statement of what this Task must accomplish.

## Why / Context

Explain the product goal, architecture gap, risk or MVP milestone that makes this Task necessary now.

## Preconditions

- Required prior Issue/Task:
- Required runtime/tooling:
- Required permissions:
- Required test environment:
- Current external integration assumptions to verify (if any):
- Existing candidate/branch/PR to reuse:

## In Scope

-

## Out of Scope

-

## Architecture Invariants

List only the invariants directly relevant to this Task. Reference canonical docs rather than copying all architecture text.

Examples when relevant:

- GitHub remains Task authority.
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

Do not report tests as PASS when they were not run.

For external integration claims such as ChatGPT remote MCP support, record the actual live capability/environment/date rather than relying only on design assumptions.

## Security Review

```text
Security-sensitive: yes | no
Threats touched: <T1..T9 from docs/security.md or n/a>
Required controls: <S1..S12 from docs/security.md or n/a>
Remote ingress affected: yes | no
```

If the implementation weakens a canonical security control, stop and require a formal design change rather than silently proceeding.

## Success Criteria

Freeze these before execution.

1. SC1:
2. SC2:

For verification claims:

```text
C1 PASS when:
C2 PASS when:
```

Do not lower the criteria after observing results simply to obtain PASS.

## Failure / Blocked Rules

### FAIL

Define behavior/evidence that means the implementation or claim failed.

### BLOCKED

Define missing capability/dependency/environment conditions that prevent further valid execution.

For plan/workspace-dependent external integrations, lack of required write capability is a legitimate blocker when write behavior is part of the frozen Goal.

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

Coordinator:

```text
read Issue + task.md + candidate/evidence
→ [COORDINATOR REVIEW]
→ ACCEPT | REVISE | BLOCK | SPLIT
```

Only Coordinator can post `[FINAL ACCEPTANCE]`, set `status:done`, and close the Issue.

Full protocol: `docs/tasks/issue-lifecycle-protocol.md`.