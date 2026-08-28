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

> This Task is intentionally **draft**. Stable use cases, separation points and Claims are planned now; concrete implementation interfaces must be reconciled with accepted MVP-001 before Publication Gate.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Allow an upper-layer client to send ordinary terminal text and a small explicit set of terminal controls to one already-existing Channel, while keeping terminal transport logic separate from workflow/lifecycle control and preserving literal-data safety.

## Primary Use Cases

### UC1 — Deliver ordinary text to an existing Channel

```text
Actor: upper-layer MCP client
Trigger: client has selected a visible channel_id and wants to send terminal text
Preconditions: Channel exists, is visible in configured scope, and supports write-text
Main flow: resolve channel → transport text literally → optionally submit with explicit Enter
Success: only the selected terminal receives the intended text bytes/characters
Failure: structured missing/backend/input/timeout error; no lifecycle side effect
Degradation: ambiguous timeout may leave delivery outcome unknown; core does not auto-retry
Evidence: unit + real tmux integration on exact Candidate SHA
```

### UC2 — Send one explicit terminal control

```text
Actor: upper-layer MCP client
Trigger: client intentionally requests ENTER, INTERRUPT or ESCAPE
Preconditions: selected Channel exists and supports control
Main flow: validate closed enum → resolve channel → deliver mapped control to exact endpoint
Success: only selected Channel receives the requested control
Failure: invalid/free-form control rejected before backend; backend/missing errors are structured
Degradation: ambiguous mutation result remains explicit; no semantic guess/retry
Evidence: enum-validation + real tmux integration
```

UC1 and UC2 are one Task because they form one coherent **terminal input capability slice** sharing target resolution, scope and backend transport, while remaining separate public input types.

## Separation Points

### Upper layer | Channel MCP

```text
Upper layer owns:
- why/when to send input
- which application/task meaning the input has
- retry/recovery policy
- endpoint lifecycle

Channel MCP owns:
- mechanical channel resolution
- safe text/control transport
- mechanical result/error only
```

### Text data | terminal control

`write_text` transports ordinary data. `send_control` transports a closed control enum. Neither may absorb the other's grammar.

### Channel logic | TmuxBackend

Channel layer defines operation semantics, targeting and error contract. TmuxBackend only maps those semantics to safe tmux operations.

### Backend invocation | terminal payload

Process execution uses structured executable/argv/stdin/data paths. Caller text must never become shell command construction or free-form tmux command/key grammar.

### Mutation result | retry policy

Core reports what it can prove mechanically. It does not own blind retry/recovery decisions after ambiguous non-idempotent mutations.

## Single Responsibilities

```text
Channel input service = validate channel/input semantics and resolve exact target
TmuxBackend = safely deliver text/control to an already-existing tmux pane
write_text = ordinary terminal data transport only
send_control = closed explicit terminal control only
GitHub Actions = executable verification Evidence only
upper layer = workflow/lifecycle/retry meaning
```

## Logic / Control Separation

Product/data-path logic owns:

- accepted input shape;
- literal text preservation;
- submit ordering;
- control validation/mapping;
- exact channel/scope targeting;
- mechanical errors/timeouts.

Upper-layer control owns:

- deciding when/why to send;
- choosing a Channel for application purposes;
- retry after ambiguous mutation;
- recreating/restarting endpoints;
- interpreting terminal/application response.

A Channel write/control failure must never become permission for the product to create/restart/destroy a pane or process.

## Success / Failure / Degradation

### Success

The selected existing Channel receives exactly the intended text or explicit control with product boundaries intact.

### Hard failure

Examples:

- caller payload reaches shell command construction;
- free-form tmux key grammar becomes public input;
- unrelated/out-of-scope pane receives mutation;
- Enter is sent after failed text delivery;
- missing Channel triggers lifecycle action.

### Safe degradation

- missing Channel → structured not-found/unavailable;
- backend unavailable → structured backend failure;
- ambiguous mutation timeout → outcome explicitly uncertain, no automatic retry;
- unsupported capability → structured unsupported result.

The MCP must not infer application success, task progress or retry safety.

## Required Capabilities

```text
UC1 → literal text transport + target resolution + submit ordering
UC2 → closed control transport + target resolution
Both → scope integrity + structured mutation errors + finite timeout
```

Public tool mapping remains:

```text
literal text transport → write_text
explicit terminal control → send_control
```

The tool mapping follows the use cases; it is not the planning starting point.

## Canonical / Process Sources

Before publication/execution read:

- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/technology-stack.md`
- `docs/mvp-plan.md`
- repository protocols under `docs/tasks/`
- accepted Issue #2 Candidate/Review

## Publication Dependency / Interface-Alignment Gate

Before `status:ready`, Coordinator must re-read accepted MVP-001 and align this draft to the actual accepted:

```text
Channel / ChannelBackend
channel_id resolution
TmuxBackend process runner
visibility/scope policy
structured error model
MCP registration/schema conventions
test/CI layout
```

Concrete class/file/method names are intentionally not frozen while #2 is still in progress.

## In Scope

- ordinary text input to an existing Channel;
- explicit ENTER / INTERRUPT / ESCAPE controls;
- submit semantics;
- same channel resolution/scope as accepted read path;
- safe tmux data/control mapping;
- structured mutation errors/timeouts;
- non-idempotency/ambiguous-timeout documentation;
- unit + real tmux Actions verification;
- usage documentation.

## Out of Scope

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
2. Input targets already-existing Channels only.
3. text != control.
4. caller text is data, never shell/tmux command grammar.
5. control enum is closed.
6. mutation reuses accepted channel identity/scope logic.
7. failure has no endpoint-lifecycle side effect.
8. application semantics stay opaque.
9. no root required.
10. this Task does not expand remote network write exposure before MVP-003.

## Implementation Requirements

Only after MVP-001 alignment, implement the minimum mapping required by the use cases.

### R1 — Literal text path
Use a safe data path appropriate to accepted TmuxBackend; no caller payload interpolation into shell command strings.

Test Unicode, multiline text, quotes, backticks, `$`, `;`, `|`, `&&`, leading/trailing spaces and empty lines as data.

### R2 — Submit ordering

```text
submit=false → text only
submit=true  → successful text delivery → explicit ENTER
```

Failed text delivery must not be followed by Enter.

### R3 — Closed control
Only ENTER / INTERRUPT / ESCAPE reach backend mapping; unknown/free-form values fail validation first.

### R4 — Target/scope integrity
Only the resolved selected Channel may be mutated.

### R5 — Mutation result semantics
Preserve accepted error model and make non-idempotent ambiguous timeout behavior explicit; no blind auto-retry.

## Verification Claims

- C1 Literal text preservation.
- C2 No shell interpolation of caller-controlled payload/target.
- C3 Correct submit ordering and partial-failure behavior.
- C4 Text/control separation and closed control enum.
- C5 Exact target isolation.
- C6 Structured missing/backend/input failure with no lifecycle action.
- C7 Visibility policy preserved for mutations.
- C8 No Worker/Task/lifecycle/raw-command product expansion.
- C9 Non-idempotent/ambiguous-timeout semantics are explicit and no silent auto-retry exists.
- C10 MCP tools follow accepted Channel conventions.

## Verification Plan

### J1 — Unit/typecheck
Cover payload preservation, submit ordering, control validation, scope resolution, errors, no implicit retry/lifecycle behavior and MCP handlers.

### J2 — Real tmux integration
Actions harness may externally prepare isolated panes. Prove literal text, submit behavior, ENTER/INTERRUPT/ESCAPE, target isolation and missing-pane failure without product lifecycle APIs.

### J3 — Static boundary review
Confirm no shell interpolation, raw tmux public command, free-form send-keys, Worker/Task registry, lifecycle public tools or automatic mutation retry loop.

### J4 — Exact Candidate
All required jobs PASS on the Execution Report Candidate SHA.

## Security Review

Security-sensitive: **yes**.

Primary authority boundary is terminal input. Required controls: structured process/data path, text/control separation, exact target/scope validation, finite timeouts, no full payload logs, no lifecycle side effects, no unauthenticated network exposure expansion.

## Success Criteria

Publish only after MVP-001 interface alignment. Reviewer may ACCEPT only when C1–C10 are supported by exact Candidate Evidence, unit/typecheck/real-tmux CI passes, usage docs are updated, and the Channel-only / logic-control separation remains intact.

## Evidence Contract

Record:

```text
Attempt
Worker: web-gpt-worker
Base/Candidate SHA
PR/branch if applicable
Node / TypeScript / MCP SDK versions
unit/typecheck run/jobs
real tmux run/job + tmux version
Claims C1-C10
safe text/control transport mechanism summary
configured tmux test scope
known limitations / ambiguous-timeout notes
```

Do not include secrets or full sensitive terminal payloads.

## Failure / Blocked Rules

BLOCKED while MVP-001 is not finally accepted, accepted interfaces cannot be safely extended without design revision, or required GitHub/Actions evidence capability is unavailable.

Resume when accepted MVP-001 surfaces are available and this draft has been re-aligned/read back.

## Completion Protocol

When eventually published:

```text
Coordinator → ready/env:web-gpt
→ separate Web GPT Worker claim / one Attempt
→ repository changes + Actions Evidence
→ report → review/blocked + owner:none → STOP
→ original Coordinator Review
```

Do not start MVP-003 from this Task.
