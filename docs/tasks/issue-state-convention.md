# Issue State Convention

This repository uses the GitHub Issue itself as the live Task-state snapshot. Comments remain append-only execution/review history.

## 1. Canonical state block

Every independent Task Issue must keep this machine-readable block near the top of the Issue body:

```text
Status: status:draft | status:ready | status:in-progress | status:review | status:blocked | status:done
Active owner: none | <worker identity>
Environment: env:web-gpt | env:codex | <other explicitly defined environment>
Worker route: separate-gpt-web-conversation | <other explicit route>
Task package: docs/tasks/<issue>-<slug>/
Parent: <goal/issue or n/a>
Candidate: <sha or n/a>
PR: <reference or n/a>
Blocker: <short current blocker or none>
```

Default repository implementation route is:

```text
Environment: env:web-gpt
Worker route: separate-gpt-web-conversation
```

Codex/Dispatcher or another environment is optional and must be explicitly published for that Task.

The prose below the block may evolve, but the state fields must remain unambiguous.

## 2. Why the Issue body is authoritative

```text
Issue body state block = required live state authority
labels / assignee = optional mirrors / convenience indexes
comments = append-only history
```

If an optional mirror conflicts with the body, repair the inconsistency rather than guessing.

## 3. Active ownership

`Active owner: none` means the Task is unclaimed.

A successful Worker claim changes:

```text
Status: status:ready
Active owner: none
```

to:

```text
Status: status:in-progress
Active owner: <worker identity>
```

The Worker immediately re-reads the Issue before write-side execution. If durable ownership is not confirmed, it stops.

A GitHub assignee may mirror ownership but is not required for correctness.

## 4. Attempt identity

Attempt number is derived from append-only Issue history.

Each successful `ready → in-progress` claim starts the next monotonically increasing Attempt.

## 5. Completion transitions

Normal Worker completion:

```text
post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
```

Blocked Worker completion:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ Blocker: <current blocker>
```

Coordinator REVISE / UNBLOCK:

```text
Status: status:ready
Active owner: none
```

Coordinator Final Acceptance:

```text
post [FINAL ACCEPTANCE]
→ Status: status:done
→ Active owner: none
→ close Issue
```

## 6. Candidate / PR fields

`Candidate` and `PR` are current convenience pointers only. Immutable evidence remains in comments, commits, PRs and CI runs.

Updating the pointer must not erase previous Attempt history.

## 7. Status labels

Custom labels such as `status:ready` may be added as convenience indexes.

If adopted, labels must mirror the body state. Labels do not change Worker/Coordinator authority.

## 8. No runtime inference

Neither tmux state nor `agent-runtime-mcp` output may mutate or infer Issue state automatically.

```text
runtime idle
!= status:review
!= status:done
```

Only repository collaboration roles change Task state.
