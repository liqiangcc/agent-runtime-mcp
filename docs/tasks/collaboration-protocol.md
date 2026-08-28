# Repository Collaboration Protocol

This document defines how **this repository** is developed. It is separate from the public Channel MCP product protocol.

## 1. Default execution model

```text
GPT Web Coordinator
→ define / split / publish Task
→ status:ready
→ Task Dispatcher
→ isolated execution context
→ Codex Task Worker
→ claim / Attempt N / implementation / evidence
→ status:review | status:blocked
→ GPT Web Coordinator / Task Reviewer
→ ACCEPT | REVISE | BLOCK | SPLIT
```

GitHub is durable project state. GitHub Actions is verification infrastructure.

## 2. GPT Web Coordinator

GPT Web owns:

- project goals and priorities;
- architecture/product-boundary decisions;
- Task decomposition and Publication Gate;
- routing to an eligible Worker;
- review/recovery/iteration decisions;
- Final Acceptance and closure.

GPT Web does **not** act as the repository implementation Worker for normal Tasks.

## 3. Dispatcher

Dispatcher bridges a published handoff to an isolated Codex execution context.

It may:

- verify ready/no-owner/capability state;
- prepare/reconcile an Issue-specific worktree;
- prepare/reconcile tmux/Codex runtime;
- deliver the canonical Worker handoff unchanged;
- report runtime/worktree recovery evidence.

It must not claim, implement, Review, accept or close the Task.

## 4. Codex Worker

Codex claims and executes exactly one Attempt:

```text
status:ready + owner:none
→ Worker claim
→ status:in-progress
→ Attempt N
→ implementation / tests / CI evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked
→ owner:none
→ STOP
```

Worker never self-accepts or automatically selects the next Task.

## 5. Reviewer

GPT Web / `$task-reviewer` reads the frozen Contract, Candidate/PR and actual Evidence, then decides:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns the same Issue to ready for Attempt N+1. Contract changes return to draft and Publication Gate.

## 6. GitHub Actions

Actions is a Runner/Evidence source, not a Worker and not Task authority.

For this project, Linux Actions should perform portable checks and real tmux integration when required by the Task Contract.

## 7. Product separation

The repository workflow is not MCP product behavior.

Channel MCP remains limited to existing-terminal communication:

```text
list/get channel
read channel
write text
send control
health
```

The collaboration layer owns Issue/worktree/tmux/Codex lifecycle and Task meaning.

## 8. Isolation

Default Codex route:

```text
one concurrent Issue
→ one isolated mutable worktree
→ one issue-linked tmux/Codex execution context
```

Dispatcher owns that execution mapping. Channel MCP does not store it.

## 9. Recovery

```text
status:in-progress + live runtime
→ active Attempt

status:in-progress + dead/missing runtime
→ Coordinator/Reviewer recovery required
```

Dispatcher must not automatically create Attempt N+1.

## 10. Core principle

```text
GPT Web = Coordinator / Review authority
Dispatcher = execution delivery
Codex = implementation Worker
GitHub Actions = verification Runner
GitHub = durable Task authority
Channel MCP = product being built, not collaboration engine
```
