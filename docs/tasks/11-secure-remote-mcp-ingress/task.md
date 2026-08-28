# Task — MVP-003 Secure remote MCP ingress and client compatibility

## Metadata

```text
GitHub Issue: #11
MVP phase: Phase 3
Task kind: combined implementation + verification
Planning method: docs/tasks/planning-principles.md
Session bootstrap: docs/tasks/11-secure-remote-mcp-ingress/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependencies:
- MVP-002 Final Acceptance
- Issue #14 Public Channel health Final Acceptance
- live remote MCP transport/auth/client verification
- explicit secure deployment topology + credential boundary
```

> This Task remains intentionally **draft**. Stable use cases, separation points and evidence authority are planned now. Provider/transport/auth/client mechanics are frozen only at the live Publication Gate.

## Goal

Allow an authorized remote MCP client to use the complete accepted Channel MCP surface across a network trust boundary while keeping:

```text
network reachability
!= authorization

remote transport/auth
!= Channel communication logic

MCP connection lifecycle
!= Channel/tmux lifecycle

infrastructure provisioning
!= product capability
```

## Primary Use Cases

### UC1 — Authorized remote Channel operation

```text
Actor: supported remote MCP client
Trigger: client wants to invoke an accepted Channel operation remotely
Preconditions:
- endpoint is reachable through the selected secure topology
- accepted Channel surface is already implemented locally
- caller presents valid authority
Main flow:
network reachability
→ authenticate
→ authorize protected MCP access
→ transport request
→ invoke unchanged Channel operation
→ return structured result/error
Success:
- authorized client can invoke the accepted Channel surface remotely
- result semantics match the local Channel contract
Failure:
- invalid/missing authority is rejected before protected Channel authority is exercised
Degradation:
- ingress may be unavailable while local Channel logic/backend remain independently valid
Evidence:
- automated ingress/auth tests
- real intended-client invocation
```

### UC2 — Reject unauthorized terminal authority

```text
Actor: unauthenticated or unauthorized network caller
Trigger: caller reaches or probes the endpoint
Precondition: network reachability may exist
Main flow: auth boundary evaluates request before protected Channel operation
Success: caller cannot obtain protected Channel discovery/read/write/control authority
Failure: any unauthorized protected terminal access succeeds
Degradation: rejection may reveal only bounded non-sensitive diagnostics
Evidence: negative auth/transport tests
```

### UC3 — Disconnect and reconnect without owning Channel lifecycle

```text
Actor: authorized remote MCP client
Trigger: remote MCP request/connection/session ends and a later connection is established
Preconditions: tmux pane may continue independently
Main flow:
connection ends
→ Channel/tmux endpoint remains externally owned
→ later authorized connection
→ rediscover current Channels
Success: remote reconnect does not create/restart/preserve a synthetic Worker/session identity
Failure: ingress treats disconnect as permission to mutate endpoint lifecycle
Degradation: disappeared panes are simply absent / CHANNEL_NOT_FOUND on later operation
Evidence: integration test or documented real-client sequence
```

### UC4 — Preserve Channel visibility and authority scope remotely

```text
Actor: authorized remote client
Trigger: caller invokes discovery/read/write/control
Preconditions: backend already has configured tmux visibility scope
Main flow: ingress authorizes request → unchanged Channel service applies existing scope
Success: remote path cannot widen tmux socket/session/account visibility
Failure: remote auth/transport introduces a bypass around Channel scope
Evidence: remote integration + scope-isolation regression
```

### UC5 — Prove intended-client compatibility without distorting product semantics

```text
Actor: Coordinator / integration verifier
Trigger: complete accepted Channel surface is exposed through chosen remote transport
Success: intended client can discover and invoke required read/write/control/health operations as designed
Failure: server integration bug breaks an otherwise supported client path
Degradation/BLOCKED: client/platform lacks a required capability; product contract is not weakened to compensate
Evidence: dated live-client compatibility record tied to Candidate and deployment configuration
```

These use cases remain one Task because they define one coherent **remote trust/transport boundary** around an already-complete Channel service. Channel capabilities themselves are not implemented here.

