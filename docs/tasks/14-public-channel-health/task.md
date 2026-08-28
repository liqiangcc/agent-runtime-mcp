# Task — MVP-002.5 Public Channel health surface

## Metadata

```text
GitHub Issue: #14
Task kind: combined implementation + verification
Planning method: docs/tasks/planning-principles.md
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependency: accepted MVP-001 health implementation re-read; publish sequencing must avoid conflict with active MVP-002 integration
```

> This Task is intentionally `status:draft`.

## Goal

Expose the already-established Channel/backend health capability through the public MCP `health` operation without adding endpoint, application, Task, Worker or remote-ingress semantics.

## Primary Use Case

```text
Actor: MCP client
Trigger: client needs to distinguish service/backend availability from existence of any particular Channel
Preconditions: MCP service process is reachable through its current local/test transport
Main flow: invoke health → query existing backend health abstraction → return bounded mechanical result
Success: caller can distinguish healthy/unhealthy backend mechanically
Failure: bounded structured service/internal failure
Degradation: health may be unknown/unavailable; no inference from pane/application state
Evidence: unit + existing Linux/tmux Actions verification
```

## Separation Points

```text
health != channel existence
health != application/Agent status
health != remote-ingress reachability
health != endpoint lifecycle/recovery
```

A healthy backend does not prove a pane exists. An unhealthy backend does not authorize restart/recovery.

## Single Responsibilities

```text
ChannelBackend.health = backend mechanical health
MCP health tool = expose that accepted health result
TmuxBackend = determine whether configured tmux backend can be queried
upper layer = decide whether/how to recover or alert
remote ingress = separate Phase-3 trust/transport concern
```

## Logic / Control Separation

Product logic reports mechanical health only. Upper layers own polling cadence, alerting, restart/recovery, failover and workflow decisions.

## Success / Failure / Degradation

- success: bounded mechanical health result;
- backend unavailable: report unavailable, do not crash or recreate anything;
- missing panes: backend may still be healthy;
- unknown/internal condition: return structured safe failure/unknown rather than semantic inference.

## Accepted Upstream Surface

MVP-001 already established:

```text
ChannelBackend.health(): Promise<BackendHealth>
BackendHealth:
- backend_kind
- available
- detail?
TmuxBackend.health()
```

This Task must expose that existing abstraction rather than introduce a second health subsystem.

## In Scope

- public MCP `health` registration;
- thin handler/adapter mapping to accepted `ChannelBackend.health()`;
- structured result/error behavior;
- read-only/idempotent/non-destructive annotations;
- tests proving backend health is independent from pane existence;
- README/docs update if needed.

## Out of Scope

- remote HTTP/MCP ingress/auth;
- active probing of arbitrary hosts;
- restarting tmux/processes;
- Worker/Task/Agent health;
- semantic application readiness;
- scheduler/monitoring service;
- new backend lifecycle APIs.

## Claims / Verification

- C1 `health` is publicly registered and maps to accepted `ChannelBackend.health()`.
- C2 result is mechanical backend health only.
- C3 healthy backend does not require any pane to exist.
- C4 backend unavailable is reported without lifecycle mutation.
- C5 no Worker/Task/application/remote-ingress semantics are introduced.
- C6 exact-Candidate typecheck/unit/tmux CI passes.

## Success Criteria

Reviewer may ACCEPT only when C1-C6 have exact Candidate Evidence and the capability remains a thin Channel health surface.

## Publication Rule

Keep draft until the Coordinator chooses a conflict-safe sequence relative to MVP-002. Do not fold this capability into MVP-003 merely for convenience.
