# Session Bootstrap — Issue #61 Web Console skeleton, auth gate, MCP client adapter and session list

You are the **coordinator-authorized Devin executor** for `liqiangcc/agent-runtime-mcp` Issue #61.

This file is bootstrap/navigation only. The frozen Contract is:

`docs/tasks/61-web-console-skeleton-session-list/task.md`

## Execution Context

```text
GitHub Issue: #61
Parent Goal: Issue #60
Worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Reviewer: Coordinator
Verification Runner: GitHub Actions (exact Candidate SHA)
```

## Start Protocol

1. Read live Issue #61 and all comments, then Issue #60.
2. Read `AGENTS.md`, `docs/tasks/collaboration-protocol.md`, `issue-state-convention.md`, `issue-lifecycle-protocol.md`, `docs/tasks/handoffs/devin.md`.
3. Read `docs/web-console-requirements.md`, `docs/mcp-contract.md`, `docs/security.md`, `docs/deployment.md`, `docs/technology-stack.md`, and `tests/dogfood/public-mcp.dogfood.test.ts` (official client connection pattern to reuse).
4. Confirm Issue #61 is open, `Status: status:ready`, `Active owner: none`, `Environment: env:devin`.
5. Re-read, then claim exactly one Attempt (`status:in-progress`, `Active owner: coordinator-authorized-devin`), re-read to confirm.
6. Execute only the frozen Contract on a dedicated branch; open one PR; read exact-SHA Actions results.

## Key constraints

- Do not modify `src/`, the seven-tool surface, or existing CI guards.
- No tmux command may be executed from `console/` in this Task (the test harness may prepare tmux).
- Loopback-by-default bind; auth mode validation at startup; never log tokens or terminal payloads.

## Completion

Normal: `[EXECUTION REPORT]` → `status:review` → owner none → re-read → STOP.
Blocked: `[BLOCKER REPORT]` → `status:blocked` → owner none → re-read → STOP.

Do not review/accept/close, merge your own PR, or start another Task.