## Separation Points

### Network reachability | authorization

```text
reachable
!= authenticated
!= authorized
```

A URL, IP route, tunnel path or private-network membership is not automatically terminal authority unless the selected topology explicitly makes it part of the reviewed trust decision.

### Authentication | authorization

Authentication establishes credential identity/validity. Authorization decides whether that caller may use protected Channel operations.

One component may implement both, but the responsibilities and failure meanings remain distinct.

### Remote ingress | Channel logic

```text
Remote ingress owns:
- supported MCP network transport/session handling
- auth enforcement
- request/body/session bounds
- transport timeouts
- required Host/Origin/resource protections
- ingress diagnostics

Channel service owns:
- list/get/read/write/control/health semantics
- channel_id meaning
- Channel errors/capabilities
- configured backend visibility
```

Remote transport wraps the accepted Channel service. It must not fork or duplicate Channel semantics.

### MCP connection/session | Channel/tmux lifetime

```text
MCP request/connection/session lifetime
!= Channel lifetime
!= tmux pane lifetime
```

Disconnect/reconnect is a transport event only. It must not create, restart or destroy endpoints.

### Deployment provisioning | product

Tunnel/provider accounts, DNS, certificates, host bootstrap, package installation, firewall setup and OS service management are operator/environment concerns.

The Task may document the selected deployment prerequisites; it must not expose them as Channel MCP tools.

### Client compatibility | product contract

Compatibility Evidence answers whether a particular intended client can use the frozen contract. A client limitation does not authorize:

- weakening auth;
- changing text/control semantics;
- adding Worker/Task/lifecycle concepts;
- inventing client-specific product semantics.

### Failure layer | recovery control

Ingress/auth, Channel, backend and application failures remain attributable to different layers. None automatically implies endpoint recovery.

## Single Responsibilities

```text
network/tunnel layer
= make the endpoint reachable according to operator policy

auth boundary
= authenticate/authorize protected MCP access

remote MCP ingress
= protocol/session/request transport and ingress-specific bounds/errors

Channel service
= unchanged accepted Channel semantics

TmuxBackend
= local tmux mechanics and configured Channel scope

operator/deployment
= provision infrastructure and credentials

upper-layer consumer
= decide application/workflow meaning and recovery

client compatibility verification
= prove real integration; never redefine the product

GitHub Actions
= automated verification Evidence
```

## Logic / Control Separation

### Product logic

Owns:

- mapping an authorized remote MCP request into the same accepted Channel operation;
- auth enforcement at the selected trust boundary;
- protocol/session/request validation and finite bounds;
- transport-specific error classification;
- preserving Channel results/errors without semantic rewriting.

### External control/orchestration

Owns:

- provisioning and selecting tunnel/network/DNS/TLS environment;
- credential issuance/rotation/revocation policy except mechanics explicitly delegated to the selected auth component;
- choosing which deployment is active;
- reconnect cadence/retry policy;
- endpoint recreation/restart/failover;
- deciding what terminal interaction means or what happens next.

Remote ingress must not become host administration, endpoint recovery or workflow control.

## Success / Failure / Degradation

### Success

An authorized intended client reaches the complete accepted Channel surface remotely with unchanged Channel semantics and scope.

### Hard failures

- unauthenticated/unauthorized protected terminal access succeeds;
- reachability is mistaken for authorization;
- credential or terminal payload leaks through logs/errors;
- remote transport bypasses Channel scope;
- disconnect triggers endpoint lifecycle action;
- ingress duplicates/reinterprets Channel semantics;
- insecure public exposure is required to make the feature work.

### Safe degradation / BLOCKED

| Condition | Safe meaning |
| --- | --- |
| network/tunnel unavailable | remote ingress unavailable; Channel/backend truth unchanged |
| invalid/expired authority | reject at auth boundary |
| MCP transport/session failure | ingress failure; do not report pane failure |
| Channel missing | preserve Channel error semantics |
| tmux backend unavailable | preserve backend error semantics |
| foreground app rejects input | outside Channel MCP knowledge |
| intended client lacks required write/control support | BLOCKED compatibility, not contract weakening |
| current SDK/auth guidance unresolved | remain draft/BLOCKED until authoritative evidence exists |

