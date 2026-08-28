# Issue State Convention

This repository uses the GitHub Issue itself as the live Task-state snapshot. Comments remain append-only execution/review history.

## 1. Canonical state block

Every independent Task Issue must keep this machine-readable block near the top of the Issue body:

```text
Status: status:draft | status:ready | status:in-progress | status:review | status:blocked | status:done
Active owner: none | <worker identity>
Environment: env:codex | <other explicitly defined environment>
Task package: docs/tasks/<issue>-<slug>/
Parent: <goal/issue or n/a>
Candidate: <sha or n/a>
PR: <reference or n/a>
Blocker: <short current blocker or none>
```

The exact prose below the block may evolve, but these fields must remain unambiguous.

## 2. Why the Issue body is authoritative

The collaboration protocol must work even when a repository has not yet provisioned a custom label taxonomy or a particular client cannot create labels.

Therefore:

```text
Issue body state block = required live state authority
labels / assignee = optional mirrors / convenience indexes
comments = append-only history
```

If labels later mirror state, a mismatch is an inconsistency that must be repaired; the Worker must not silently guess which value is intended.

## 3. Active ownership

`Active owner: none` means the Task is unclaimed.

A successful claim must atomically enough for practical GitHub coordination change:

```text
Status: status:ready
Active owner: none
```

to:

```text
Status: status:in-progress
Active owner: <worker identity>
```

Then the Worker re-reads the Issue before write-side execution. If the re-read does not show its ownership, it stops.

GitHub assignee may mirror the owner when useful, but is not required for correctness.

## 4. Attempt identity

Attempt number is derived from append-only Issue history, not stored as the only mutable counter in the state block.

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

Coordinator REVISE/UNBLOCK:

```text
Status: status:ready
Active owner: none
```

Coordinator final acceptance:

```text
post [FINAL ACCEPTANCE]
→ Status: status:done
→ Active owner: none
→ close Issue
```

## 6. Candidate/PR fields

`Candidate` and `PR` are current convenience pointers only. The immutable history/evidence remains in Attempt comments, commits, PRs and CI runs.

Updating the current pointer must not erase previous Attempt history.

## 7. Status labels

Custom labels such as `status:ready` may be added later for queue search and UI convenience.

If adopted, labels must mirror the body state and the repository should add a validator or explicit Publication Gate check. Labels do not change the Worker/Coordinator authority split.

## 8. No runtime inference

Neither tmux state nor `agent-runtime-mcp` output may mutate or infer this Issue state automatically in MVP.

```text
runtime idle
!= status:review
!= status:done
```

Only the Worker/Coordinator lifecycle protocol changes Task state.