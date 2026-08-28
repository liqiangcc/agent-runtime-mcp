# Task — MVP-002 Safe channel text and control input

## Metadata

```text
GitHub Issue: #10
MVP phase: Phase 2
Task kind: combined implementation + verification
Planning method: docs/tasks/planning-principles.md
Accepted upstream Candidate: c90e0b5165a4c6046b8e63f6e8a1afe271d1fb98
Accepted upstream main: 5a866882081493c3dcace12c1db3b6236afa738c
Session bootstrap: docs/tasks/10-safe-channel-text-control/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, node-typescript, linux-tmux-in-actions
Hard publication dependency: satisfied by Issue #2 Final Acceptance + accepted-interface read-back
```

## Goal

Allow an upper-layer client to send bounded ordinary terminal text and a small explicit set of terminal controls to one already-existing Channel, while keeping communication logic separate from workflow/lifecycle control and preventing the text API from becoming an alternate control-command channel.

## Primary Use Cases

### UC1 — Deliver ordinary text to an existing Channel

```text
Actor: upper-layer MCP client
Trigger: client has selected a visible channel_id and wants to send terminal text
Preconditions: Channel exists in configured scope and advertises write-text
Main flow: validate ordinary text → resolve exact Channel → deliver text literally → optionally append explicit ENTER
Success: the backend transport completed for only the selected Channel
Failure: structured invalid/missing/backend/timeout error; no lifecycle side effect
Degradation: mutation timeout may have unknown delivery outcome; core does not auto-retry
Evidence: unit + real tmux integration on exact Candidate SHA
```

### UC2 — Send one explicit terminal control

```text
Actor: upper-layer MCP client
Trigger: client intentionally requests ENTER, INTERRUPT or ESCAPE
Preconditions: Channel exists in configured scope and advertises control
Main flow: validate closed enum → resolve exact Channel → deliver fixed backend mapping
Success: only the selected Channel receives the requested control
Failure: invalid/free-form control rejected before backend; backend/missing errors are structured
Degradation: ambiguous timeout remains explicit; no semantic guess/retry
Evidence: enum-validation + real tmux integration
```

UC1 and UC2 are one Task because they form one coherent **terminal-input capability slice** sharing exact target resolution, scope, mutation error semantics and tmux transport, while remaining separate public input types.

## Separation Points

### Upper layer | Channel MCP

```text
Upper layer owns:
- why/when to send input
- application/Task meaning
- retry/recovery policy
- endpoint lifecycle
- interpretation of terminal response

Channel MCP owns:
- input validation
- mechanical Channel resolution
- safe text/control transport
- mechanical result/error only
```

### Ordinary text | explicit terminal control

`write_text` is bounded ordinary text data. `send_control` is a closed enum.

To make this separation real rather than nominal:

- LF (`\n`) and TAB (`\t`) are allowed in ordinary text;
- all other Unicode `Cc` control characters are rejected by `write_text` before mutation;
- ESC and interrupt therefore cannot be smuggled through the text API;
- `submit=false` means **no additional ENTER is appended by the MCP**, not that the foreground application will ignore embedded LF;
- `submit=true` adds one explicit ENTER only after text transport succeeds mechanically.

### Channel semantics | TmuxBackend mechanics

Channel-layer semantics define text/control operations, capability advertisement and result/error meaning.

`TmuxBackend` only maps those operations to tmux while reusing the accepted channel-id/scope path.

### Backend transport | caller payload

Caller text must travel through a literal data path and never become shell command construction or caller-controlled tmux command/key grammar.

### Mutation result | retry policy

The core reports what it can prove mechanically. It does not own blind retry after a non-idempotent ambiguous timeout.

## Single Responsibilities

```text
ChannelBackend = backend-neutral Channel operations
TmuxBackend = tmux mapping for an already-existing pane
write_text = ordinary bounded text transport only
send_control = reviewed explicit terminal controls only
MCP adapter = schema/annotation/result mapping only
GitHub Actions = executable verification Evidence only
upper layer = workflow/lifecycle/retry/application meaning
```

## Logic / Control Separation

Product/data-path logic owns:

- ordinary-text validation and UTF-8 byte bound;
- literal data delivery;
- submit ordering;
- control enum validation/mapping;
- exact channel/scope targeting;
- mechanical errors/timeouts.

Upper-layer control owns:

- deciding when/why to send;
- deciding which Channel represents an application concern;
- retry after ambiguous mutation;
- recreating/restarting endpoints;
- deciding what terminal output means or what happens next.

A write/control failure never grants permission to create/restart/destroy a pane/session/process.

## Success / Failure / Degradation

### Success

A successful mutation result means the requested backend transport operation completed for the selected Channel. It does **not** prove that the foreground application accepted, executed, or understood the input.

### Hard failure

Examples:

