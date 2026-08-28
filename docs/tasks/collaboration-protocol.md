# Repository Collaboration Protocol

This document defines how **this repository** is developed. It is separate from the public Channel MCP product protocol.

## 1. Default execution model

```text
GPT Web Coordinator conversation
→ define / split / publish Task
→ status:ready + env:web-gpt
→ Web GPT Worker conversation
→ claim / Attempt N / implementation / evidence through @GitHub
→ status:review | status:blocked
→ original GPT Web Coordinator conversation
→ ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

GitHub is durable project state. GitHub Actions is verification infrastructure.

## 2. Coordinator

The original GPT Web conversation owns:

- project goals and priorities;
- architecture/product-boundary decisions;
- Task decomposition and Publication Gate;
- routing and downstream Worker handoff;
- review/recovery/iteration decisions;
- Final Acceptance and closure.

The Coordinator does **not** implement normal repository Tasks.

## 3. Web GPT Worker

The default Worker is a **different GPT Web conversation** using `@GitHub`.

It:

- reads live Issue/Task Package/canonical docs;
- confirms `status:ready + env:web-gpt + owner:none`;
- claims exactly one Attempt;
- authors repository changes through GitHub;
- uses GitHub Actions as the Runner for required tests and real tmux integration;
- records exact Candidate/Evidence;
- posts `[EXECUTION REPORT]` or `[BLOCKER REPORT]`;
- releases ownership and stops.

It must not Review/ACCEPT/close the Task or autonomously choose another Task.

Standard handoff is defined in `docs/tasks/handoffs/web-gpt.md`.

## 4. Optional Codex route

Dispatcher/Codex remains an optional route for a future Task that genuinely requires an external coding/runtime environment:

```text
Coordinator
→ Dispatcher
→ isolated worktree/tmux
→ Codex Worker
→ Coordinator Review
```

That is not the default route for this lightweight repository.

## 5. GitHub Actions

Actions is a Runner/Evidence source, not a Worker and not Task authority.

Linux Actions should perform portable checks and real tmux integration when required by the Task Contract.

## 6. Review

Only the Coordinator conversation performs normal Review:

```text
status:review
→ re-read Issue/comments
→ read frozen Task Contract
→ inspect Candidate/PR
→ inspect Actions evidence
→ [COORDINATOR REVIEW]
→ ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns the same Issue to ready for Attempt N+1 and emits a fresh Web GPT Worker handoff. Contract changes return to draft and Publication Gate.

## 7. Product separation

Repository collaboration is not MCP product behavior.

Channel MCP remains limited to existing-terminal communication:

```text
list/get channel
read channel
write text
send control
health
```

Web Worker/Issue/Actions semantics do not appear in product code.

## 8. Core principle

```text
original GPT Web = Coordinator / Review authority
separate GPT Web conversation = default Worker
GitHub Actions = verification Runner
GitHub = durable Task authority
Dispatcher/Codex = optional execution route
Channel MCP = product being built, not collaboration engine
```
