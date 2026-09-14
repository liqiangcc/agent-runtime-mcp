# Session Bootstrap — Issue #62 Web Console Chat History (conversation-style view)

You are the **coordinator-authorized Devin executor** for `liqiangcc/agent-runtime-mcp` Issue #62.

This file is bootstrap/navigation only. The frozen Contract is:

`docs/tasks/62-web-console-chat-history/task.md`

## Execution Context

```text
GitHub Issue: #62
Parent Goal: Issue #60
Worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Reviewer: Coordinator
Verification Runner: GitHub Actions (exact Candidate SHA)
Upstream dependencies: #61 and #63 Final Acceptance
```

## Start Protocol

1. Read live Issue #62 and all comments, Issue #60, and the Final Acceptance comments of the upstream dependencies listed above.
2. Read `AGENTS.md`, `docs/tasks/collaboration-protocol.md`, `issue-state-convention.md`, `issue-lifecycle-protocol.md`, `docs/tasks/handoffs/devin.md`.
3. Read `docs/web-console-requirements.md`, `docs/mcp-contract.md`, `docs/security.md`, `docs/deployment.md`, `console/README.md` on canonical `main`, and the Task Contract with every document it references.
4. Confirm Issue #62 is open, `Status: status:ready`, `Active owner: none`, `Environment: env:devin`. If it is still `status:draft`, STOP — the Coordinator has not passed the Publication Gate.
5. Re-read, then claim exactly one Attempt (`status:in-progress`, `Active owner: coordinator-authorized-devin`), re-read to confirm.
6. Execute only the frozen Contract on a dedicated branch; open one PR; read exact-SHA Actions results.

## Key constraints

- Never modify `src/`, the seven-tool MCP surface, or existing CI guards.
- Chat-first: the conversation view is the default page; user turns are only the Console's own sends; never parse terminal output into roles or detect prompts.
- Console-specific guards, the Tailscale bind guard (no Console-side authentication) and no-payload logging from #61 remain in force.

## Completion

Normal: `[EXECUTION REPORT]` → `status:review` → owner none → re-read → STOP.
Blocked: `[BLOCKER REPORT]` → `status:blocked` → owner none → re-read → STOP.

Do not review/accept/close, merge your own PR, or start another Task.