- caller payload reaches shell command construction;
- non-LF/TAB `Cc` control reaches `write_text` backend mutation;
- free-form tmux key grammar becomes public input;
- an unrelated/out-of-scope pane receives mutation;
- `submit=true` sends ENTER after failed text transport;
- missing Channel triggers lifecycle action;
- concurrent writes can overwrite/mix each other's payload transport state.

### Safe degradation

- invalid text/control → `INVALID_ARGUMENT` before mutation;
- missing Channel → `CHANNEL_NOT_FOUND`;
- backend unavailable → `BACKEND_UNAVAILABLE`;
- unsupported operation → `CAPABILITY_UNSUPPORTED` where applicable;
- ambiguous mutation timeout → `TIMEOUT` with mechanically honest unknown outcome and no automatic retry.

The MCP must not infer application success, Task progress or retry safety.

## Accepted MVP-001 Interface Alignment

Publication alignment is complete against accepted main `5a866882081493c3dcace12c1db3b6236afa738c`.

The implementation must **extend, not parallel**, these accepted surfaces:

```text
src/types.ts
- BackendKind = 'tmux'
- ChannelCapability already includes 'read' | 'write-text' | 'control'
- Channel / ChannelRead / BackendHealth are established domain types

src/backend.ts
- ChannelBackend currently owns listChannels/getChannel/readChannel/health
- add backend-neutral mutation operations to this same interface

src/tmux-backend.ts
- TmuxBackend owns scope fingerprint, channel_id parsing, visibility allowlist and tmux runner
- normal mutation targeting must reuse this accepted resolution/scope path
- NodeCommandRunner currently uses execFile with shell:false

src/errors.ts
- accepted ChannelErrorCode set is:
  CHANNEL_NOT_FOUND
  CHANNEL_UNAVAILABLE
  BACKEND_UNAVAILABLE
  BACKEND_OPERATION_FAILED
  INVALID_ARGUMENT
  CAPABILITY_UNSUPPORTED
  PERMISSION_DENIED
  TIMEOUT
  AUTHENTICATION_REQUIRED
- do not invent a parallel generic INPUT_FAILED code unless canonical error review becomes necessary

src/mcp.ts
- uses @modelcontextprotocol/server v2 + zod/v4
- tool results expose both text JSON and structuredContent
- errors use the accepted structured error conversion

tests/ + .github/workflows/ci.yml
- existing unit + real tmux integration + static-boundary jobs are the verification base
```

The Worker may refactor private helpers to avoid duplication, but public/product semantics above must remain intact.

## Required Capability Mapping

```text
UC1 → ChannelBackend.writeText-equivalent operation
UC2 → ChannelBackend.sendControl-equivalent operation
Tmux Channel after implementation → capabilities include read + write-text + control
MCP → register write_text + send_control in addition to existing Phase-1 tools
```

Equivalent internal type names are allowed; the behavioral contract is frozen.

Minimal successful result semantics:

```text
write_text result:
- channel_id
- submitted: boolean

send_control result:
- channel_id
- control: ENTER | INTERRUPT | ESCAPE
```

These fields acknowledge mechanical transport only; do not add application-success semantics.

## In Scope

- backend-neutral write/control operations on existing Channels;
- `write_text(channel_id, text, submit)`;
- `send_control(channel_id, control)`;
- finite UTF-8 text input bound;
- ordinary-text/control-code validation;
- capability advertisement update;
- safe tmux data/control mapping;
- exact accepted channel-id/scope reuse;
- structured mutation errors/timeouts;
- mutation ambiguity/no-auto-retry semantics;
- concurrent write transport isolation;
- unit + real tmux Actions verification;
- README/local usage documentation.

## Out of Scope

- public `health` tool registration in this Task;
- Worker/Agent/Task/Issue semantics;
- endpoint/session/process creation/restart/destroy;
- worktree/process/Codex lifecycle;
- remote ingress/auth implementation (MVP-003);
- raw tmux/shell command API;
- free-form key grammar/macros;
- semantic application parsing;
- automatic mutation retries.

## Architecture Invariants

1. Channel remains the only product identity.
2. Mutation targets already-existing Channels only.
3. Ordinary text and explicit control remain different input types.
4. Non-LF/TAB Unicode `Cc` controls are rejected from `write_text`.
5. Caller payload is never shell command construction or caller-controlled tmux grammar.
6. Control enum is exactly ENTER / INTERRUPT / ESCAPE.
7. Mutation reuses accepted channel-id/scope/visibility logic.
8. Failure has no endpoint-lifecycle side effect.
9. Concurrent write transport state cannot cross-contaminate callers.
10. Application semantics stay opaque.
11. No root is required.
12. This Task does not expand remote network write exposure before MVP-003.

## Implementation Requirements

### R1 — Backend-neutral extension

Extend the accepted `ChannelBackend` abstraction with mutation operations equivalent to:

