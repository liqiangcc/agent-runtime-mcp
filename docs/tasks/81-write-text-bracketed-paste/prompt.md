# Session Bootstrap — Issue #81 write_text bracketed-paste marker injection

You are the **coordinator-authorized Devin executor** for
`liqiangcc/agent-runtime-mcp` Issue #81.

The frozen Contract is `docs/tasks/81-write-text-bracketed-paste/task.md`.
The Issue body holds the live state block and reproduction evidence.

## Constraints

- Fix lives in `src/tmux-backend.ts` `writeText()` (drop `-p`, keep `-r -d`).
- Regression must fail on the base commit first, then pass.
- Do not touch `send_control`, the seven-tool surface, or `console/`.
- No main hotfix: branch → PR → exact-SHA Actions → report.
