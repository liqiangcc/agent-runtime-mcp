# Task — MVP-003 Secure remote MCP ingress and client compatibility

## Metadata

```text
GitHub Issue: #11
MVP phase: Phase 3
Task kind: combined implementation + verification
Planning base commit: cfb1c81d8571438d0a93f559d4162ec04e50fb9e
Session bootstrap: docs/tasks/11-secure-remote-mcp-ingress/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependencies: MVP-002 Final Acceptance + live remote MCP compatibility/auth verification + explicit deployment topology
```

> This Task is intentionally **draft**. Stable use cases and security boundaries are planned now; current MCP transport/auth/client details must be re-verified immediately before Publication Gate.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Allow an authorized remote MCP client to use the accepted Channel capabilities across a network boundary while keeping remote transport/authentication separate from Channel communication logic and keeping infrastructure provisioning outside the product.

## Primary Use Cases

### UC1 — Authorized remote Channel access

```text
Actor: supported remote MCP client
Trigger: client connects to the published Channel MCP endpoint
Preconditions: secure reachable topology exists; valid authorization is available
Main flow: authenticate/authorize → MCP request → unchanged Channel operation → structured result
Success: authorized client can use accepted read/write/control capabilities remotely
Failure: invalid/missing auth is rejected before Channel authority is exercised
Degradation: ingress may be unavailable while local Channel/backend logic remains independently valid
Evidence: automated auth/transport tests + real remote client invocation
```

### UC2 — Reject unauthorized terminal authority

```text
Actor: unauthenticated/unauthorized caller
Trigger: caller attempts tool discovery/invocation
Main flow: ingress/auth boundary rejects request
Success: caller cannot discover/read/write/control protected Channels
Failure: any unauthorized terminal access succeeds
Evidence: negative remote/auth tests
```

### UC3 — Prove client compatibility without distorting product semantics

```text
Actor: Coordinator / integration verifier
Trigger: accepted Channel tools are exposed through chosen remote transport
Success: intended client can invoke required read and write/control tools as designed
Failure: implementation bug breaks otherwise-supported client path
Degradation/BLOCKED: client/platform lacks required write capability; product contract is not weakened to compensate
Evidence: dated live-client compatibility record tied to Candidate/deployment
```

These use cases are one Task because they define one coherent **remote trust/transport boundary** around the already-accepted Channel service.

## Separation Points

### Remote ingress/auth | Channel application logic

```text
Ingress/auth owns:
- network protocol/session handling
- authentication/authorization
- request bounds/timeouts
- transport-specific protections

Channel logic owns:
- channel discovery/read/write/control semantics
- channel scope/identity/errors
```

Remote transport must wrap, not rewrite, Channel semantics.

### Deployment provisioning | MCP product

DNS, tunnel/account setup, host bootstrap and other environment provisioning are prerequisites/operator concerns. The product may document/configure the selected topology but must not expose them as Channel tools.

### Client compatibility | product contract

Compatibility testing proves whether the intended client can use the frozen contract. A client limitation does not authorize adding Task/Worker/lifecycle semantics or weakening security.

### Ingress failure | backend/channel failure

Transport/auth failures must remain distinguishable from Channel/backend failures. Neither class of failure implies endpoint lifecycle action.

### Authentication | authorization

Identity/credential validity and permission to use protected Channel operations are explicit trust-boundary responsibilities; UI confirmation is not authority.

## Single Responsibilities

```text
Remote MCP ingress = protocol/session/request transport
Auth boundary = authenticate/authorize protected terminal access
Channel Service = unchanged Channel operation semantics
TmuxBackend = local tmux communication mechanics
Deployment/operator layer = provision reachable secure infrastructure
Client compatibility check = prove real integration, not redefine product
GitHub Actions = automated verification Evidence
```

## Logic / Control Separation

Product logic owns:

- how a protected remote request reaches the same Channel operation;
- auth enforcement at the trust boundary;
- bounded request/response behavior;
- structured ingress/auth errors.

External control/orchestration owns:

- provisioning tunnel/domain/network environment;
- credential issuance/rotation policy unless explicitly delegated to selected auth layer;
- selecting which deployment to operate;
- deciding what the remote terminal interaction means;
- Task/workflow decisions.

Remote ingress must not become host administration or workflow control.

## Success / Failure / Degradation

### Success
Authorized intended client can remotely exercise the accepted Channel contract; unauthorized callers cannot.

### Hard failure
Unauthorized terminal access, credential leakage, transport bypass, Channel semantic drift, or insecure public exposure.

### Safe degradation / BLOCKED