## Required Capabilities

```text
UC1 → supported remote MCP transport + auth + bounded request composition
UC2 → enforceable negative authorization path
UC3 → transport reconnect independent from Channel lifecycle
UC4 → unchanged Channel scope across remote path
UC5 → real intended-client discovery/invocation Evidence
```

Concrete provider, transport endpoint shape, auth mechanism and client-specific setup remain deferred to Publication Gate.

## Required Upstream Product Surface

MVP-003 consumes, but does not create, the complete accepted Channel surface:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

This is why Publication Gate requires:

- MVP-002 Final Acceptance for input capabilities;
- Issue #14 Final Acceptance for the public `health` surface.

If either capability is missing, do not implement it opportunistically inside MVP-003.

## Canonical / Process Sources

Before publication/execution read:

- `AGENTS.md`;
- `docs/tasks/planning-principles.md`;
- `docs/requirements.md`;
- `docs/channel-architecture.md`;
- `docs/channel-model.md`;
- `docs/mcp-contract.md`;
- `docs/security.md`;
- `docs/deployment.md`;
- `docs/technology-stack.md`;
- `docs/mvp-plan.md`;
- repository Task protocols;
- accepted MVP-001 / MVP-002 / #14 Candidates and Reviews;
- current authoritative MCP SDK/transport/auth documentation;
- current intended client capability evidence.

## Publication Dependency / Live-Compatibility Gate

Before `status:ready`, Coordinator must:

1. confirm MVP-002 Final Acceptance;
2. confirm #14 Public Channel health Final Acceptance;
3. re-read the actual accepted complete MCP server/tool surface;
4. verify current supported remote MCP transport from authoritative sources;
5. verify current authentication/authorization requirements;
6. verify intended client can discover/invoke required read + write/control + health tools;
7. select one concrete secure deployment topology;
8. define where network reachability, TLS/private transport and auth responsibility terminate;
9. define credential authority/rotation boundary without persisting secrets in the repository;
10. update implementation-specific requirements and Evidence Contract from those live facts.

Do not freeze provider commands, stale UI assumptions or obsolete SDK APIs before this gate.

## In Scope

- supported remote MCP transport around the complete accepted Channel service;
- enforceable authentication/authorization;
- request/session/body/timeout bounds required by chosen current transport;
- required Host/Origin/resource/session protections from current authoritative guidance;
- unchanged Channel identity/scope/results/errors remotely;
- reconnect behavior that does not own endpoint lifecycle;
- selected secure deployment configuration/documentation;
- automated transport/auth/scope regression tests;
- real intended-client read/write/control/health compatibility Evidence;
- safe ingress logging/error behavior.

## Out of Scope

- implementing missing Channel capabilities such as `health`;
- Worker/Task/Issue/scheduler semantics;
- endpoint/process/worktree lifecycle;
- raw shell/tmux command API;
- host administration;
- DNS/account purchasing automation;
- generic infrastructure provisioning;
- SSH multi-host backend;
- client-specific weakening of Channel semantics/security;
- UI confirmation as authorization;
- automatic endpoint recovery after remote disconnect/failure.

## Architecture Invariants

1. reachability is not authorization;
2. authentication and authorization responsibilities are explicit;
3. ingress/auth wraps, not duplicates, Channel logic;
4. MCP connection/session lifetime is independent from Channel/pane lifetime;
5. ChannelBackend/TmuxBackend remain independent of network transport;
6. Channel visibility scope is unchanged remotely;
7. credentials are not query-string parameters or default logs;
8. ingress/auth/backend/Channel failures remain distinguishable;
9. remote failure has no endpoint-lifecycle side effect;
10. client limitation may block integration but not warp product scope;
11. host provisioning remains external;
12. normal product operation requires no root.

## Implementation Requirements

Implementation-specific details are intentionally deferred.

At Publication Gate, freeze only the minimum current supported mapping required for UC1–UC5 after authoritative transport/auth/client verification.

