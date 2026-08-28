# Task — MVP-002 Safe channel text and control input

## Metadata

```text
GitHub Issue: #10
MVP phase: Phase 2
Task kind: combined implementation + verification
Planning base commit: ef90ba49929aa64b8552fc4ed7410c02988f10e2
Session bootstrap: docs/tasks/10-safe-channel-text-control/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, node-typescript, linux-tmux-in-actions
Hard publication dependency: Issue #2 MVP-001 accepted and its actual ChannelBackend/channel-id/error/MCP registration surfaces re-read
```

> This Task is intentionally **draft**. The product-level Scope/Claims are planned now, but implementation-specific interface details must be reconciled with accepted MVP-001 before Publication Gate.

## Goal

Add safe write/control transport to existing terminal Channels through:

```text
write_text
send_control
```

while preserving the Channel-only product boundary and ensuring ordinary text is transported as data rather than interpreted as shell syntax or free-form tmux key grammar.

## Canonical / Process Sources

Before publication/execution read:

- `AGENTS.md`
- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/technology-stack.md`
- `docs/mvp-plan.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- accepted Issue #2 implementation, Candidate/PR and Coordinator Review

## Publication dependency / interface-alignment gate

Before this Task may become `status:ready`, Coordinator must re-read the accepted MVP-001 implementation and update this draft if needed so it extends, rather than invents a parallel version of:

```text
Channel
ChannelBackend
channel_id resolution
TmuxBackend process runner
visibility/scope policy
structured error model
MCP tool registration/schema conventions
test/CI layout
```

If MVP-001 changes the canonical product boundary, revise canonical docs first. If it only changes concrete implementation names/layout, align this Task while still draft.

## In Scope

1. Extend the accepted Channel backend/service abstraction with ordinary text write capability.
2. Implement public MCP `write_text` with:
   - `channel_id`;
   - arbitrary Unicode `text`;
   - `submit: boolean`.
3. Transport text through a safe tmux data path that does not shell-interpolate caller text and does not parse text as tmux key grammar.
4. Define `submit=true` as successful text delivery followed by explicit Enter semantics.
5. Implement public MCP `send_control` with a closed MVP enum:

```text
ENTER
INTERRUPT
ESCAPE
```

6. Resolve every mutation through the same accepted channel identity/scope rules as MVP-001.
7. Preserve structured missing-channel/backend/input/timeout failures.
8. Add unit tests and real tmux integration tests executed by GitHub Actions.
9. Document mutation retry/idempotency caveats, especially ambiguous timeouts where blind retry could duplicate input.
10. Update local usage documentation for externally prepared tmux panes.

## Out of Scope

- Worker/Agent model or registry;
- Task/Issue mapping;
- tmux session/window/pane creation, restart, respawn or destruction;
- process/Codex startup;
- worktree management;
- arbitrary shell command execution;
- raw `tmux_command`;
- free-form `send-keys` grammar;
- semantic idle/done/task parsing;
- remote MCP ingress/authentication implementation (MVP-003);
- automatic retry of ambiguous mutation operations;
- macro/key-sequence scripting beyond the explicit control enum.

## Architecture Invariants

1. Channel remains the only product domain identity.
2. `write_text` and `send_control` operate only on already-existing Channels.
3. Caller text is data; it must not become a shell command in the MCP process.
4. Caller text is not interpreted as tmux key names or tmux command syntax.
5. Text input and control input are separate public operations/types.
6. `send_control` accepts only the documented closed enum.
7. A write/control failure never creates/restarts/destroys a pane/session/process.
8. Mutation uses the same configured tmux visibility scope and channel resolution as read operations.
9. A missing/disappeared Channel returns structured failure; it is never recreated.
10. Terminal/application semantics remain opaque to the MCP.
11. No root is required for normal operation.
12. Remote authentication is not implemented in this Task, so network write exposure must not be expanded beyond the currently accepted development/test transport.

## Implementation Requirements

### R1 — Safe text transport

The tmux implementation must transport arbitrary text without embedding it into a shell command string.

Preferred implementation shape should use a literal data path such as tmux buffer/stdin-oriented operations followed by paste into the exact target pane. Exact implementation must be reviewed against the accepted TmuxBackend abstraction.

Tests must include text containing at least:

```text
Unicode
multiple lines
single/double quotes
backticks
$
;
|
&&
leading/trailing spaces
empty line(s)
```

These are payload data, not commands to the MCP process.

### R2 — Submit semantics

`submit=false`:

```text
deliver text only
```

`submit=true`:

```text
deliver text successfully
→ then send explicit ENTER control
```

If text delivery fails, Enter must not be sent as a compensating/partial action.

### R3 — Explicit control enum

Public control input is exactly the accepted MVP set:

```text
ENTER
INTERRUPT
ESCAPE
```

Unknown/free-form values must fail validation and must not reach tmux.

### R4 — Target/scope integrity

Mutation must resolve `channel_id` through the same backend/scope mechanism as discovery/read. Tests must prove another pane outside the selected target is not modified.

### R5 — Error and timeout semantics

At minimum preserve/define stable behavior for:

```text
CHANNEL_NOT_FOUND
CHANNEL_UNAVAILABLE
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
INVALID_ARGUMENT
CAPABILITY_UNSUPPORTED
PERMISSION_DENIED
TIMEOUT
INPUT_FAILED
```

Exact categories must align with the accepted MVP-001 error model before publication.

### R6 — Ambiguous mutation retry semantics

Document that `write_text` and `send_control` are non-idempotent. If a client times out after the backend may have accepted input, the server must not claim the operation definitely failed unless it can prove that fact. Blind automatic retries are forbidden by the core contract.