- ingress unavailable → remote access unavailable; local Channel logic not reinterpreted;
- backend unavailable → backend error through remote path;
- intended client lacks required write capability → integration BLOCKED, not product weakening;
- fast-changing SDK/auth requirement unresolved → keep Task draft/blocked until current evidence exists.

## Required Capabilities

```text
UC1 → authenticated remote MCP transport + request bounds + unchanged Channel composition
UC2 → enforceable authorization + negative-access behavior
UC3 → real-client discovery/invocation verification + compatibility evidence
```

Concrete transport/provider mapping is intentionally deferred until the live Publication Gate.

## Canonical / Process Sources

Before publication/execution read:

- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- all canonical Channel/security/deployment/technology docs;
- repository Task protocols;
- accepted MVP-001/002 Candidates/Reviews;
- current authoritative MCP SDK/transport/auth docs;
- current intended client capability evidence.

## Publication Dependency / Live-Compatibility Gate

Before `status:ready`, Coordinator must:

1. confirm MVP-002 Final Acceptance;
2. re-read accepted server/tool surfaces;
3. verify current supported remote MCP transport/auth requirements;
4. verify intended client read/write capability;
5. select concrete deployment topology and credential boundary;
6. update implementation-specific requirements from live evidence.

Do not freeze provider-specific commands or stale plan/workspace assumptions in advance.

## In Scope

- supported remote MCP transport around accepted Channel service;
- enforceable authentication/authorization;
- request/session/timeout bounds required by chosen current transport;
- same Channel identity/scope/semantics remotely;
- secure deployment configuration/docs;
- automated auth/transport tests;
- real remote read/write client compatibility evidence;
- safe logging/error behavior.

## Out of Scope

- Worker/Task/Issue/scheduler semantics;
- endpoint/process/worktree lifecycle;
- raw shell/tmux command API;
- host administration;
- DNS/account purchasing automation;
- SSH multi-host backend;
- weakening Channel tools to fit a client limitation;
- UI confirmation as authorization.

## Architecture Invariants

1. ingress/auth wraps Channel logic rather than absorbing it;
2. unauthenticated public terminal authority is forbidden;
3. ChannelBackend/TmuxBackend stay transport-independent;
4. Channel visibility scope remains enforced remotely;
5. credentials are not query-string/log payloads;
6. remote failure has no lifecycle side effect;
7. client limitation may block integration but not expand/warp product scope;
8. no root required for normal operation.

## Implementation Requirements

Only after the live compatibility gate, choose the minimum current supported implementation satisfying UC1–UC3 and the separation boundaries.

Do not bake obsolete protocol/provider assumptions into this draft.

## Verification Claims

- C1 protected remote operations require valid authorization;
- C2 invalid/missing authorization cannot access Channels;
- C3 authorized intended client can invoke accepted read/health tools;
- C4 authorized intended client can invoke accepted write/control tools when required by frozen Goal;
- C5 Channel semantics/scope remain unchanged across transport;
- C6 current transport bounds/protections are satisfied;
- C7 credentials/full terminal payloads are absent from default logs/errors;
- C8 ingress/auth and backend/channel failures remain distinct with no lifecycle mutation;
- C9 Execution Report records current SDK/spec/client environment/date;
- C10 no host-admin/Worker/Task/lifecycle/raw-command scope is introduced.

## Verification Plan

### J1 Automated
Actions covers auth rejection, malformed/oversized requests, timeouts, safe logging and regression of Channel semantics.

### J2 Real remote integration
Use the selected deployed topology and intended client to prove required authorized read/write/control invocation.

### J3 Negative security
Invalid/no auth cannot discover or invoke protected Channel tools.

### J4 Identity
Evidence identifies Candidate SHA, deployment configuration revision, relevant versions and real-client environment/date.

## Security Review

Security-sensitive: **yes — highest MVP trust-boundary gate**.

Primary separation to protect: network caller authority must stop at the auth boundary unless explicitly authorized for Channel operations.

## Success Criteria

ACCEPT only when C1–C10 are supported by exact Candidate/deployment/live-client Evidence, required automated tests pass, and the remote boundary remains a transport/auth layer rather than a workflow/host-management layer.

If required real write capability is unavailable in the chosen current client environment, mark BLOCKED rather than claiming the remote-control goal complete.

## Failure / Blocked Rules

BLOCKED while MVP-002 is unaccepted, current transport/auth/client path is unresolved, required write capability is unavailable, or external secure-topology prerequisites prevent valid evidence.

Resume when current authoritative remote MCP/auth/client path is known and can exercise the frozen Goal.

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
