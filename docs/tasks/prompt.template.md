# Session Bootstrap — <task title>

You are executing one already-published independent Task in `liqiangcc/agent-runtime-mcp`.

This file is **bootstrap/navigation only**. It is not the Task Contract.

## Execution Context

```text
GitHub Issue: #<number>
Task Contract: docs/tasks/<issue>-<slug>/task.md
Expected worker: codex
```

## Start Protocol

Before any write-side work:

1. Read the live GitHub Issue `#<number>` and all relevant comments.
2. Read `AGENTS.md`.
3. Read `docs/README.md` and every canonical document referenced by the Task Contract.
4. Read `docs/tasks/<issue>-<slug>/task.md`.
5. Read `docs/tasks/issue-lifecycle-protocol.md`.
6. Confirm the Issue is open, `status:ready`, has no active execution owner, and the current environment has all Required Capabilities.
7. Re-read the Issue immediately before claim.
8. Claim the Task, transition it to `status:in-progress`, determine the next `Attempt N`, and confirm the claim is durable before implementation.
9. Execute only the published `task.md` Scope/Requirements/Claims/Success Criteria.
10. Persist recoverable candidate/evidence before finishing.
11. Normal finish: post `[EXECUTION REPORT]`, move to `status:review`, release ownership, verify the Issue update, and stop.
12. Blocked finish: post `[BLOCKER REPORT]`, move to `status:blocked`, release ownership, verify the Issue update, and stop.

Do not automatically start another Task or another Attempt.

Worker must not set `status:done` or close the Issue.

## Authority

```text
canonical docs
→ product / architecture / security facts

AGENTS.md
→ repository-wide Agent rules

task.md
→ current Task execution contract

prompt.md
→ bootstrap/navigation only

GitHub Issue labels/fields
→ live Task state / owner / blocker summary

GitHub Issue comments
→ append-only Attempt / Review / Acceptance history
```

If this prompt conflicts with higher-authority repository sources, ignore the conflicting prompt text.

## Runtime reminder

This repository deliberately separates Runtime from Task state.

If you are executing through `agent-runtime-mcp` / tmux:

```text
terminal idle/running/exited
!= GitHub Task status
```

Do not infer acceptance/completion from the terminal. Report durable results to GitHub according to the lifecycle protocol.

## Task-specific entry note

Only add the minimum information needed to start this Task, such as:

- Issue number;
- Task Contract path;
- required local/tmux condition;
- one narrow startup reminder that does not redefine Scope.

Do not duplicate Goal, full Scope, Claims, architecture invariants or Success Criteria from `task.md` here.