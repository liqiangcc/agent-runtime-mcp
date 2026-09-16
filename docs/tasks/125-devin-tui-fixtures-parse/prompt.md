# Worker Bootstrap — #125 Devin TUI fixtures + pure parse adapter

You are the coordinator-authorized Devin Worker executing exactly one Attempt
for GitHub Issue **#125** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #125 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/125-devin-tui-fixtures-parse/task.md`.
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-state-convention.md`, `docs/tasks/issue-lifecycle-protocol.md`.
4. Design authority: `docs/web-console-reading-surface-design.md`
   (§3 S4, §5 grammar, §7, §10).
5. Live code (post-02185c2): `console/src/{adapter,projection,history,observer}.ts`,
   `console/test/*`, `tests/fixtures/terminal-recorder.mjs`.

## Execution

- Dedicated branch off `main`; one PR tied to this Issue; do not merge.
- Record real panes with the new tail recorder (e.g. `arm-r-box` or another
  Devin session — ask the pane to run a short multi-tool task; also record a
  plain bash pane). Scrub before committing; keep excerpts minimal.
- Implement pure `parse`/`settleHint` per design §5; no DOM/IO/Node-only APIs.
- Tests replay fixtures through `diffTail` + `HistoryRing` before parsing.
- Forbidden: `src/**`, projection/history/observer semantic changes, UI work,
  agent-type inference, recovering folded content.
- Verify through the console CI job on the exact Candidate SHA; then post
  `[EXECUTION REPORT]` (with fixture provenance + scrub method), set
  `status:review`, release owner, STOP.

## Boundaries

- Parser returns data only — `null` / `unknown` on any uncertainty.
- Fixtures must be real recordings, never hand-authored markers.
- If grammar anchors prove unstable on real panes, report BLOCKED with
  evidence rather than widening the grammar silently.