```text
writeText(channelId, text, { submit })
sendControl(channelId, control)
```

Do not introduce a second mutation service that bypasses Channel resolution/scope.

### R2 — Bounded ordinary text

`write_text.text`:

- must be a string;
- may contain Unicode, LF and TAB;
- must reject every other Unicode `Cc` control character before backend mutation;
- must have a hard UTF-8 maximum of **1 MiB** per call;
- byte-bound validation occurs before any tmux mutation.

An empty string is allowed as ordinary data; callers should prefer `send_control(ENTER)` when the intent is only Enter.

Tests include:

```text
Unicode
multiple lines
TAB
single/double quotes
backticks
$
;
|
&&
leading/trailing spaces
empty line(s)
rejected NUL / CR / Ctrl-C / ESC
1 MiB boundary + oversize rejection
```

### R3 — Safe tmux literal-data path

Use a tmux mechanism that keeps payload out of shell interpolation and caller-controlled tmux grammar.

For the accepted tmux backend, the expected design is an operation-unique named paste buffer loaded from stdin/data and pasted into the exact pane. The implementation must:

- extend the process runner as needed to provide literal stdin/data while keeping `shell:false`;
- use an operation-unique buffer name or an equivalently isolated mechanism;
- preserve LF as caller text rather than silently converting it into an MCP-added Enter;
- use bracketed-paste behavior when supported by the foreground application/tmux path without making application behavior a product guarantee;
- delete temporary buffer state after successful paste and perform best-effort cleanup after failure without masking the primary result.

An alternative backend mechanism is allowed only if it proves the same 1 MiB bound, literal-data semantics, concurrency isolation and no caller-controlled key grammar.

### R4 — Submit ordering

```text
submit=false
→ deliver text only

submit=true
→ deliver text successfully
→ invoke the same internal ENTER control mapping used by send_control
```

If text delivery fails, ENTER must not be sent.

### R5 — Closed control mapping

Public enum is exactly:

```text
ENTER
INTERRUPT
ESCAPE
```

Tmux mapping is fixed implementation data, equivalent to:

```text
ENTER     → Enter
INTERRUPT → C-c
ESCAPE    → Escape
```

Caller-supplied key names/arrays/macros never reach tmux.

### R6 — Target/scope integrity and capabilities

Mutation resolves `channel_id` through the accepted `TmuxBackend` scope fingerprint/visibility path.

Do not accept raw pane ids from normal MCP callers.

After mutation support is implemented, discovered tmux Channels advertise:

```text
read
write-text
control
```

### R7 — Mutation errors and ambiguity

Reuse the accepted `ChannelErrorCode` model.

- validation errors fail before mutation;
- vanished/foreign-scope Channel stays `CHANNEL_NOT_FOUND`;
- backend absence stays `BACKEND_UNAVAILABLE`;
- non-specific tmux mutation failure stays `BACKEND_OPERATION_FAILED` unless an existing more specific code applies;
- mutation timeout stays `TIMEOUT`.

When a timeout occurs after delivery may have begun, error details/documentation must make the outcome mechanically uncertain rather than claiming definite non-delivery.

No automatic mutation retry loop is allowed.

### R8 — MCP adapter

Keep existing `list_channels`, `get_channel`, `read_channel` behavior unchanged.

Add only:

```text
write_text
send_control
```

Use the accepted Zod v4 / structuredContent / structured-error conventions.

Mutation tool annotations must communicate that they are not read-only and not idempotent. Because terminal input may cause arbitrary application effects, mark the mutation surface conservatively as potentially destructive.

Do not opportunistically add raw/lifecycle tools or the separate public `health` tool in this Task.

## Verification Claims

- **C1 Literal text preservation:** allowed Unicode/LF/TAB/metacharacter payload is transported without MCP-side shell/key interpretation.
- **C2 Text/control separation:** NUL/CR/Ctrl-C/ESC and other non-LF/TAB `Cc` controls are rejected from `write_text` before mutation.
- **C3 Input bound:** 1 MiB UTF-8 limit is enforced before backend mutation.
- **C4 Submit ordering:** `submit=true` adds ENTER only after successful text delivery; `submit=false` adds none.
- **C5 Closed control:** only ENTER/INTERRUPT/ESCAPE are accepted and mapped through fixed backend constants.
- **C6 Target/scope isolation:** only the selected visible Channel is mutated; raw/foreign/out-of-scope ids cannot bypass accepted resolution.
- **C7 Concurrent-write isolation:** parallel writes cannot overwrite/mix temporary payload state or target another Channel.
- **C8 Structured failure:** missing/backend/timeout/invalid failures use accepted error semantics and never trigger lifecycle behavior.
- **C9 Mutation ambiguity:** timeout/retry semantics are explicit; no blind automatic retry exists.
- **C10 Capability/MCP contract:** tmux Channels advertise read/write-text/control and exactly the two Phase-2 mutation tools are added to the accepted Phase-1 surface.
- **C11 Product boundary:** no Worker/Task/lifecycle/raw-shell/raw-tmux/application-semantic capability is introduced.

