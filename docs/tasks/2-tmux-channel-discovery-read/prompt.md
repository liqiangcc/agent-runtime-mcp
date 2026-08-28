# Session Bootstrap — MVP-001 Tmux channel discovery and bounded read

This repository Task is executed directly by **Web GPT**.

Task Contract:

```text
docs/tasks/2-tmux-channel-discovery-read/task.md
```

## Execution context

```text
GitHub Issue: #2
Executor: Web GPT
Environment: env:web-gpt
Route: direct-web-gpt
Verification Runner: GitHub Actions Linux
```

## Start protocol

Before implementation:

1. read `AGENTS.md`;
2. read live Issue #2 and relevant comments;
3. read repository lifecycle/state/collaboration protocols;
4. read this Task Contract and canonical Channel docs;
5. confirm Issue is open, `status:ready`, `Active owner: none`;
6. create/reuse a Task-specific Git branch;
7. claim by setting `status:in-progress`, `Active owner: web-gpt`;
8. implement only the frozen Contract through GitHub;
9. use GitHub Actions for all required automated and real-tmux verification;
10. inspect/fix failures on the same Task branch.

No Dispatcher or Codex execution is required.

## Product boundary

The product is a Channel MCP over already-existing terminal panes. Do not introduce Worker registry, project Task mapping, tmux lifecycle tools, Codex startup, write/control input, or scheduling in this Task.

## Completion

Execution phase:

```text
persist exact Candidate
→ verify required Actions jobs
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
```

Reviewer phase:

```text
re-read Issue + frozen task.md + Candidate files + CI evidence
→ post [COORDINATOR REVIEW]
→ ACCEPT | REVISE | BLOCK | SPLIT
```

Web GPT may perform both phases sequentially, but review must be a fresh GitHub read-back and may not rely only on implementation memory.

Do not start MVP-002 before Final Acceptance of Issue #2.
