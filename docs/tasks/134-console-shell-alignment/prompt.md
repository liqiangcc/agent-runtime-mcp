# Worker Bootstrap — #134 port accepted prototype app shell into console/public

You are the coordinator-authorized Devin Worker executing exactly one Attempt
for GitHub Issue **#134** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #134 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/134-console-shell-alignment/task.md`.
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-state-convention.md`,
   `docs/tasks/issue-lifecycle-protocol.md`.
4. Design authority: the frozen prototype at
   `docs/prototypes/web-console-reading-first/` (index.html / style.css /
   app.js — shell landmarks: `#drawer`, `.topbar`, `#recovery`,
   `#composer`, `#overflow-menu`) and
   `docs/web-console-reading-surface-design.md` §8–§10.
5. Current production shell: `console/public/{index.html,app.js,style.css,
   viewport.js,reading.js,markdown.js}` post-#128.

## Execution

- Work on branch `task/134-console-shell-alignment` off main `ea2bc71`;
  open a PR; do not commit directly to main.
- Port the prototype shell: minimal topbar (☰ / channel name / status
  light / ⋯), sessions drawer + scrim bound to real `/api/channels`,
  compact recovery strip, single-row composer (+ / textarea / send).
- Relocate — never remove — secondary actions: send-without-Enter, Stop,
  Raw transcript, Copy, bookmarks, adapter select, Terminal link, viewport
  HUD/diagnostics into the + popover or ⋯ overflow. Enumerate each action's
  new home in the report.
- Discoverability: on a fresh load with no channel selected the session
  list must be visible or one obvious tap away (e.g. drawer auto-open).
- Build-version marker: stamp the build (index meta/data attr or generated
  file) and self-heal a stale standalone resume (reload or explicit notice)
  on mismatch.
- Preserve frozen semantics verbatim: at-most-once send, no auto-retry,
  GAP/CURSOR_EXPIRED fail-closed, IME/draft/caret, `--app-vh` asymmetric
  commit, `--kb-inset`, `screenExtent()` floor, adapter = user choice only.
- Evidence: console + console-e2e CI green on the Candidate SHA; e2e
  assertions for SC1–SC6; `v134-*-<sha7>.png` screenshots (420×912
  standalone-sim + 375/390); report the moved-actions inventory.
- Then `[EXECUTION REPORT]`, `status:review`, release owner, STOP.

## Forbidden

- No `src/**` or `console/src` semantic changes (http-app.ts allowlist/
  build-stamp only if strictly required — justify per change).
- No MCP surface, CI workflow, or deployment changes (T4/#132 owns the
  :8080 redeploy; this Task produces code+evidence only).
- No mock/hardcoded session data; no agent-type inference; no changes to
  the conversation-surface semantics delivered in #128.
- Do not touch :8080/:8090/:8091 services.
