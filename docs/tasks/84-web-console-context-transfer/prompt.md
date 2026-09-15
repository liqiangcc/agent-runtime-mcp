# Session Bootstrap — Issue #84 Web Console explicit context transfer

You are the **coordinator-authorized Devin executor** for exactly one published Task in `liqiangcc/agent-runtime-mcp`.

This file is bootstrap/navigation only. The frozen Contract is `docs/tasks/84-web-console-context-transfer/task.md`.

## Execution Context

```text
GitHub Issue: #84
Task Contract: docs/tasks/84-web-console-context-transfer/task.md
Worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Reviewer: current ChatGPT Coordinator conversation
Verification Runner: GitHub Actions exact Candidate SHA + local supporting evidence
```

## Start Protocol

Before any write-side work:

1. use live GitHub state to read Issue #84 and relevant comments;
2. read `AGENTS.md`;
3. read `docs/tasks/84-web-console-context-transfer/task.md` in full;
4. read `docs/tasks/collaboration-protocol.md`, `issue-state-convention.md`, `issue-lifecycle-protocol.md`, `planning-principles.md`, and `docs/tasks/handoffs/devin.md`;
5. read the canonical/current sources required by task.md, especially `docs/web-console-requirements.md`, `console/README.md`, `docs/security.md`, and `docs/mcp-contract.md`;
6. confirm Issue #84 is open, `Status: status:ready`, `Active owner: none`, `Environment: env:devin`, and that the task package resolves from latest main;
7. confirm current main contains the accepted #81 fix and no competing Context Transfer implementation/Issue has appeared;
8. re-read immediately before claim;
9. claim exactly one Attempt by setting `Status: status:in-progress` and `Active owner: coordinator-authorized-devin`;
10. re-read ownership, then execute only the frozen Contract.

Use live GitHub state as authority, not prior tmux/chat history.

## Task-specific guardrails

- This is a Console upper-layer feature. Do not modify `src/` or the seven-tool MCP surface.
- Never infer semantic meaning from terminal output and never auto-forward it.
- No mutation before explicit target + preview + confirm.
- Reuse the existing target text/write_text path; no raw tmux/shell transfer path.
- No automatic retry after ambiguous timeout.
- No payload persistence or terminal-content logging.
- Do not combine this Task with agent metadata, role parsing, autonomous multi-agent routing or workflow scheduling.

## Verification

Produce focused unit/integration coverage plus true-browser E2E required by the Contract. Local runs are supporting evidence; read the actual exact-SHA GitHub Actions run/job results before any PASS claim.

## Completion

Normal:

```text
persist exact Candidate/evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ re-read Issue #84
→ STOP
```

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ re-read Issue #84
→ STOP
```

Do not self-review, merge, accept/close #84, start another Attempt, or start another Task. The Coordinator is the next authority.