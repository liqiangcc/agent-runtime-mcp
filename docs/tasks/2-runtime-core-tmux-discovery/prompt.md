# Session Bootstrap — MVP-001 Runtime core and tmux worker discovery

You are executing one published Task in `liqiangcc/agent-runtime-mcp`.

This file is navigation/bootstrap only. The Task Contract is:

```text
docs/tasks/2-runtime-core-tmux-discovery/task.md
```

## Live coordination

```text
GitHub Issue: #2
Expected Worker: Codex
Expected environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
```

## Start protocol

Before any write-side implementation:

1. Read `AGENTS.md`.
2. Read live Issue #2 and all relevant comments.
3. Read `docs/tasks/issue-state-convention.md`.
4. Read `docs/tasks/issue-lifecycle-protocol.md`.
5. Read the Task Contract and every canonical document it lists.
6. Confirm:
   - Issue is open;
   - `Status: status:ready`;
   - `Active owner: none`;
   - the Task package still resolves;
   - required capabilities are available.
7. Claim exactly one new Attempt by updating live Issue state to `status:in-progress` with your Worker identity, then re-read and confirm ownership.
8. Execute only the current Task Contract.

If the Issue is still `status:draft`, already owned, blocked, or otherwise not claimable, stop without implementation changes.

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

- set `status:done`;
- close Issue #2;
- begin MVP-002;
- begin another Attempt without Coordinator REVISE/UNBLOCK;
- infer Task completion from tmux/runtime output.

GPT Web Coordinator is the next authority after this Attempt.