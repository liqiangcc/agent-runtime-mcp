# MVP Plan

## 1. Strategy

Build the complete generic terminal Channel MCP capability set, then dogfood it from an upper layer.

```text
channel discovery
→ bounded read
→ safe text/control write
→ public backend health
→ upper-layer capability dogfooding
```

Deployment/tunnel/network integration is not a product phase.

## 2. Planning discipline

Every Task is planned use-case-first:

```text
Goal
→ Use Case
→ Success / Failure / Degradation
→ Separation Points
→ Single Responsibilities
→ Logic / Control Separation
→ Required Capabilities
→ Claims / Evidence
→ finally implementation mapping
```

Recurring separation:

```text
upper layer
= endpoint lifecycle + application/workflow meaning + retry/recovery/control

Channel MCP
= six generic MCP communication capabilities

TmuxBackend
= backend-specific terminal mechanics

deployment
= external environment, not product roadmap
```

## 3. Phase 0 — Channel boundary freeze

Accepted architecture Issue #6 establishes the product boundary:

```text
discover / inspect
bounded read
text write
explicit control
health
```

Outside product:

```text
Worker/Task semantics
endpoint lifecycle
workflow control
deployment/network/tunnel/auth topology
```

## 4. Phase 1 — Discovery + bounded read

```text
[MVP-001] Tmux channel discovery and bounded read
Issue #2
```

Status: **accepted and integrated**.

Public tools:

```text
list_channels
get_channel
read_channel
```

## 5. Phase 2 — Safe Channel input

```text
[MVP-002] Safe channel text and control input
Issue #10
```

Status: **accepted and integrated**.

Public additions:

```text
write_text
send_control
```

Key separation:

```text
ordinary text != terminal control
Channel communication != workflow/retry/lifecycle control
Channel semantics != tmux mechanics
```

## 6. Phase 2.5 — Public backend health

```text
[MVP-002.5] Public Channel health surface
Issue #14
```

Status: **accepted and integrated**.

Public addition:

```text
health
```

Separation proof:

```text
backend/service health
!= Channel existence
!= application readiness
!= recovery control
!= deployment reachability
```

The complete accepted product surface is now:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

## 7. Removed phase — remote deployment/tunnel integration

Issue #11 is closed **NOT_PLANNED**.

Reason:

```text
MCP capability
!= deployment mechanism
```

Tunnel/provider/network/auth/workspace integration is external deployment/operator work. It is not required for product acceptance and is not a predecessor of dogfooding.

Historical #11 planning is retained for audit only and has no execution authority.

## 8. Phase 3 — Upper-layer Channel capability dogfooding

```text
[MVP-003] End-to-end Channel capability dogfooding
Issue #12
```

Status: **scenario selected; Publication Gate pending**.

### Frozen use case

```text
external fixture creates disposable tmux pane
foreground application = bash --noprofile --norc

public MCP client = official TypeScript Client + StdioClientTransport
        ↓
agent-runtime-mcp stdio server
        ↓
health / list / get / read / write / control
```

The upper layer sends a deterministic shell marker command, observes it through `read_channel`, starts a long `sleep`, interrupts it through `send_control(INTERRUPT)`, then proves later write/read remains usable. Finally the external fixture destroys the pane and verifies MCP reports the missing endpoint without recreation.

### Separation proof

```text
fixture / upper layer
= endpoint create/destroy
+ shell command meaning
+ call sequencing
+ marker interpretation
+ final success/recovery decision

Channel MCP
= six accepted mechanical capabilities only
```

Local stdio is sufficient. No tunnel/provider/network proof is required.

### Validation-only change rule

Expected Task changes are test/client/CI/documentation infrastructure. If the public-MCP dogfood scenario requires changing product-source behavior, Tool schemas or adding a seventh capability, the Worker must stop and return the finding for Coordinator REVISE/SPLIT rather than silently expanding MVP-003.

### Publication Gate

Before `status:ready`, confirm:

```text
complete six-tool surface accepted
frozen bash scenario recorded
external endpoint lifecycle explicit
official public MCP client path selected
application interpretation belongs to upper layer
negative missing-endpoint path defined
exact-Candidate CI Evidence route defined
product-source change gate explicit
```

## 9. Deferred / separate concerns

Not part of core MVP:

- Worker registry/lifecycle;
- tmux session/pane lifecycle;
- process startup profiles;
- Issue/task correlation storage;
- workspace/worktree management;
- scheduler/automatic assignment;
- semantic Agent/application state parser;
- full terminal recording;
- distributed host management;
- generic shell command API;
- tunnel/provider/network deployment;
- TLS/DNS/firewall/workspace authorization management.

## 10. Task sizing

Tasks follow independently reviewable use cases/responsibilities, not files or individual tmux commands.

A small Task is appropriate when a separation point has an independent reason to change. Issue #14 is the canonical example.

## 11. Publication rule

Before a Task becomes executable:

```text
Goal defined
+ Primary Use Case defined
+ Success / Failure / Degradation defined
+ Separation Points explicit
+ Single Responsibilities explicit
+ Logic / Control Separation explicit
+ capabilities derived
+ task.md / prompt.md committed and read back
+ canonical docs resolve
+ Worker route explicit
+ dependencies satisfied
+ Evidence authority feasible
+ upstream accepted interfaces re-read
+ security implications reviewed
+ Success Criteria frozen
+ Publication Gate PASS
```

The Coordinator then emits only the short Web Worker entry. The Worker claims one Attempt and returns durable Evidence.
