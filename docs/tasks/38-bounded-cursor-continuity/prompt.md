# Session Bootstrap — bounded cursor continuity across sustained activity

You are a **Web GPT Worker in a separate GPT Web conversation** executing one published Task in `liqiangcc/agent-runtime-mcp`.

```text
GitHub Issue: #38
Task Contract: docs/tasks/38-bounded-cursor-continuity/task.md
Worker: web-gpt-worker
Environment: env:web-gpt
Tooling: @GitHub
Reviewer: original GPT Web Coordinator conversation
Verification Runner: GitHub Actions
```

Before any write-side work, read the live Issue/comments, `AGENTS.md`, the repository task protocols, this Task Contract and every canonical source it names. Confirm the Issue is open, ready, unowned and the Contract is executable, then claim exactly one Attempt and re-read the state. Execute only the frozen Contract.

The task preserves timeout's original cursor across sustained snapshot activity using finite count/byte/state limits. It does not add completion semantics, automatic write retry, transparent polling, token-capacity expansion, deployment changes or d-session operations.

Use GitHub Actions for required executable evidence. On completion, persist exact Candidate/evidence, post `[EXECUTION REPORT]`, set the Issue to `status:review` with `Active owner: none`, re-read, and stop. Do not Review, accept, merge, deploy, tag or close the Issue.
