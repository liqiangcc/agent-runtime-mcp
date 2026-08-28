# Session Bootstrap — MVP-001 Tmux channel discovery and bounded read

You are executing one published repository Task in `liqiangcc/agent-runtime-mcp`.

This file is Worker bootstrap/navigation only. The Task Contract is:

```text
docs/tasks/2-tmux-channel-discovery-read/task.md
```

## Execution context

```text
GitHub Issue: #2
Expected Worker: Codex
Expected environment: env:codex
Expected dispatch route: task-dispatcher bootstrap-native
```

The repository Dispatcher may have created an isolated worktree/tmux/Codex environment for this development Task. That orchestration is **not** product functionality and does not claim the Issue.

## Before implementation

1. Read `AGENTS.md`.
2. Read live Issue #2 and all relevant comments.
3. Read repository collaboration/lifecycle/state protocols under `docs/tasks/`.
4. Read the Task Contract and every canonical Channel document it references.
5. Confirm Issue is open, `status:ready`, `Active owner: none`, Task Package resolves, and the current environment has required capabilities.
6. Re-read immediately before claim.
7. Claim exactly one Attempt by changing live Issue state to `status:in-progress` with your Worker identity and confirm the claim from GitHub.
8. Execute only the frozen Task Contract.

## Product-boundary reminder

Do not reintroduce the old managed-Worker Runtime design.

The product is:

```text
existing terminal Channel
→ discover
→ inspect
→ bounded read
```

This Task does not implement Worker registry, Task mapping, tmux lifecycle, Codex startup, write/control input or project scheduling.

## Completion

Normal:

```text
persist exact Candidate/evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ read back
→ STOP
```

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ read back
→ STOP
```

Do not Review/accept/close the Task or start MVP-002. Task Reviewer / GPT Web Coordinator is next authority.
