# Issue-driven Task Model

This directory defines **repository development workflow**, not the public MCP product protocol.

Independent Task package:

```text
GitHub Issue
+
docs/tasks/<issue>-<slug>/
├── task.md
└── prompt.md
```

Role chain:

```text
GPT Web Coordinator
→ Task Publisher
→ Task Dispatcher
→ Task Worker
→ Task Reviewer
```

See `collaboration-protocol.md`.

## Durable state

Issue body stores the current snapshot defined by `issue-state-convention.md`.
Issue comments store append-only Attempt/Blocker/Review/Acceptance history.
`task.md` is the frozen execution contract.
`prompt.md` is bootstrap/navigation only.

Canonical Codex handoff:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

## Publisher

```text
Goal
→ status:draft
→ Issue + task.md + prompt.md
→ GitHub read-back Publication Gate
→ status:ready + owner:none
→ canonical handoff
```

Publisher does not dispatch, execute or Review.

## Dispatcher

Dispatcher owns this repository's execution environment preparation:

```text
Issue
→ isolated worktree
→ issue-linked tmux pane/session
→ Codex process
→ canonical handoff delivery
```

Dispatcher does not claim the Issue or change Task meaning.

Initially it may communicate through native tmux.

After Channel MCP is accepted, it may use:

```text
prepare worktree/tmux/Codex externally
→ Channel MCP discovers that existing pane
→ write_text/read_channel/send_control
```

Channel MCP does not create the worktree, tmux pane or Codex process and does not store Issue mapping.

## Worker

```text
re-read live GitHub
→ claim ready/no-owner Task
→ Attempt N
→ execute frozen Contract
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
```

Worker never Reviews itself, closes the Issue or starts another Task.

## Reviewer

Reviews Issue + Contract + Candidate + required evidence and chooses:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns the same Issue to ready and emits a fresh handoff for Dispatcher.
Contract changes return to draft and Publisher Publication Gate.

## Lifecycle

```text
status:draft
→ Publication Gate
→ status:ready
→ Dispatcher prepares/delivers execution context
→ Worker claim
→ status:in-progress
→ Attempt N
→ review | blocked
→ Reviewer
```

Dispatcher launch does not begin an Attempt; Worker claim does.

## Recovery

`status:in-progress + dead/missing tmux/channel/process` is a Reviewer/Coordinator recovery condition, not permission for Dispatcher to auto-create Attempt N+1.

A Channel MCP `CHANNEL_NOT_FOUND` result is only transport evidence. Upper-layer collaboration decides whether/how to rebuild the execution environment.

## Product separation

The product contract is under the canonical Channel docs referenced by `docs/README.md`.

Repository concepts below are **not** product concepts:

```text
Publisher
Dispatcher
Worker
Reviewer
Issue
Attempt
worktree
Issue↔pane mapping
Codex lifecycle
```

Final principle:

```text
GitHub = durable repository Task authority
Channel MCP = optional terminal communication transport only
```
