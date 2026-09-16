# Worker Bootstrap — #128 reading surface on real Channel data

You are the coordinator-authorized Devin Worker executing exactly one Attempt
for GitHub Issue **#128** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #128 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/128-console-reading-surface/task.md`.
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-state-convention.md`, `docs/tasks/issue-lifecycle-protocol.md`.
4. Design authority: `docs/web-console-reading-surface-design.md`
   (§3 S5–S6, §4–§6, §8, §10).
5. Visual reference (frozen, do not modify):
   `docs/prototypes/web-console-reading-first/**` — accepted state `6f05885`.
6. Live data path (post-3244abb): `console/src/{projection,adapter,
   devin-adapter,observer,history,http-app}.ts`, `console/public/*`,
   `tests/fixtures/devin-tui/*.jsonl`.

## Execution

- Dedicated branch off `main`; one PR tied to this Issue; do not merge.
- Scope: `console/public/**` reading-surface port bound to real SSE data +
  ONE browser-delivery mechanism for the compiled pure modules (justified) +
  fixture-driven e2e checks. Minimal `http-app.ts` change only if strictly
  required.
- Forbidden: `src/**`; semantic changes to history/observer/projection/
  adapter/devin-adapter (bugs → report); new server-side adapter hints;
  deployments; WebSocket; agent-type inference.
- Settle = `settled && settleHint != 'busy'`; truncated = honest label +
  Terminal View entry; raw stays byte-identical; `screenExtent()` verbatim.
- Verify through console + console-e2e CI on the exact Candidate SHA; attach
  420×912 standalone-sim screenshots with sha256; then `[EXECUTION REPORT]`,
  `status:review`, release owner, STOP.

## Boundaries

- Rendered structure must come from real data: fixtures replayed through
  `HistoryRing → projectConversation → parse → DOM`, never hand-authored mock.
- Any entry dropped or fabricated is a FAIL, not a polish item.
