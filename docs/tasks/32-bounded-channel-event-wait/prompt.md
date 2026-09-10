# Session Bootstrap — bounded Channel event wait (design draft)

This package is a Coordinator-reviewable design draft for Issue #32. It is not claimable or executable until the Coordinator completes Publication Gate and moves the Issue to `status:ready`.

## Context

```text
GitHub Issue: #32
Task Contract draft: docs/tasks/32-bounded-channel-event-wait/task.md
Detailed design draft: docs/tasks/32-bounded-channel-event-wait/design.md
Executor route if later published: coordinator-authorized-codex-a (existing tmux `a` session)
Environment if later published: env:codex
Reviewer / authority: original GPT Web Coordinator conversation
```

## Navigation

Read the live Issue and comments, then the draft `task.md` and `design.md`, canonical product docs, and repository collaboration/lifecycle protocols. Do not claim an Attempt while the Issue remains a proposal/draft. The Coordinator must freeze the remaining finite bounds, pass Publication Gate, and explicitly authorize the Codex executor in the existing `a` session before implementation begins. Seven-tool discovery/runtime tests are later implementation Evidence, not prerequisites for publishing this design.

## Explicit boundary

This draft does not authorize product-code changes, merging, deployment, Issue closure, tag/release creation, or cross-round web-session wake-up. Any future Worker executes exactly one subsequently frozen Attempt and reports evidence to the Coordinator; it never self-accepts the Task.
