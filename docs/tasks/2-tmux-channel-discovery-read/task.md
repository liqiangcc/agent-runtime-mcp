# Task — MVP-001 Tmux channel discovery and bounded read

## Metadata

```text
GitHub Issue: #2
MVP phase: Phase 1
Task kind: combined implementation + verification
Design base commit: 87d9c322eaab828e3e4982b71604647146122372
Session bootstrap: docs/tasks/2-tmux-channel-discovery-read/prompt.md
Expected worker: codex
Dispatch route: task-dispatcher bootstrap-native
Environment: env:codex
Required capabilities: github-read-write, repository-code-authoring, node-typescript, automated-test, linux-tmux
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

Read and preserve:

- `AGENTS.md`
- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/technology-stack.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/deployment.md`
- `docs/mvp-plan.md`
- repository collaboration protocols under `docs/tasks/`

## Dispatch requirement

Repository collaboration is separate from product scope. `$task-dispatcher` may prepare an isolated worktree/tmux/Codex execution context for this development Task, but none of that becomes MCP product functionality.

Dispatcher does not claim Issue #2; child Worker claims it.

## In Scope

1. Initialize the TypeScript/Node project and pinned dependency/lockfile setup.
2. Use the frozen official MCP TypeScript server SDK line from `docs/technology-stack.md`.
3. Implement backend-neutral Channel types from `docs/channel-model.md`.
4. Implement `ChannelBackend` abstraction sufficient for inventory/inspect/read/health.
5. Implement `TmuxBackend` structured discovery using machine-oriented tmux format fields.
6. Derive channel identity from configured tmux server/socket scope plus pane identity without a Worker registry.
7. Implement configurable tmux visibility scope/filtering sufficient to avoid querying unintended namespaces.
8. Implement `list_channels`.
9. Implement `get_channel`.
10. Implement `read_channel` with finite line/byte limits and explicit truncation.
11. Implement structured errors for missing channel, backend unavailable/failure, invalid args and timeout.
12. Add unit tests, real isolated tmux integration tests and GitHub Actions CI.
13. Document local Phase-1 development/test usage.

## Out of Scope

- `write_text`;
- `send_control`;
- Worker/Agent model;
- Worker registry;
- external Issue/Task reference;
- create/restart/destroy Worker;
- create/kill/respawn tmux session/window/pane;
- start/restart Codex;
- create/manage worktree;
- Task/Issue/Attempt state parsing;
- raw `tmux_command` or `run_shell_command`;
- remote write-capable MCP dogfooding;
- SSH/Docker/PTY backends.

## Architecture invariants

1. Channel is the only product domain identity in this slice.
2. A discovered tmux pane is a Channel regardless of what program runs inside it.
3. No separate persistent Worker registry exists.
4. No project Task mapping exists in product code.
5. Normal callers use `channel_id`, not raw tmux target construction.
6. tmux calls remain behind `TmuxBackend`.
7. Human-readable tmux prose is not used where structured fields are available.
8. Reads are finite and explicit about truncation.
9. Terminal contents/activity never produce semantic Agent/Task status.
10. Backend commands use structured executable + argv with shell disabled.
11. No session/pane lifecycle command is exposed through MCP.
12. Normal operation requires no root.

## Verification claims

### C1 — Product boundary

Code contains Channel semantics only and no Worker/Task/Issue registry/model in the MCP product path.

### C2 — Discovery

Existing panes in configured tmux scope appear through `list_channels` with structured Channel metadata.

### C3 — Inspection

`get_channel` resolves a discovered channel and returns mechanical metadata/capabilities without semantic interpretation.

### C4 — Bounded read

`read_channel` returns recent terminal text with finite bounds and correct truncation metadata.

### C5 — Missing channel

A destroyed/nonexistent pane yields stable `CHANNEL_NOT_FOUND`/unavailable behavior; the service does not recreate it.

### C6 — Backend unavailable

Unavailable tmux backend yields structured backend failure without server crash or unrelated mutation.

### C7 — Scope isolation

Configured tmux server/socket/session visibility policy is enforced by discovery/operations.

### C8 — Safe backend execution

Tmux commands use structured process invocation without untrusted shell interpolation.

### C9 — MCP contract

The server registers working `list_channels`, `get_channel`, `read_channel` schemas/results and no lifecycle/raw-command tools.

### C10 — Repository collaboration separation

Issue #2 may be executed via project Dispatcher isolation, while code/documentation keep that mechanism outside Channel MCP product semantics.

## Verification plan

### J1 — typecheck/unit

Required. Cover Channel model, visibility policy, identity mapping, errors, bounds/truncation and MCP handlers via fakes/mocks.

### J2 — real tmux integration

Required on Linux. Use an isolated tmux socket/session namespace where practical, create test panes externally in the test harness, verify discovery/read/missing-pane behavior, and clean up test resources.

The integration harness may create tmux sessions for testing; the **MCP product API must not expose lifecycle operations**.

### J3 — CI

Required GitHub Actions Linux verification on exact Candidate SHA.

### J4 — static boundary review

Required check that product source has no Worker registry, GitHub Task model, session lifecycle MCP tools, raw shell/tmux escape tool or semantic terminal parser.

### J5 — Dispatcher evidence

Record repository-development dispatch base/worktree/tmux mapping sufficient to prove Dispatcher prepared the coding environment and Worker performed the Issue claim. This is collaboration evidence, not product behavior.

## Success criteria

Reviewer may ACCEPT only when:

1. project skeleton and official MCP SDK setup are committed;
2. Channel/ChannelBackend/TmuxBackend layering exists;
3. `list_channels`, `get_channel`, `read_channel` work;
4. no Worker registry or Task semantics exist in product code;
5. existing-pane discovery and bounded read are proven on real tmux;
6. missing pane/backend unavailable behavior is structured and non-creative;
7. tmux visibility scope is enforced;
8. no lifecycle/raw-command public MCP tools exist;
9. typecheck/unit/integration/CI pass on exact Candidate;
10. local usage docs explain how to prepare an external tmux pane and read it through the MCP slice;
11. Execution Report includes exact evidence and known limitations;
12. repository Dispatcher/Worker boundary is exercised without becoming product scope.

## Evidence contract

Report at least:

```text
Attempt
Worker identity
Base commit
Candidate commit
PR if any
Node / TypeScript / MCP SDK versions
package manager + lockfile
unit/typecheck commands
real tmux integration command + tmux version
GitHub Actions run/job
Claims C1-C10
configured tmux test scope
known limitations
repository Dispatcher evidence reference
```

Do not include secret-bearing terminal transcripts or environment dumps.

## Completion

Follow repository lifecycle exactly:

```text
Dispatcher prepares development environment
→ Worker claims Issue #2
→ Attempt 1
→ implement/verify
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
→ Reviewer next
```

Worker must not implement MVP-002, Review itself or close Issue #2.