## Verification Plan

### J1 — Unit/typecheck

Extend existing unit suites to cover:

- backend-neutral mutation handlers;
- Zod/control validation;
- Unicode/control-character validation;
- UTF-8 byte bound;
- submit ordering and partial failure;
- fixed control mapping;
- accepted channel-id/scope reuse;
- error mapping/ambiguous timeout details;
- capability advertisement;
- no implicit retry/lifecycle behavior;
- mutation tool annotations/results.

### J2 — Real tmux integration

Required on Linux GitHub Actions using externally prepared isolated tmux test panes.

Use a test-only interactive fixture that makes received terminal input observable without relying on shell/application semantic parsing.

Prove at least:

- Unicode/multiline/TAB/metacharacter ordinary text reaches only the selected pane;
- `submit=false` versus `submit=true` transport difference;
- ENTER / INTERRUPT / ESCAPE mapping;
- non-LF/TAB control characters are rejected before pane mutation;
- unrelated visible pane is unchanged;
- hidden/out-of-scope pane is not targetable;
- external pane destruction produces `CHANNEL_NOT_FOUND` rather than recreation;
- two concurrent writes remain payload/target isolated;
- temporary transport resources do not accumulate after normal success.

### J3 — Static boundary review

Check product source for absence of:

```text
shell:true / sh -c caller interpolation
raw tmux command MCP tool
free-form send-keys public grammar
Worker/Task registry
session/pane/process lifecycle public tools
automatic mutation retry loop
```

Also confirm `write_text` has ordinary-control rejection and finite byte validation before backend mutation.

### J4 — CI identity

All required jobs must PASS on the exact Candidate SHA used by the Execution Report.

## Security Review

Security-sensitive: **yes**.

Primary authority is terminal input. Required controls come from updated `docs/security.md`:

- structured process + literal data path;
- ordinary-text/control separation;
- finite write size;
- exact target/scope validation;
- per-operation data isolation;
- finite timeouts;
- no full payload logging;
- explicit non-idempotent timeout ambiguity;
- no lifecycle side effects;
- no remote network write exposure expansion before MVP-003.

## Success Criteria

Reviewer may ACCEPT only when:

1. accepted `ChannelBackend` is extended rather than bypassed;
2. `write_text` and `send_control` work against existing Channels;
3. ordinary-text/control-code separation is enforced;
4. 1 MiB write bound is enforced before mutation;
5. safe literal tmux transport is proven without shell interpolation or caller key grammar;
6. submit ordering and fixed control mapping are correct;
7. target/scope and concurrent-write isolation are proven;
8. accepted structured error model is preserved and timeout ambiguity is honest;
9. tmux Channel capabilities become read/write-text/control;
10. existing read tools remain compatible and exactly the two planned mutation tools are added;
11. no lifecycle/Worker/Task/raw command/application-semantic surface is added;
12. typecheck/unit/real-tmux/static-boundary CI passes on exact Candidate SHA;
13. README/local usage and mutation retry limitations are documented;
14. `[EXECUTION REPORT]` records C1–C11 and exact Evidence.

## Evidence Contract

Record at least:

```text
Attempt
Worker: web-gpt-worker
Base commit
Candidate commit
PR/branch if applicable
Node / TypeScript / MCP SDK versions
unit/typecheck run/jobs
real tmux run/job + tmux version
Claims C1-C11
safe text transport mechanism
control-character policy
write byte bound
concurrent-write isolation evidence
configured tmux test scope
known limitations / ambiguous-timeout notes
```

Do not persist secrets or full sensitive terminal payloads.

## Failure / Blocked Rules

### FAIL

Examples:

- caller text reaches shell command construction;
- rejected control character reaches backend mutation;
- caller-controlled key grammar reaches tmux;
- unrelated/out-of-scope pane receives input;
- concurrent write payloads can mix;
- ENTER is sent after failed text delivery;
- missing Channel triggers endpoint lifecycle action;
- required CI fails due implementation behavior.

### BLOCKED

Examples:

- accepted MVP-001 surface cannot be safely extended without a canonical Contract revision;
- required GitHub write capability is unavailable;
- required Linux/tmux Actions Evidence cannot be produced for external reasons.

### Resume condition

The accepted main interface remains available and required GitHub/Actions capabilities are operational.

## Completion Protocol

```text
Coordinator publishes to env:web-gpt
→ separate GPT Web Worker claims exactly one Attempt
→ repository implementation + GitHub Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ original GPT Web Coordinator reviews
```

Do not start MVP-003 from this Task.
