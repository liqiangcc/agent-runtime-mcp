# Task — <title>

## Metadata

```text
GitHub Issue: #<number>
Task ID: <id>
Task kind: implementation | verification | combined | research
Base commit: <sha>
Candidate commit: <sha or n/a>
Session bootstrap: docs/tasks/<issue>-<slug>/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, <task-specific>
Hard dependencies: <none or explicit dependencies>
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

A single verifiable statement of what this repository Task must accomplish.

## Primary Use Case

Plan from the actor goal, not from existing tools/APIs.

```text
Actor:
Trigger:
Preconditions:
Main flow:
Success outcome:
Failure outcome:
Degraded outcome:
Authoritative evidence:
```

If several use cases are included, explain why they are one coherent capability slice rather than independent Tasks.

## Separation Points

Identify the responsibility handoffs relevant to this Task.

Examples:

```text
upper-layer orchestration | Channel MCP
MCP transport/auth | Channel application logic
Channel Service | ChannelBackend
ChannelBackend | TmuxBackend
data transport | control/orchestration
observation | interpretation
execution evidence | acceptance authority
```

For each important separation point, state what belongs on each side and what must not cross the boundary.

## Single Responsibilities

State the primary reason each participating layer/capability should change.

```text
<layer/capability> = <one responsibility>
```

Do not let implementation convenience merge unrelated responsibilities.

## Logic / Control Separation

Separate product/data-path logic from orchestration/control decisions.

```text
Logic/data path owns:
- operation semantics
- accepted/returned data
- safety invariants
- mechanical errors

Control/orchestration owns:
- when/why to invoke
- endpoint/task lifecycle
- scheduling/retry/recovery policy
- acceptance / what happens next
```

State the Task-specific boundary explicitly.

## Success / Failure / Degradation

Before implementation details, define:

- what success proves;
- what is a hard failure;
- what may degrade safely to unknown/unavailable/partial;
- what must never be inferred;
- what must never trigger an implicit lifecycle/control action.

## Required Capabilities

Derive capabilities from the use case and boundaries before mapping them to public tools or implementation APIs.

```text
Use Case
→ Capability
→ Responsibility boundary
→ Evidence
→ Tool/API mapping only when justified
```

## Canonical / Process Sources

Read:

- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- task-relevant canonical product docs.

For product implementation, canonical product sources start with:

```text
docs/requirements.md
docs/channel-architecture.md
docs/channel-model.md
docs/mcp-contract.md
```

## Worker / Verification Route

Default repository route:

```text
original GPT Web conversation = Coordinator / Reviewer
separate GPT Web conversation = Web Worker using @GitHub
GitHub Actions = executable verification Runner / Evidence
```

The Web Worker claims exactly one Attempt and performs repository writes. Commands or real runtime integration that cannot execute in the Web conversation are delegated to GitHub Actions and verified from exact Candidate run/job evidence.

## In Scope

-

## Out of Scope

-

## Architecture Invariants

List only Task-relevant invariants derived from the use-case/separation analysis.

Common product examples:

- Channel is the MCP product domain object.
- Worker/Agent/Task/worktree lifecycle stays outside product code.
- existing tmux pane lifecycle is prepared externally.
- terminal text/activity is not semantic Agent/Task state.
- tmux-specific behavior stays behind `ChannelBackend` / `TmuxBackend`.
- ordinary text is separate from explicit control input.
- backend execution uses structured argv/stdin, not shell interpolation.
- remote write/control requires authentication/authorization.

Repository workflow examples:

- Coordinator and Web Worker are separate GPT Web conversations.
- Web Worker claims and executes exactly one Attempt.
- GitHub Actions is Evidence infrastructure, not Task authority.
- GitHub is durable repository Task authority.

## Implementation Requirements

Only define implementation requirements after use cases, boundaries and capabilities are clear.

1.

## Claims / Verification

```text
C1: <claim tied to use case/boundary>
C2: <claim tied to use case/boundary>
```

Record exact Candidate SHA for code-dependent evidence. Do not report tests as PASS if the actual Actions run/job was not read.

## Security Review

```text
Security-sensitive: yes | no
Threats/controls from docs/security.md:
Remote ingress affected: yes | no
```

Security review should follow the same separation analysis: identify which boundary carries authority/data and which layer is responsible for enforcing it.

## Success Criteria

Freeze before execution.

1. SC1:
2. SC2:

Do not lower criteria after observing results.

## Failure / Blocked Rules

Define FAIL, BLOCKED and minimal resume condition.

## Publication Dependency / Alignment Gate

When upstream implementation details are not yet accepted, keep this Task `status:draft` and list what must be re-read/aligned before Publication Gate.

Do not prematurely freeze concrete class names, file layout, signatures, CI job names or fast-changing provider/client details.

## Evidence Contract

Record as applicable:

```text
Attempt
Worker identity: web-gpt-worker
Base/Candidate SHA
PR / branch when applicable
GitHub Actions run/job
versions/environment
Claim results
known limitations
```

Do not persist secrets or unnecessary terminal transcripts.

## Completion Protocol

```text
Coordinator/Publisher → status:ready + Web Worker entry
separate Web GPT Worker → claim → Attempt N → repository changes → Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked → owner:none → STOP
original GPT Web Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Contract change returns to draft + Publication Gate. Only Final Acceptance may set done/close.
