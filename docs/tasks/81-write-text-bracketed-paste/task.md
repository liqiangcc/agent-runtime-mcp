# Task 81 — write_text must not inject bracketed-paste markers into ordinary terminal text

> Defect fix. Found during post-Goal-#60 deployment dogfood on Box. Coordinator
> directive: fix via branch + PR + exact-SHA CI; no main hotfix.

## Metadata

```text
GitHub Issue: #81
Task ID: 81-write-text-bracketed-paste
Task kind: defect fix + regression
Base commit: abfca5a77c78b449d21150742560c1c4019bcfc9
Worker: coordinator-authorized-devin
Environment: env:devin
Verification Runner: GitHub Actions (exact Candidate SHA)
```

## Defect

`TmuxBackend.writeText()` runs `tmux paste-buffer -p -r -d ...`. `-p` wraps the
paste in bracketed-paste control codes (`ESC[200~` / `ESC[201~`) whenever the pane
application enabled DECSET 2004 (interactive bash/readline does by default). These
bytes are not the caller's text; when the line discipline is mid-escape (e.g. a
pending ESCAPE control) they leak literally — observed as `[200~sleep 60~` →
`bash: [200~sleep: command not found` on a real pane during dogfood.

`write_text` contract is ordinary Unicode terminal text; it must not inject control
bytes of its own.

## Claims / Verification

```text
C1: real-tmux regression — with the pane application having enabled DECSET 2004,
    write_text(submit=false) delivers exactly the text bytes and no ESC[200~ /
    ESC[201~ (no ESC at all). Fails on the base commit; passes after the fix.
C2: semantics preserved — LF stays LF (-r retained), submit adds ENTER only after
    successful transport, Unicode/multiline/TAB/metacharacter byte-exact, stdin
    buffer transport with no caller key grammar, 1 MiB bound, timeout/failure
    paths unchanged. All existing unit/integration/discovery/dogfood tests pass.
C3: public MCP surface unchanged — exactly seven tools.
C4: exact-SHA Actions green on the Candidate.
```

## Out of Scope

- `send_control` semantics unchanged (raw controls).
- No Console changes.
- No behavior change for panes without DECSET 2004 (already byte-exact today).

## Success Criteria

1. C1–C4 PASS on the exact Candidate SHA in Actions.
2. `git diff` limited to `src/tmux-backend.ts`, tests, fixtures, and this task package.
