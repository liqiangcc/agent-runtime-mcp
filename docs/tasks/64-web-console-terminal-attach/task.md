# Task 64 — Web Console Terminal View: direct tmux attach adapter outside the MCP

> **Draft.** Non-claimable until Issue #61 is accepted and the Alignment Gate below is re-read by the Coordinator. This Task carries the highest security weight of the Console MVP.

## Metadata

```text
GitHub Issue: #64
Task ID: 64-web-console-terminal-attach
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal)
Base commit: to be recorded at publication (must contain accepted #61 Candidate)
Candidate commit: n/a
Session bootstrap: docs/tasks/64-web-console-terminal-attach/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution, native-pty-build
Hard dependencies: Issue #61 Final Acceptance
```

Requirement authority: `docs/web-console-requirements.md` (WC-UC4).

## Goal

Provide a full interactive browser terminal for one **existing** pane through a separate
`terminal attach adapter` that speaks to tmux directly (pty + `tmux attach-session -t <target>`
on the configured socket, read-only variant with `-r` for the `read` role), guarded by the
`terminal` role, enforcing the same tmux scope/allowlist as the MCP — and **never** exposing this
capability through the MCP.

## Primary Use Case (WC-UC4)

```text
Actor: human with terminal role
Trigger: needs arbitrary keys (arrow keys, Ctrl-combos, TUI interaction) that write_text/send_control cannot express
Preconditions: #61 Console; pane exists in scope; node-pty (or equivalent) buildable on the host
Main flow:
  1. human opens Terminal View for a Channel; Console resolves channel_id → tmux pane target via get_channel backend_metadata.tmux (never from user-typed target grammar)
  2. adapter spawns tmux attach in a pty sized to the browser terminal; bytes stream both ways over an authenticated WS
  3. resize propagates; detaching closes the pty; leaving the page detaches
Success outcome: interactive session identical to a local tmux attach, confined to the configured socket and allowlist
Failure outcome: pane/session not in allowlist → refused before spawn; tmux missing → explicit error; pty build unavailable → feature disabled with a clear message
Degraded outcome: read role gets read-only attach (-r); no terminal role → view unavailable
Authoritative evidence: Actions integration test typing into a disposable pane via the adapter and observing the effect via read_channel
```

## Separation Points

```text
MCP data path | terminal attach adapter     → attach never goes through, or is exposed by, the MCP
terminal role | read/write roles            → strongest role; separately granted
channel_id resolution | tmux target grammar → target derived from backend_metadata.tmux, never user input
adapter module | rest of console/           → the only module allowed to spawn tmux attach; static guard enforces
```

## Single Responsibilities

```text
console/attach-adapter = spawn/resize/close one pty-attached tmux client per viewer, scope-checked
console/api/terminal   = authz + WS bridging of bytes
console/ui/terminal    = xterm-style renderer, resize events
```

## Logic / Control Separation

Logic: scope check, target resolution, pty lifecycle bound to the WS lifetime, byte bridging.
Control (human/operator): who has the terminal role; whether the feature is enabled (`CONSOLE_TERMINAL_ENABLED`, default off).

## Success / Failure / Degradation

Success proves: raw interactive access exists as a separate, guarded, scope-confined adapter without MCP change.
Hard failure: attach outside allowlist; target built from user strings; pty surviving its WS; feature on without terminal role; any MCP tool exposing attach.
Degradation: feature disabled when pty module unavailable; read-only attach for read role.
Never inferred: application state from the byte stream.

## In Scope

- `CONSOLE_TERMINAL_ENABLED` (default `false`) and `terminal` role;
- attach adapter as one isolated module; static guard exception list updated to exactly that module for `attach-session`;
- pty via `node-pty` (or Node built-in alternative if sufficient) — justify the dependency in the PR;
- read-only `-r` attach for read role when enabled by operator;
- WS with `Origin` check; per-viewer pty; hard cap on concurrent attaches (`CONSOLE_MAX_ATTACH`);
- xterm-style UI with resize;
- tests: scope refusal, target resolution from backend_metadata only, pty closes with WS, concurrent cap, real tmux typing round-trip.

## Out of Scope

- session creation/kill (#65); any MCP change; recording/replay of sessions (Future, security-reviewed); clipboard integration beyond browser defaults.

## Architecture Invariants

- No MCP tool provides attach or raw keys — ever.
- Attach is confined to the configured socket and `TMUX_ALLOWED_SESSIONS`.
- tmux invoked as executable + argv; no shell.
- Feature default-off; strongest role required.

## Claims / Verification

```text
C1: attach to a session outside TMUX_ALLOWED_SESSIONS is refused before any process spawn. (unit with spawn spy)
C2: target is derived only from get_channel backend_metadata.tmux; user-provided target strings are rejected. (unit)
C3: keystrokes typed via the adapter change the pane; read_channel shows the effect. (integration, real tmux)
C4: closing the WS terminates the pty/tmux client within a bounded time; no orphan clients (tmux list-clients). (integration)
C5: CONSOLE_MAX_ATTACH is enforced. (integration)
C6: with CONSOLE_TERMINAL_ENABLED unset the routes return 404/disabled. (unit)
C7: static guard: attach-session appears only in the adapter module; no shell:true. (CI)
C8: MCP discovery still lists exactly seven tools. (existing test:discovery, unchanged)
```

## Security Review

```text
Security-sensitive: yes, highest in the Console MVP (raw input path; T1, T3, T4, T5, T7)
Remote ingress affected: yes — terminal role, feature flag, loopback default, Origin check
```

## Success Criteria

1. SC1: C1–C8 PASS on the exact Candidate SHA in Actions.
2. SC2: no `src/` change; seven-tool surface unchanged.
3. SC3: `console/README.md` documents the flag, role, cap, and that attach bypasses the MCP by design.

## Failure / Blocked Rules

BLOCK if a pty dependency cannot be built on the CI runner and no built-in alternative exists → Coordinator decides. Never weaken scope checks or role requirements to pass.

## Publication Dependency / Alignment Gate

Re-read accepted #61 (roles, adapter, guard layout, UI stack) and update this file before the Publication Gate. Coordinator must explicitly confirm the `node-pty` (or alternative) dependency decision.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; no transcripts or tokens persisted.