The implementation should structurally compose:

```text
remote transport/auth adapter
→ existing MCP/Channel tool registration/service
→ existing ChannelBackend
```

rather than create parallel remote versions of Channel operations.

## Verification Claims

- **C1 Reachability/authority separation:** network reachability alone does not grant protected Channel access.
- **C2 Auth rejection:** invalid/missing authority cannot invoke protected Channel operations.
- **C3 Authorized compatibility:** intended authorized client can invoke the accepted remote Channel surface required by the frozen Goal.
- **C4 Reconnect separation:** remote connection/session loss and reconnect do not create/restart/destroy Channels or tmux panes.
- **C5 Channel semantic preservation:** channel identity, scope, tool input/output and structured Channel/backend errors remain unchanged across remote transport.
- **C6 Failure attribution:** ingress/auth failures are distinguishable from Channel/backend failures.
- **C7 Transport safety:** current request/session/body/timeout and Host/Origin/resource protections are satisfied.
- **C8 Secret/log safety:** credentials and full sensitive terminal payloads are absent from default logs/errors.
- **C9 Current compatibility evidence:** Execution Report records actual SDK/spec/client/topology versions/date rather than planning assumptions.
- **C10 Product boundary:** no host-admin/Worker/Task/lifecycle/raw-command/recovery scope is introduced.

## Verification Plan

### J1 — Automated ingress/auth tests

GitHub Actions should cover, where locally modelable:

- missing/invalid/valid authorization paths;
- malformed and oversized requests;
- finite timeouts/session handling;
- safe logging/error redaction;
- failure-layer classification;
- regression that Channel scope and tool semantics are unchanged.

### J2 — Reconnect/lifetime verification

Prove that closing/recreating the remote transport session does not mutate externally prepared tmux panes and that a later authorized client can rediscover current Channels.

### J3 — Real intended-client integration

Required against the selected deployed topology.

Prove actual tool discovery/invocation for the frozen complete Channel surface. Record unsupported client capabilities as BLOCKED rather than simulated PASS.

### J4 — Negative security

Prove an unauthorized caller cannot use protected Channel operations, even when the network endpoint itself is reachable.

### J5 — Exact identity

Evidence records:

```text
Candidate SHA
canonical integration PR/main when applicable
deployment config revision
SDK/runtime versions
selected transport/auth model
intended client/environment/date
Actions run/jobs
real-client evidence
known external prerequisites
```

## Security Review

Security-sensitive: **yes — highest MVP trust-boundary gate**.

Primary rule:

> Network access may make Channel MCP reachable, but only the reviewed authorization boundary may grant terminal authority.

## Success Criteria

Reviewer may ACCEPT only when:

1. complete upstream Channel surface was already accepted before implementation;
2. C1-C10 are supported by exact Candidate/deployment/live-client Evidence;
3. unauthorized protected Channel access is demonstrably rejected;
4. authorized intended-client read/write/control/health invocation is proven according to frozen Goal;
5. reconnect does not own endpoint lifecycle;
6. Channel scope and semantics remain unchanged;
7. transport/auth failure is distinguishable from Channel/backend failure;
8. secrets/full terminal payloads are not emitted by default logs/errors;
9. required automated tests pass on exact Candidate;
10. deployment docs preserve provisioning/product separation;
11. no insecure exposure or product-scope expansion is used to avoid a blocker.

## Failure / Blocked Rules

BLOCKED while:

- MVP-002 is not finally accepted;
- #14 health surface is not finally accepted;
- current authoritative transport/auth path is unresolved;
- intended client lacks a required capability;
- selected secure topology cannot provide required Evidence;
- necessary external trust/infrastructure prerequisite is unavailable.

Resume when the complete accepted Channel surface and a current verified secure remote path can exercise the frozen Goal.

## Completion Protocol

When eventually published:

```text
Coordinator → ready/env:web-gpt
→ separate Web GPT Worker claim
→ implementation + Actions + real-client Evidence
→ report → review/blocked + owner:none → STOP
→ original Coordinator Review
```

Do not start MVP-004 from this Task.
