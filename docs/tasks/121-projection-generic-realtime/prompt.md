# Worker Bootstrap — #121 projection + generic adapter + real-time cadence

You are the coordinator-authorized Devin Worker executing exactly one Attempt
for GitHub Issue **#121** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #121 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/121-projection-generic-realtime/task.md`.
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-state-convention.md`, `docs/tasks/issue-lifecycle-protocol.md`.
4. Design authority: `docs/web-console-reading-surface-design.md`
   (§3 S2–S4, §4, §5, §6, §10).
5. Live code: `console/src/{observer,history,config,mcp-client}.ts`,
   `console/test/*`.

## Execution

- Work on a dedicated branch off `main`; one PR tied to this Issue; do not merge.
- Scope: pure projection + adapter interface + generic adapter +
  `runLoop` busy/quiet `timeout_ms` + `CONSOLE_OBSERVE_BUSY_TIMEOUT_MS` + unit tests.
- Forbidden: `src/**`, `history.ts` semantic changes, `console/public` UI work,
  any `⏺ ❭ │`/Devin knowledge outside the adapter interface, MCP changes.
- Record the `CONSOLE_TAIL_LINES` sub-decision in the Execution Report.
- Verify through the console CI job on the exact Candidate SHA; then post
  `[EXECUTION REPORT]`, set `status:review`, release owner, STOP.

## Boundaries

- `timeout` is never a block boundary; `output_idle` semantics unchanged.
- Ring stays verbatim; raw stays byte-identical.
- If the design doc conflicts with live code, report it — do not silently diverge.
