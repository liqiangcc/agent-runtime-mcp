# Worker Bootstrap — #114 turn-trace collapse (prototype)

You are the coordinator-authorized Devin Worker (`arm-r-box`) executing exactly
one Attempt for GitHub Issue **#114** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #114 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/114-turn-trace-collapse/task.md`.
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-lifecycle-protocol.md`.
4. Current prototype: `docs/prototypes/web-console-reading-first/` on branch
   `prototype/112-post-send-presentation` @ `ebf7093b` (deployed on :8090 — this
   is your before/after baseline).

## Execution

- Worktree: `/home/box/agent-runtime-mcp-proto114`, branch
  `prototype/114-turn-trace-collapse` based on
  `prototype/112-post-send-presentation`.
- Prototype-only paths; static/mock; no `console/**`, `src/**`, MCP, or
  `/api/*` changes.
- Do NOT touch the :8090 deploy checkout or :8080. Push your branch and report
  the exact SHA — the Coordinator updates :8090 after independent review.
- Evidence per task.md Evidence Contract; post `[EXECUTION REPORT]` on #112's
  successor Issue #114 with exact SHA; set `status:review`, release owner,
  STOP.

## Boundaries

- The visual change must be obvious: completed turns collapse the whole
  activity trace into one compact summary row; the final answer dominates.
- Expand/collapse must not rebuild the answer node or lose scroll.
- All frozen semantics preserved; parse uncertainty → raw/generic fallback.
