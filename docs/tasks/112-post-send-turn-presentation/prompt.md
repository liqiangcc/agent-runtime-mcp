# Worker Bootstrap — #112 post-send turn presentation (prototype)

You are the coordinator-authorized Devin Worker (`arm-r-box`) executing exactly
one Attempt for GitHub Issue **#112** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #112 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/112-post-send-turn-presentation/task.md`.
3. `AGENTS.md` and `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-lifecycle-protocol.md`.
4. Existing prototype: `docs/prototypes/web-console-reading-first/` on branch
   `prototype/90-reading-first` (deployed at Box `:8090`).

## Execution

- Worktree: `/home/box/agent-runtime-mcp-proto112`, branch
  `prototype/112-post-send-presentation` based on `prototype/90-reading-first`
  — do NOT reuse the #90 formal worktree or the live :8090 deploy checkout.
- Prototype-only paths; static/mock data; no `console/public/**`,
  `console/src/**`, `src/**`, MCP, or `/api/*` changes.
- Keep :8090 service and :8080 predeploy untouched; push your branch and
  report exact SHA — the Coordinator will update :8090 to serve the reviewed
  candidate.
- Evidence per the Evidence Contract in task.md; post `[EXECUTION REPORT]`
  with exact SHA on Issue #112; set `status:review`, release owner, STOP.

## Boundaries

- No production implementation; #90 rollout remains gated.
- No auto-retry on ambiguous/failed; IME/draft/caret and at-most-once
  semantics preserved in the mock.
- Raw/generic fallback on parse uncertainty; never drop bytes.
