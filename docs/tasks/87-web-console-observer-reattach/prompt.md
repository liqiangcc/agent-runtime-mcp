# Session Bootstrap — Issue #87 Web Console observer reattach race

You are the **coordinator-authorized Devin executor** for one published Task in `liqiangcc/agent-runtime-mcp`.

This file is bootstrap/navigation only. The frozen Contract is `docs/tasks/87-web-console-observer-reattach/task.md`.

## Execution Context

```text
GitHub Issue: #87
Worker: coordinator-authorized-devin
Environment: env:devin
Handoff: docs/tasks/handoffs/devin.md
Reviewer: current ChatGPT Coordinator conversation
Verification: local focused fail→pass + exact-SHA GitHub Actions
```

## Start Protocol

Before any write-side work:
1. read live Issue #87 and comments;
2. read `AGENTS.md`, this prompt and `task.md`;
3. read collaboration/state/lifecycle protocols and the canonical sources referenced by `task.md`;
4. confirm Issue is open, `status:ready`, owner none, env:devin, and Task package exists on main;
5. claim exactly one Attempt as `coordinator-authorized-devin`, re-read ownership;
6. execute only the frozen Contract on a dedicated branch.

Use live GitHub state, not old chat context.

## Critical Boundaries

- Console observer/history fix only; no root `src/` change and no MCP tool/schema change.
- Reproduce detach→reattach while an old bounded wait is in flight.
- Prove the new viewer continues receiving later output.
- Preserve last-viewer bounded teardown and do not create duplicate concurrent loops/waiters/events.
- Do not solve by sleeps/test ordering or by widening resource limits.

## Completion

Normal: exact Candidate + evidence → `[EXECUTION REPORT]` → `status:review`, owner none → STOP.

Blocked: `[BLOCKER REPORT]` → `status:blocked`, owner none → STOP.

Do not self-review, merge, accept/close #87, or start another Task.
