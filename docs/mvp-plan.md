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

**MVP status: ACCEPTED AND INTEGRATED.**

Accepted canonical main after dogfooding:

```text
88b939d3112e755f37bf57856347bb7b8acaf517
```

Canonical-main CI:

```text
33148103167 SUCCESS
```

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

The complete accepted product surface is:

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

Status: **accepted and integrated**.

Accepted Attempt:

```text
Attempt 2
Candidate: 9482acf7ee1529f52c27d408708430d8a7e4fd4e
PR: #19
Integrated main: 88b939d3112e755f37bf57856347bb7b8acaf517
Exact-Candidate CI: 33147710571 SUCCESS
PR-context CI: 33147799648 SUCCESS
Canonical-main CI: 33148103167 SUCCESS
```

Attempt 1 correctly exposed a real product defect in the public stdio discovery path. That defect was split into Issue #17 instead of being repaired inside the validation Task.

```text
Issue #17
[BUG] Fix tmux pane metadata parsing on public list_channels
Candidate: d30cdec61278258827f21577288ebf03632e6f04
Integrated main: ea47668d6966b60e90c70c29ee70611216876977
```

The accepted fix keeps the strict metadata parser and forces tmux UTF-8 output with global `-u`, so metadata parsing no longer depends on ambient locale inherited by the MCP stdio client.

### Accepted dogfood use case

```text
external fixture creates disposable tmux pane
foreground application = bash --noprofile --norc

public MCP client = official TypeScript Client + StdioClientTransport
        ↓
agent-runtime-mcp stdio server
        ↓
health / list / get / read / write / control
```

Accepted Evidence proves:

```text
exact six public Tools
+ mechanical health
+ existing Channel discovery/inspection
+ bounded read
+ literal write and upper-layer marker observation
+ send_control(INTERRUPT)
+ successful post-control write/read
+ external endpoint destruction
+ mechanical failure after destruction
+ no endpoint recreation by MCP
```

### Final separation proof

```text
upper layer
= endpoint create/destroy
+ application meaning
+ MCP call sequencing
+ observation interpretation
+ retry/recovery policy
+ final success authority

Channel MCP
= six generic mechanical terminal communication capabilities

TmuxBackend
= tmux-specific mechanics

deployment
= external concern
```

Dogfooding required no Task/Worker/application/deployment semantics and added no seventh product Tool.

## 9. MVP outcome

The first Channel MCP MVP is complete when viewed as a capability product:

```text
existing terminal endpoint
        ↓
Channel discovery / inspection
        ↓
bounded observation
        ↓
safe ordinary text input
        ↓
explicit ENTER / INTERRUPT / ESCAPE
        ↓
mechanical backend health
```

It has also been proven through the public MCP protocol rather than only through private backend integration.

The accepted MVP does **not** own:

- deployment/tunnel/provider/network integration;
- Worker registry/lifecycle;
- tmux session/pane lifecycle;
- process startup profiles;
- Issue/task correlation storage;
- workspace/worktree management;
- scheduler/automatic assignment;
- semantic Agent/application state parsing;
- retry/recovery policy;
- application success interpretation;
- generic shell command execution.

No follow-up feature Task is created automatically. Future capabilities require a new use case, separation analysis and Publication Gate.

## 10. Task sizing

Tasks follow independently reviewable use cases/responsibilities, not files or individual tmux commands.

A small Task is appropriate when a separation point has an independent reason to change. Issue #14 and the Issue #12 → #17 blocker split are canonical examples.

## 11. Publication rule

Before a future Task becomes executable:

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
