# Session Bootstrap — bounded Channel event wait (frozen Contract)

This package is the frozen implementation Contract for Issue #32. It remains non-claimable until the Coordinator completes Publication Gate, moves the Issue to `status:ready`, and the authorized Codex executor successfully claims an Attempt.

## Context

```text
GitHub Issue: #32
Task Contract: docs/tasks/32-bounded-channel-event-wait/task.md
Detailed design: docs/tasks/32-bounded-channel-event-wait/design.md
Executor route if later published: coordinator-authorized-codex-a (existing tmux `a` session)
Environment if later published: env:codex
Reviewer / authority: original GPT Web Coordinator conversation
```

## Navigation

Read the live Issue and comments, then `task.md` and `design.md`, canonical product docs, and repository collaboration/lifecycle protocols. Do not claim an Attempt until the live Issue is `status:ready`, owner none, and Publication Gate PASS. After a successful claim, execute exactly this frozen Contract in the authorized Codex `a` session. Seven-tool discovery/runtime tests and Candidate verification are implementation Evidence; they do not alter this Contract.

## Explicit boundary

No execution is authorized before the live ready+claim gate. After claim, the executor may implement and verify only this Contract; it must not merge, deploy, close the Issue, create a tag/release, or perform cross-round web-session wake-up. It reports evidence to the Coordinator and never self-accepts the Task.
