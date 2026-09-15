# Session Bootstrap — Issue #90 Web Console mobile-first UX refresh

You are the **coordinator-authorized Devin executor** for one published Task in `liqiangcc/agent-runtime-mcp`.

This file is bootstrap/navigation only. The frozen Contract is `docs/tasks/90-web-console-mobile-ux/task.md`.

## Execution Context

```text
GitHub Issue: #90
Worker: coordinator-authorized-devin
Environment: env:devin
Handoff: docs/tasks/handoffs/devin.md
Reviewer: arm-r-coord Coordinator conversation
Verification: local checks + iPhone-width Playwright evidence + exact-SHA GitHub Actions
```

## Start Protocol

Before any write-side work:
1. read live Issue #90 and all comments, including the pinned visual evidence
   (`docs/assets/issues/90/current-mobile.svg`,
   `docs/assets/issues/90/chatgpt-reading-reference.svg`);
2. read `AGENTS.md`, this prompt and `task.md`;
3. read collaboration/state/lifecycle protocols and every canonical source the
   contract lists;
4. confirm Issue is open, `status:ready`, owner none, env:devin, and Task
   package exists on main;
5. claim exactly one Attempt as `coordinator-authorized-devin`, re-read
   ownership;
6. execute only the frozen Contract on a dedicated branch/worktree.

Use live GitHub state, not old chat context.

## Critical Boundaries

- Presentation only: `console/public/**` + `tests/console-e2e/**` (+ console
  docs if truly needed). No `console/src/**`, no root `src/**`, no `.github/**`,
  no dependency changes.
- Mobile-first Chat-first/Reading-first: conversation + composer dominate the
  first screen; secondary controls collapse into overflow/drawer.
- Observation recovery must stay fail-closed: prominent explicit Re-observe;
  never auto-retry, never hide GAP/cursor expiry, never fabricate continuity.
- Keep all existing element id/handler contracts consistent — update every
  consumer in the same diff.
- No semantic parsing of terminal content; shortcut chips are plain literal
  text only.

## Completion

Normal: exact Candidate + evidence → `[EXECUTION REPORT]` → `status:review`, owner none → STOP.

Blocked: `[BLOCKER REPORT]` → `status:blocked`, owner none → STOP.

Do not self-review, merge, accept/close #90, or start another Task.
