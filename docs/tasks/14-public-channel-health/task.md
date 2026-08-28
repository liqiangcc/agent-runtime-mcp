# Task — MVP-002.5 Public Channel health surface

## Metadata

```text
GitHub Issue: #14
MVP phase: Phase 2.5
Task kind: combined implementation + verification
Planning method: docs/tasks/planning-principles.md
Accepted upstream main: 1f81527f0687dff535faa27150d70b23dd1af444
Session bootstrap: docs/tasks/14-public-channel-health/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependency: satisfied by MVP-002 Final Acceptance and accepted main read-back
```

## Goal

Expose the already-established Channel/backend health capability through one public MCP `health` operation without adding endpoint, application, Task, Worker, recovery or remote-ingress semantics.

## Primary Use Case

```text
Actor: MCP client
Trigger: caller needs mechanical service/backend health independent of a particular Channel
Preconditions: current MCP transport can reach the local/test service
Main flow: invoke health → call accepted ChannelBackend.health() → return bounded mechanical result
Success: caller receives backend_kind + available + optional detail
Failure: unexpected adapter/internal failure uses the existing structured error path
Degradation: backend may report unavailable; no pane/application status is inferred
Evidence: exact-Candidate unit + real tmux + static-boundary CI
```

## Separation Points

```text
backend/service health
!= channel existence
!= application/Agent readiness
!= remote-ingress reachability
!= alerting/recovery control
```

A healthy backend does not prove a visible pane exists. An unavailable backend does not authorize restart or recovery.

## Single Responsibilities

```text
ChannelBackend.health = backend-neutral mechanical health abstraction
TmuxBackend.health = whether the configured tmux backend can be queried
MCP health adapter = expose the accepted health abstraction only
upper layer = polling cadence, alerting, restart/failover decisions
remote ingress = separate MVP-003 trust/transport concern
```

## Logic / Control Separation

Product logic reports mechanical health only. It does not decide when to poll, whether a failure is important, whether to restart anything, or what application/Task state means.

## Success / Failure / Degradation

### Success

Return the accepted `BackendHealth` mechanically:

```text
backend_kind
available
detail?
```

### Failure / degradation

- configured tmux backend unavailable → `available:false` with bounded mechanical detail;
- zero Channels visible through the configured session allowlist may coexist with backend `available:true`;
- individual missing pane does not make backend health semantic;
- unexpected MCP adapter failure uses the existing structured error convention;
- no condition triggers endpoint lifecycle or recovery.

## Accepted Upstream Interface Alignment

Main `1f81527f0687dff535faa27150d70b23dd1af444` already provides:

```text
src/types.ts
BackendHealth {
  backend_kind
  available
  detail?
}

src/backend.ts
ChannelBackend.health(): Promise<BackendHealth>

src/tmux-backend.ts
TmuxBackend.health()
- probes configured tmux scope mechanically
- returns available true/false
- does not inspect application meaning

src/mcp.ts
accepted public tools:
- list_channels
- get_channel
- read_channel
- write_text
- send_control

accepted adapter convention:
- @modelcontextprotocol/server v2
- Zod v4 where schemas are needed
- JSON text + structuredContent
- existing structured error conversion
```

This Task must **expose, not redesign**, those surfaces.

## In Scope

- thin backend-neutral `health` handler if needed;
- public MCP `health` registration;
- result wrapping consistent with existing handlers/tools;
- read-only + idempotent + non-destructive tool annotations;
- unit test proving public registration/result mapping;
- real tmux test proving backend health is independent from the visible Channel inventory (for example: tmux server exists while allowlist exposes zero panes);
- backend-unavailable regression;
- README/current-tool documentation update;
- exact-Candidate CI evidence.

## Out of Scope

- changing `BackendHealth` semantics unless a blocking defect is proven;
- remote HTTP/MCP ingress/auth;
- network/tunnel reachability health;
- per-pane/application/Worker/Task health;
- active probes of arbitrary hosts;
- polling/monitoring scheduler;
- alerting;
- restarting tmux/processes;
- endpoint/session/process lifecycle;
- raw tmux/shell tools.

## Architecture Invariants

1. `health` maps to the accepted `ChannelBackend.health()` abstraction.
2. Health remains backend/service mechanical state only.
3. Health takes no `channel_id` and does not infer per-Channel state.
4. A backend may be healthy while no Channel is visible to the caller's configured allowlist.
5. Health does not mutate tmux or any endpoint.
6. Health is read-only, idempotent and non-destructive.
7. No remote-ingress/network-reachability meaning is added.
8. No recovery/alerting/workflow control is added.

## Implementation Requirements

### R1 — Thin handler

Use the accepted backend abstraction directly, equivalent to:

```text
health(backend)
→ { health: await backend.health() }
```

Do not duplicate tmux probing in the MCP adapter.

### R2 — Public tool

Add exactly one new public tool:

```text
health
```

Keep all accepted MVP-002 tool behavior unchanged.

`health` has no input fields and uses annotations equivalent to:

```text
readOnlyHint: true
idempotentHint: true
destructiveHint: false
```

### R3 — Mechanical semantics

The public result acknowledges only backend health. It must not add fields such as:

```text
worker_status
task_status
application_ready
pane_count_as_health
needs_restart
```

### R4 — Failure behavior

Preserve existing `TmuxBackend.health()` behavior and existing MCP structured-error conventions. Do not turn backend unavailability into endpoint creation/restart.

## Verification Claims

- **C1 Public surface:** `health` is registered in addition to the accepted five tools and maps to `ChannelBackend.health()`.
- **C2 Mechanical semantics:** result is only accepted `BackendHealth` data; no per-pane/application/Task meaning.
- **C3 Inventory separation:** a queryable tmux backend can report healthy even when the configured allowlist exposes zero Channels.
- **C4 Backend unavailable:** unavailable tmux reports mechanical unavailable without crash/lifecycle mutation.
- **C5 Tool semantics:** `health` is read-only/idempotent/non-destructive and has no `channel_id`/mutation input.
- **C6 Product boundary:** no remote ingress, monitoring scheduler, Worker/Task or lifecycle capability is introduced.
- **C7 Regression:** accepted list/get/read/write/control behavior remains intact.

## Verification Plan

### J1 — Typecheck/unit

Test thin handler, tool registration/annotations/result mapping and existing-tool regression.

### J2 — Real tmux integration

Use externally prepared isolated tmux state. Prove:

- backend available → health available true;
- backend server exists while session allowlist exposes zero Channels → health still available true;
- missing configured tmux server → health available false;
- no lifecycle mutation occurs.

The test harness may create/destroy temporary tmux fixtures; the product API must not.

### J3 — Static boundary

Keep existing lifecycle/raw-command/unsafe-shell guards and ensure the new health path contains no remote/network/Worker/Task/recovery implementation.

### J4 — Exact Candidate

All required CI jobs PASS on the exact Candidate SHA in the Worker report.

## Security Review

Security-sensitive: low incremental authority. `health` is read-only but may reveal bounded backend availability details; details remain mechanical/sanitized and must not expose terminal contents, credentials or arbitrary stderr.

## Success Criteria

Reviewer may ACCEPT only when C1-C7 have exact Candidate Evidence, the tool remains a thin public health surface, and canonical-main integration passes.

## Completion

```text
separate Web GPT Worker claim
→ one Attempt
→ implement only public health surface
→ GitHub Actions Evidence
→ [EXECUTION REPORT] / [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
→ original Coordinator Review
```

Do not implement MVP-003 from this Task.
