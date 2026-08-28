# Session Bootstrap — MVP-001 Runtime core and tmux worker discovery

You are executing one published Task in `liqiangcc/agent-runtime-mcp`.

This file is Worker navigation/bootstrap only. The Task Contract is:

```text
docs/tasks/2-runtime-core-tmux-discovery/task.md
```

## Execution Context

```text
GitHub Issue: #2
Expected Worker: Codex
Expected environment: env:codex
Expected dispatch route: task-dispatcher bootstrap-native
Handoff profile: docs/tasks/handoffs/codex.md
```

You may have been launched by `$task-dispatcher` inside an Issue-isolated git worktree/tmux session. That launch does **not** claim the Issue and does not start an Attempt. You must still perform the GitHub claim yourself.

## Start protocol

Before write-side implementation:

1. Read `AGENTS.md`.
2. Read live Issue #2 and all relevant comments.
3. Read `docs/tasks/collaboration-protocol.md`.
4. Read `docs/tasks/issue-state-convention.md`.
5. Read `docs/tasks/issue-lifecycle-protocol.md`.
6. Read the Task Contract and every canonical document it lists.
7. Confirm:
   - Issue is open;
   - `Status: status:ready`;
   - `Active owner: none`;
   - Task Package still resolves;
   - current execution context has all required capabilities;
   - this is the Dispatcher-provided isolated Issue worktree or another explicitly valid Task-specific checkout.
8. Re-read immediately before claim.
9. Claim exactly one new Attempt by updating live Issue state to `status:in-progress` with your Worker identity, then re-read and confirm ownership.
10. Execute only the current Task Contract.

If Issue is still `status:draft`, already owned, blocked, no longer eligible, or the execution context is not valid, stop without implementation changes.

## Collaboration boundary

```text
Task Publisher
→ made Issue #2 executable

Task Dispatcher
→ may have created worktree/tmux and delivered this bootstrap
→ does NOT own Issue #2

You / Task Worker
→ must claim and execute exactly one Attempt

Task Reviewer
→ next authority after your durable report
```

Do not ask Dispatcher to change Task Scope or make Review decisions.

## Completion

Normal completion:

```text
persist exact Candidate/evidence
→ post standard [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ read back
→ STOP
```

Blocked completion:

```text
post standard [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ read back
→ STOP
```

Do not:

- Review/accept your own result;
- set `status:done`;
- close Issue #2;
- dispatch another Worker;
- begin MVP-002;
- begin another Attempt without Reviewer REVISE/UNBLOCK/recovery;
- infer Task completion from tmux/runtime output.

Task Reviewer / GPT Web Coordinator is the next authority after this Attempt.