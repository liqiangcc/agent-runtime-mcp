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

## Goal

A single verifiable statement of what this repository Task must accomplish.

## Canonical / Process Sources

Read:

- `AGENTS.md`
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

List only Task-relevant invariants.

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

1.

## Claims / Verification

```text
C1: <claim>
C2: <claim>
```

Record exact Candidate SHA for code-dependent evidence. Do not report tests as PASS if the actual Actions run/job was not read.

## Security Review

```text
Security-sensitive: yes | no
Threats/controls from docs/security.md:
Remote ingress affected: yes | no
```

## Success Criteria

Freeze before execution.

1. SC1:
2. SC2:

Do not lower criteria after observing results.

## Failure / Blocked Rules

Define FAIL, BLOCKED and minimal resume condition.

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
