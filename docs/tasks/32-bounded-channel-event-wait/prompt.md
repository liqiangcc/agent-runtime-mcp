# Session Bootstrap — bounded Channel event wait (design draft)

This package is a Coordinator-reviewable design draft for Issue #32. It is not claimable or executable until the Coordinator completes Publication Gate and moves the Issue to `status:ready`.

## Context

```text
GitHub Issue: #32
Task Contract draft: docs/tasks/32-bounded-channel-event-wait/task.md
Detailed design draft: docs/tasks/32-bounded-channel-event-wait/design.md
Worker route if later published: separate-gpt-web-conversation
Reviewer / authority: original GPT Web Coordinator conversation
```

## Navigation

Read the live Issue and comments, then the draft `task.md` and `design.md`, canonical product docs, and repository collaboration/lifecycle protocols. Do not claim an Attempt while the Issue remains a proposal/draft. The Coordinator must decide the open contract questions, update canonical docs as required, pass Publication Gate, and emit a fresh Worker handoff before implementation begins.

## Explicit boundary

This draft does not authorize product-code changes, merging, deployment, Issue closure, tag/release creation, or cross-round web-session wake-up. Any future Worker executes exactly one subsequently frozen Attempt and reports evidence to the Coordinator; it never self-accepts the Task.
