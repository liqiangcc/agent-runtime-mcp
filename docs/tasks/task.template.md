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

For product implementation, current canonical product sources start with:

```text
docs/requirements.md
docs/channel-architecture.md
docs/channel-model.md
docs/mcp-contract.md
```

## Dispatch Requirements

```text
Expected child environment/capabilities:
Isolation: one concurrent Issue = one isolated mutable worktree/execution context
Communication mode: native tmux | Channel MCP when accepted
```

Dispatcher owns project environment preparation. Channel MCP, when used, is communication transport only.

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

- Publisher/Dispatcher/Worker/Reviewer authorities remain separate.
- Dispatcher launch does not claim the Issue.
- GitHub is durable repository Task authority.

## Implementation Requirements

1.

## Claims / Verification

```text
C1: <claim>
C2: <claim>
```

Record exact Candidate SHA for code-dependent evidence. Do not report tests as PASS if not run.

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
Worker identity
Base/Candidate SHA
PR
Dispatcher execution-context evidence when relevant
commands / CI run
versions/environment
claim results
known limitations
```

Do not persist secrets or unnecessary terminal transcripts.

## Completion Protocol

```text
Publisher → ready + canonical handoff
Dispatcher → isolated execution context + handoff delivery
Worker → claim → Attempt N → report → review/blocked → owner:none → STOP
Reviewer → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Contract change returns to draft + Publisher Gate. Only Final Acceptance may set done/close.
