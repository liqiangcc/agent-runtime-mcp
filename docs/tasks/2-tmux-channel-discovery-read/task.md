# Task — MVP-001 Tmux channel discovery and bounded read

## Metadata

```text
GitHub Issue: #2
MVP phase: Phase 1
Task kind: combined implementation + verification
Design base commit: 16a8bc898eb69dbd114627995a008bb12a361bdf
Session bootstrap: docs/tasks/2-tmux-channel-discovery-read/prompt.md
Expected executor: web-gpt
Dispatch route: direct-web-gpt
Environment: env:web-gpt
Required capabilities: github-read-write, repository-code-authoring, github-actions-read, linux-tmux-via-actions
Hard publication dependencies: channel-only canonical architecture accepted
```

## Goal

Implement the first executable Channel MCP slice: a TypeScript/Node MCP server with backend-neutral Channel semantics and read-only tmux channel discovery/inspection/bounded output read through:

```text
list_channels
get_channel
read_channel
```

without Worker registry, Task semantics, tmux lifecycle management or terminal input.

## Canonical documents

Read and preserve `AGENTS.md`, `docs/requirements.md`, `docs/channel-architecture.md`, `docs/channel-model.md`, `docs/mcp-contract.md`, `docs/technology-stack.md`, `docs/backends/tmux.md`, `docs/security.md`, `docs/deployment.md`, `docs/mvp-plan.md`, and repository development protocols under `docs/tasks/`.

## Web GPT execution route

This Task is executed directly by Web GPT through GitHub.

Web GPT must:

```text
live-read Issue + Task Contract
→ claim as web-gpt
→ create/reuse Task branch
→ author code/docs through GitHub
→ use GitHub Actions for verification
→ inspect/fix failed jobs
→ post durable EXECUTION REPORT
→ status:review + owner:none
→ perform separate read-back Reviewer phase
```

No Dispatcher, tmux coding session or Codex Worker is required for repository implementation. Real tmux product integration is verified by GitHub Actions on Linux.

## In Scope

1. Initialize TypeScript/Node project and lockfile-backed dependency setup.
2. Use the official MCP TypeScript server SDK line from `docs/technology-stack.md`.
3. Implement backend-neutral Channel types from `docs/channel-model.md`.
4. Implement `ChannelBackend` abstraction for inventory/inspect/read/health.
5. Implement `TmuxBackend` structured discovery using machine-oriented tmux format fields.
6. Derive channel identity from configured tmux server/socket scope plus pane identity without a Worker registry.
7. Implement configurable tmux visibility scope/filtering.
8. Implement `list_channels`.
9. Implement `get_channel`.
10. Implement `read_channel` with finite line/byte limits and explicit truncation.
11. Implement structured errors for missing channel, backend unavailable/failure, invalid args and timeout.
12. Add unit tests, real isolated tmux integration tests and GitHub Actions CI.
13. Document local Phase-1 usage/testing.

## Out of Scope

- `write_text`;
- `send_control`;
- Worker/Agent model or registry;
- external Issue/Task reference in product code;
- create/restart/destroy Worker;
- create/kill/respawn tmux session/window/pane through MCP;
- start/restart Codex;
- create/manage worktree through MCP;
- Task/Issue/Attempt state parsing in product code;
- raw `tmux_command` or `run_shell_command`;
- remote write-capable MCP dogfooding;
- SSH/Docker/PTY backends.

## Architecture invariants

1. Channel is the only product domain identity in this slice.
2. A discovered tmux pane is a Channel regardless of what program runs inside it.
3. No persistent Worker registry exists.
4. No project Task mapping exists in product code.
5. Normal callers use `channel_id`, not raw tmux target construction.
6. tmux calls remain behind `TmuxBackend`.
7. Structured tmux fields are used where available.
8. Reads are finite and explicit about truncation.
9. Terminal contents/activity never produce semantic Agent/Task status.
10. Backend commands use structured executable + argv with shell disabled.
11. No session/pane lifecycle command is exposed through MCP.
12. Normal operation requires no root.

## Verification claims

- **C1 Product boundary:** product source contains Channel semantics only; no Worker/Task registry/model.
- **C2 Discovery:** existing panes in configured tmux scope appear through `list_channels`.
- **C3 Inspection:** `get_channel` returns mechanical metadata/capabilities without semantic interpretation.
- **C4 Bounded read:** `read_channel` returns recent text with finite bounds and correct truncation metadata.
- **C5 Missing channel:** nonexistent/destroyed pane returns stable channel-not-found/unavailable behavior and is not recreated.
- **C6 Backend unavailable:** unavailable tmux yields structured failure without crash/unrelated mutation.
- **C7 Scope isolation:** configured tmux visibility policy is enforced.
- **C8 Safe backend execution:** tmux commands use structured process invocation without untrusted shell interpolation.
- **C9 MCP contract:** server registers `list_channels`, `get_channel`, `read_channel` and no lifecycle/raw-command tools.
- **C10 Web execution separation:** repository implementation uses Web GPT + Actions without introducing repository workflow semantics into Channel MCP product code.

## Verification plan

### J1 — typecheck/unit

Required. Cover Channel model, visibility policy, identity mapping, errors, bounds/truncation and MCP handlers through fakes/mocks.

### J2 — real tmux integration

Required in GitHub Actions Linux. The test harness creates isolated tmux test panes externally, verifies discovery/read/missing-pane behavior, and cleans them up. MCP API itself must expose no lifecycle operations.

### J3 — CI

Required GitHub Actions verification on exact Candidate SHA.

### J4 — static boundary review

Required read-back that product source has no Worker registry, GitHub Task model, session lifecycle MCP tools, raw shell/tmux escape tool or semantic terminal parser.

## Success criteria

ACCEPT only when:

1. project skeleton and MCP SDK setup are committed;
2. Channel/ChannelBackend/TmuxBackend layering exists;
3. `list_channels`, `get_channel`, `read_channel` work;
4. no Worker registry or Task semantics exist in product code;
5. real tmux discovery/bounded read are proven in Actions;
6. missing pane/backend-unavailable behavior is structured and non-creative;
7. tmux visibility scope is enforced;
8. no lifecycle/raw-command public MCP tools exist;
9. typecheck/unit/integration CI passes on exact Candidate;
10. README/developer docs explain how to prepare an external tmux pane and use the read-only slice;
11. `[EXECUTION REPORT]` records exact Candidate/CI evidence/limitations;
12. separate Web GPT Reviewer read-back confirms C1-C10 and SC1-SC11.

## Evidence contract

Report at least:

```text
Attempt
Executor: web-gpt
Base commit
Candidate commit
Branch / PR if any
Node / TypeScript / MCP SDK versions
package manager + lockfile
unit/typecheck commands
real tmux integration job + tmux version
GitHub Actions run/job
Claims C1-C10
configured tmux test scope
known limitations
```

Do not include secret-bearing terminal transcripts or environment dumps.

## Completion

```text
Web GPT claims Issue #2
→ implement on Task branch
→ GitHub Actions verify
→ [EXECUTION REPORT]
→ status:review + owner:none
→ Web GPT re-read Reviewer phase
→ ACCEPT | REVISE | BLOCK | SPLIT
```

Do not implement MVP-002 before Issue #2 Final Acceptance.
