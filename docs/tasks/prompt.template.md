# Session Bootstrap — <task title>

You are executing one already-published independent Task in `liqiangcc/agent-runtime-mcp`.

This file is **Worker bootstrap/navigation only**. It is not the Task Contract and it is not the Dispatcher launch policy.

## Execution Context

```text
GitHub Issue: #<number>
Task Contract: docs/tasks/<issue>-<slug>/task.md
Expected worker: codex
Expected dispatch route: task-dispatcher
```

This Worker session may have been launched directly or through `$task-dispatcher`. The launch mechanism does not change claim/Attempt rules.

## Start Protocol

Before any write-side work:

1. Read live GitHub Issue `#<number>` and all relevant comments.
2. Read `AGENTS.md`.
3. Read `docs/README.md` and every canonical document referenced by the Task Contract.
4. Read `docs/tasks/collaboration-protocol.md`.
5. Read `docs/tasks/issue-state-convention.md`.
6. Read `docs/tasks/issue-lifecycle-protocol.md`.
7. Read `docs/tasks/<issue>-<slug>/task.md`.
8. Confirm Issue is open, `Status: status:ready`, `Active owner: none`, Task Package resolves, and current environment has all Required Capabilities.
9. Re-read Issue immediately before claim. A Dispatcher-launched process is not proof the Task remains claimable.
10. Claim the Task yourself, transition to `status:in-progress`, determine next `Attempt N`, and confirm durable ownership before implementation.
11. Execute only the published `task.md` Scope/Requirements/Claims/Success Criteria.
12. Persist recoverable candidate/evidence before finishing.
13. Normal finish: post `[EXECUTION REPORT]`, move to `status:review`, release ownership, verify Issue update, and stop.
14. Blocked finish: post `[BLOCKER REPORT]`, move to `status:blocked`, release ownership, verify Issue update, and stop.

Do not dispatch another Worker, automatically start another Task/Attempt, Review your own result, set `status:done`, or close the Issue.

## Authority

```text
canonical docs
→ product / architecture / security facts

AGENTS.md
→ repository-wide Agent rules

task.md
→ current Task execution contract

prompt.md
→ Worker bootstrap/navigation only

GitHub Issue body state block
→ live Task state / active owner / blocker / candidate pointers

GitHub Issue comments
→ append-only Attempt / Blocker / Recovery / Review / Acceptance history

Dispatcher/runtime state
→ process/liveness/recovery evidence only
```

If this prompt conflicts with higher-authority repository sources, ignore the conflicting prompt text.

## Collaboration reminder

```text
Publisher made this Task ready
Dispatcher may have transported this handoff
Worker must still claim the Issue itself
Reviewer is the next authority after Worker report
```

If the Task returns for a later Attempt, use the fresh Reviewer/Publisher handoff and reuse valid durable branch/PR/evidence as directed.

## Runtime reminder

```text
terminal idle/running/exited
!= GitHub Task status
```

Do not infer Task completion/acceptance from terminal or tmux state. Report durable results to GitHub.

## Task-specific entry note

Only add the minimum information needed to start this Task, such as:

- Issue number;
- Task Contract path;
- required local/tmux condition;
- one narrow startup reminder that does not redefine Scope.

Do not duplicate Goal, full Scope, Claims, architecture invariants or Success Criteria from `task.md` here.