## Verification Claims

### C1 — Literal text preservation

Multi-line Unicode and shell-looking characters are delivered as terminal text data without MCP-side shell interpretation.

### C2 — No shell interpolation

Static review/tests prove caller-controlled text/channel values are not concatenated into shell command strings for backend execution.

### C3 — Submit ordering

`submit=true` performs text delivery first and Enter only after successful text delivery; `submit=false` does not append Enter.

### C4 — Control separation

`send_control` accepts only ENTER/INTERRUPT/ESCAPE and ordinary `write_text` cannot smuggle arbitrary control grammar through the public control API.

### C5 — Target isolation

Only the resolved selected Channel is affected by a mutation; unrelated panes remain unchanged.

### C6 — Missing/unavailable behavior

Missing pane/backend/input failures return structured errors and never trigger lifecycle actions.

### C7 — Visibility policy

Mutation cannot target a Channel outside the configured backend visibility scope.

### C8 — Product boundary

No Worker/Task/Issue/lifecycle/raw-shell/raw-tmux public capability is introduced.

### C9 — Retry semantics

Documentation and tests where practical make non-idempotency/ambiguous-timeout behavior explicit and prevent silent automatic mutation retries.

### C10 — MCP contract

`write_text` and `send_control` are registered with structured schemas/results consistent with canonical `docs/mcp-contract.md` and accepted MVP-001 conventions.

## Verification Plan

### J1 — Typecheck / unit tests

GitHub Actions must cover:

- text payload preservation through mocked/fake backend boundaries;
- submit ordering and partial-failure behavior;
- control enum validation;
- target/scope resolution;
- error mapping;
- no implicit retry/lifecycle behavior;
- MCP schemas/tool handlers.

### J2 — Real tmux integration

Required on Linux GitHub Actions.

The test harness may externally create isolated tmux panes/sockets for verification. The MCP product API itself must not expose lifecycle operations.

Real integration must prove at least:

- multi-line Unicode and shell-looking text reaches the intended pane literally;
- `submit=false` versus `submit=true` behavior;
- ENTER behavior;
- INTERRUPT affects the selected pane/process as expected;
- ESCAPE is delivered only to the selected pane;
- an unrelated pane is not modified;
- missing pane after external destruction yields structured failure rather than recreation.

Use test-only pane programs/fixtures that make received terminal input observable without requiring product-side semantic parsing.

### J3 — Static boundary review

Check product source for absence of:

```text
shell: true / sh -c interpolation of caller payload
raw tmux command MCP tool
free-form send-keys public input
Worker/Task registry
session/pane lifecycle public tools
automatic mutation retry loop
```

### J4 — CI identity

All required jobs must PASS on the exact Candidate SHA used by the Execution Report.

## Security Review

Security-sensitive: **yes**.

Primary risks:

- shell injection;
- tmux-control injection;
- wrong-target input;
- sensitive terminal interaction;
- unauthenticated future remote write exposure;
- duplicate input after ambiguous timeout.

Required controls:

- structured executable/argv/stdin backend invocation;
- text/control separation;
- closed control enum;
- exact channel/scope resolution;
- finite operation timeouts;
- no full write payload logging by default;
- no lifecycle side effects;
- no network write exposure expansion before MVP-003 authentication work.

## Success Criteria

This Task may be published only after MVP-001 interface alignment is complete.

After execution, Reviewer may ACCEPT only when:

1. `write_text` works against accepted Channel abstraction.
2. `send_control` supports only ENTER/INTERRUPT/ESCAPE.
3. literal Unicode/multiline/metacharacter transport is proven.
4. no caller payload is shell-interpolated.
5. submit ordering/partial failure semantics are correct.
6. target/scope isolation is proven.
7. missing/backend failure behavior is structured and non-creative.
8. no lifecycle/Worker/Task/raw command surface is added.
9. non-idempotent/ambiguous-timeout retry semantics are documented.
10. unit/typecheck/real-tmux CI passes on exact Candidate SHA.
11. usage docs are updated.
12. `[EXECUTION REPORT]` includes Claim results and exact Actions evidence.

## Evidence Contract

Record at least:

```text
Attempt
Worker identity: web-gpt-worker
Base commit
Candidate commit
PR/branch if applicable
Node / TypeScript / MCP SDK versions
unit/typecheck job/run
real tmux integration job/run + tmux version
Claims C1-C10
safe text transport mechanism summary
configured tmux test scope
known limitations / ambiguous-timeout notes
```

Do not include secret-bearing terminal transcripts or full sensitive write payloads.

## Failure / Blocked Rules

### FAIL

Examples:

- caller text reaches a shell command construction path;
- free-form tmux key grammar is accepted;
- unrelated pane receives input;
- `submit=true` sends Enter after failed text delivery;
- missing pane triggers recreation/lifecycle action;
- required integration/CI fails because of implementation behavior.

### BLOCKED

Examples:

- MVP-001 has not reached Final Acceptance;
- accepted MVP-001 interface cannot be safely extended without Contract/canonical revision;
- Web Worker lacks required GitHub write capability;
- required GitHub Actions Linux/tmux Evidence cannot be produced for external reasons.

### Resume condition

MVP-001 accepted interface is available and all required GitHub/Actions capabilities are operational.

## Completion Protocol

When eventually published:

```text
Coordinator publishes to env:web-gpt
→ separate GPT Web Worker claims one Attempt
→ repository implementation + GitHub Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
→ original GPT Web Coordinator reviews
```

Do not start MVP-003 from this Task.
