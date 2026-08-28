# Task — MVP-003 Secure remote MCP composition and client compatibility

## Metadata

```text
GitHub Issue: #11
MVP phase: Phase 3
Task kind: integration + deployment verification
Planning method: docs/tasks/planning-principles.md
Session bootstrap: docs/tasks/11-secure-remote-mcp-ingress/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Accepted local Channel main: 4e990bd60dc5bb78f40de26dad9d3732e4e97101
Hard publication dependencies:
- target ChatGPT workspace/client full MCP write capability confirmed
- OpenAI Secure MCP Tunnel available/permissioned for target environment
- real tunnel/client Evidence can be produced without persisting secrets
```

> This Task remains intentionally `status:draft`. The architecture/topology is selected; actual target-workspace/tunnel authority is still an external Publication Gate.

## Goal

Prove that an authorized intended remote client can use the **already-complete local Channel MCP** through the official Secure MCP Tunnel composition without moving remote-ingress, authorization, endpoint-lifecycle or infrastructure-provisioning responsibilities into the Channel core.

Selected composition:

```text
ChatGPT / supported OpenAI remote MCP client
→ OpenAI Secure MCP Tunnel
→ customer-run tunnel-client
→ existing agent-runtime-mcp stdio MCP server
→ ChannelBackend
→ TmuxBackend
→ existing panes
```

## Primary Use Cases

### UC1 — Authorized remote use of the complete Channel surface

```text
Actor: intended supported remote MCP client
Trigger: authorized user/client connects to the configured tunnel-backed MCP app
Preconditions:
- accepted local Channel server exists
- tunnel is provisioned for the intended workspace
- tunnel-client can launch/connect to the local stdio MCP command
- intended client/workspace supports required write/modify MCP actions
Main flow:
client/workspace authorization
→ Secure MCP Tunnel
→ tunnel-client
→ local stdio MCP
→ unchanged Channel tool
→ structured result
Success:
- intended authorized client can discover and invoke the complete accepted six-tool surface
Failure:
- any required Channel tool is inaccessible through an otherwise supported tunnel path
Degradation/BLOCKED:
- target client/workspace lacks write capability
Evidence:
- dated real ChatGPT/client + tunnel invocation record
```

### UC2 — Reject unpermissioned remote terminal authority

```text
Actor: user/client without required tunnel/workspace authority
Trigger: attempts to use the configured remote MCP connection
Success: protected tunnel-backed MCP access is unavailable/rejected before terminal authority reaches Channel tools
Failure: unpermissioned user can invoke protected terminal operations
Evidence: workspace/tunnel permission check and negative evidence available from selected environment
```

### UC3 — Disconnect/reconnect without owning terminal lifecycle

```text
Actor: authorized remote client / tunnel runtime
Trigger: tunnel or remote MCP connection stops and later reconnects
Main flow:
remote connection ends
→ existing tmux panes remain externally owned
→ tunnel/client reconnects
→ Channel MCP rediscovers current panes
Success: no pane/session/process is created/restarted/destroyed by Channel MCP or tunnel integration
Failure: remote disconnect becomes endpoint recovery authority
Evidence: before/after tmux identity + remote invocation sequence
```

### UC4 — Preserve backend scope remotely

```text
Actor: authorized remote client
Trigger: invokes discovery/read/write/control through tunnel
Success: remote path sees exactly the Channels permitted by existing tmux socket/account/allowlist scope
Failure: tunnel integration creates a scope bypass
Evidence: visible/hidden Channel remote regression
```

### UC5 — Distinguish remote ingress health from Channel health

```text
Actor: operator / integration verifier
Trigger: tunnel path or local tmux backend changes state
Success:
- tunnel failure is recorded as remote-ingress failure
- public `health` still means local backend/service mechanical health only
Failure: tunnel/network availability is injected into Channel `health` semantics
Evidence: local health + remote reachability observations are recorded separately
```

These use cases form one coherent **remote composition proof**. No new Channel capability is implemented here.

## Separation Points

### Secure ingress | Channel core

```text
Secure MCP Tunnel / tunnel-client
= remote reachability + workspace/tunnel trust boundary + MCP forwarding

agent-runtime-mcp
= existing local MCP tool/Channel semantics
```

The tunnel wraps the Channel core. It does not become a second Channel implementation, and the Channel core does not absorb tunnel APIs.

### Network/tunnel reachability | terminal authority

```text
reachable/connected
!= permissioned for tunnel use
!= authorized to exercise terminal-capable MCP surface
```

The selected OpenAI workspace/tunnel permission model is part of deployment authority. Its exact current permission names are verified at execution time.

### Runtime credential | management credential

```text
long-lived tunnel-client runtime authority
!= tunnel create/update/delete administration
```

Use the least-privilege current runtime permission set. Do not run the daemon with a broad management/admin credential merely for convenience.

### Remote connection lifetime | Channel/tmux lifetime

```text
tunnel connection
!= local MCP process
!= Channel
!= tmux pane
```

Reconnect is an ingress event, not endpoint recovery.

### Deployment configuration | product API

Tunnel creation, workspace configuration, secret injection, outbound connectivity and local process supervision are operator/deployment work. They do not become MCP tools.

### ChatGPT compatibility | product contract

The client/workspace must prove it can invoke the frozen six-tool contract. If the target environment only supports read/fetch, the Task is BLOCKED; the product is not weakened or rewritten around that limitation.

### Direct-public HTTP | selected MVP topology

Direct Streamable HTTP/OAuth is an alternate future deployment adapter, **not part of this Task**. Do not add `createMcpHandler`, a public listener, OAuth server/resource-server implementation, or HTTP-specific Channel code unless the Coordinator republishes a changed Contract based on new evidence.

## Single Responsibilities

```text
agent-runtime-mcp core
= accepted six-tool local Channel MCP over stdio

OpenAI Secure MCP Tunnel
= hosted remote tunnel/control-plane path

tunnel-client
= customer-run bridge from tunnel to local MCP stdio command

OpenAI workspace/connector permissions
= remote user/client tunnel authority

operator/deployment
= tunnel setup, secret injection, process supervision, outbound connectivity

TmuxBackend
= local terminal mechanics/scope

upper layer
= application meaning, workflow, retry and endpoint lifecycle

Web Worker
= repository integration/config/docs + required Evidence for this Task only

GitHub Actions
= local automated regression Evidence, not remote client authority
```

## Logic / Control Separation

### Stable product logic

Already accepted before this Task:

- six Channel tools and schemas;
- Channel identity/scope;
- bounded read/write;
- text/control separation;
- backend health semantics;
- Channel/backend errors.

This Task must not redesign them.

### Remote/deployment control

Owns:

- provisioning/selecting the tunnel;
- workspace/connector permissions;
- least-privilege tunnel credential injection/rotation/revocation;
- starting/stopping tunnel-client/local MCP process;
- reconnect cadence;
- deciding whether an ingress failure needs operator action.

None of this grants tmux endpoint lifecycle authority to Channel MCP.

## Success / Failure / Degradation

### Success

A real authorized target client uses the complete accepted local Channel surface through Secure MCP Tunnel with no Channel semantic changes and no public listener required on the terminal host.

### Hard failures

- full terminal-capable MCP access is available to a user lacking intended tunnel/workspace authority;
- real secrets are committed/logged as Evidence;
- tunnel integration requires public unauthenticated local ingress;
- Channel code learns OpenAI tunnel/workspace concepts;
- remote disconnect triggers tmux/process lifecycle actions;
- Channel `health` is redefined to mean tunnel/network health;
- product contract is weakened because the target client lacks write support;
- Worker introduces direct-public HTTP/OAuth core changes outside this Contract.

### Safe degradation / BLOCKED

| Condition | Meaning |
| --- | --- |
| target ChatGPT workspace lacks full MCP write | BLOCKED; no fake write Evidence |
| Secure MCP Tunnel unavailable/not permissioned | BLOCKED external prerequisite |
| tunnel-client cannot connect/launch local stdio server | deployment/integration failure |
| remote tunnel disconnects | remote ingress unavailable; panes unchanged |
| local MCP process unavailable | local service/deployment failure |
| tmux backend unavailable | existing public health/backend semantics |
| Channel disappears | existing Channel semantics |
| foreground application rejects input | outside product knowledge |

## Accepted Upstream Product Surface

All Channel capabilities are already accepted on main before this Task:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

Accepted main baseline:

```text
4e990bd60dc5bb78f40de26dad9d3732e4e97101
```

MVP-003 must consume this surface rather than create a seventh product capability.

## Live Compatibility Facts to Re-Verify

Publication/execution uses current authoritative OpenAI/MCP sources, not this document alone.

As of the Coordinator check on **2026-08-28**:

- OpenAI Secure MCP Tunnel is the supported path for private/local MCP servers;
- OpenAI `tunnel-client` supports bridging to a local stdio MCP command;
- the selected topology therefore does not need a public HTTP listener in Channel core;
- ChatGPT full MCP write/modify support is plan/workspace dependent, so the actual target workspace must be verified before publication;
- current MCP TypeScript v2 / active specification behavior must be recorded as environment identity, but no new server transport is required unless this Contract changes.

These are Publication Gate inputs and may change.

## Publication Gate

Before changing Issue #11 to `status:ready`, Coordinator must prove from the **actual target environment**:

1. Issue #14 Final Acceptance is complete;
2. main contains the complete six-tool surface;
3. target ChatGPT workspace/client supports write/modify MCP actions required for `write_text` and `send_control`;
4. Secure MCP Tunnel can be created/used in that target workspace;
5. operator has an acceptable least-privilege tunnel runtime credential path;
6. real tunnel-client can bridge to the existing local stdio MCP command;
7. remote integration Evidence can be produced without storing secrets;
8. an externally prepared tmux test Channel is available for real proof;
9. disconnect/reconnect and scope-isolation Evidence are feasible.

If any required external fact is unavailable, **remain draft**. Do not implement around the blocker.

## In Scope

- configuration/docs needed to run the accepted local stdio server behind official `tunnel-client`;
- safe sample configuration with placeholders only;
- optional repository scripts/config that do not contain credentials and do not change Channel semantics;
- local regression tests preserving the six-tool surface;
- real Secure MCP Tunnel + intended-client compatibility Evidence;
- permission/credential-boundary documentation without secret values;
- reconnect/lifetime and backend-scope proof;
- failure-layer documentation/evidence.

## Out of Scope

- adding/changing Channel tools;
- direct-public Streamable HTTP server;
- OAuth authorization/resource-server implementation inside this repository for MVP;
- custom tunnel protocol implementation;
- Worker/Task/Issue semantics;
- endpoint/process/worktree/tmux lifecycle;
- raw shell/tmux command API;
- DNS/firewall/provider-account automation;
- secret storage;
- generic monitoring/recovery service;
- weakening terminal write/control behavior for client compatibility.

## Architecture Invariants

1. secure remote ingress remains separable from Channel core;
2. Channel core remains usable locally over stdio without tunnel knowledge;
3. remote user/client authority is enforced outside/before terminal-capable Channel use;
4. tunnel runtime credential is least privilege and separate from management authority;
5. no secret enters repository/Evidence;
6. remote connection lifetime does not own Channel/tmux lifetime;
7. remote composition does not widen tmux scope;
8. public `health` remains local backend/service mechanical health;
9. remote failures remain distinguishable from Channel/backend failures;
10. no new Channel/public product capability is introduced;
11. no direct-public HTTP/OAuth implementation is introduced under this Contract;
12. normal Channel operation remains no-root.

## Verification Claims

- **C1 Complete remote compatibility:** authorized intended client can discover and invoke all six accepted Channel tools through Secure MCP Tunnel.
- **C2 Write capability:** real `write_text` and `send_control` invocation succeeds from the target client/workspace; no simulated substitute.
- **C3 Remote authority:** a user/client lacking required tunnel/workspace authority cannot obtain the same protected remote access, to the extent the selected environment exposes negative verification.
- **C4 Core preservation:** Channel tool schemas/results/scope remain unchanged and no seventh product tool appears.
- **C5 stdio preservation:** local stdio operation remains the Channel core transport behind tunnel-client.
- **C6 Lifetime separation:** tunnel disconnect/reconnect does not create/restart/destroy externally prepared tmux panes.
- **C7 Scope preservation:** remote list/read/write/control cannot reach a Channel excluded by existing tmux visibility configuration.
- **C8 Health separation:** remote tunnel/network availability is not folded into public Channel `health` semantics.
- **C9 Credential safety:** Evidence records permission model/config revision but contains no real credential; runtime and management authority are separated.
- **C10 Failure attribution:** tunnel, local MCP, Channel and backend failures are recorded as different layers.
- **C11 Boundary:** no direct HTTP/OAuth, Worker/Task, lifecycle, raw-command or infrastructure-admin product scope is introduced.

## Verification Plan

### J1 — Local automated regression

GitHub Actions must continue to pass typecheck/unit/real-tmux/static-boundary on the Candidate if repository files change.

Add only tests needed to prove integration artifacts/config do not alter the accepted six-tool core.

### J2 — Real tunnel startup

Run official `tunnel-client` using placeholder-safe documented configuration but inject real credentials outside source control.

Record:

- tunnel-client version/revision;
- local MCP command shape with secret-free arguments;
- target repository Candidate/config revision;
- connection success category;
- no credential value.

### J3 — Real intended-client invocation

From the target ChatGPT/OpenAI MCP client, prove:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

Use a disposable externally prepared terminal fixture. Do not use a production/sensitive pane merely for validation.

### J4 — Scope isolation

Prepare one visible and one excluded disposable tmux Channel. Prove the remote path cannot target the excluded Channel.

### J5 — Disconnect/reconnect

Capture pane identity/liveness before tunnel disconnect, stop/reconnect the remote ingress path, then prove:

- pane was not recreated/restarted by Channel MCP;
- later authorized client can rediscover current Channels.

### J6 — Negative authority

Use only safe, supported workspace/tunnel permission checks. Do not weaken or bypass OpenAI authorization controls to manufacture a negative test.

### J7 — Evidence identity

Execution Report records:

```text
Attempt
Worker
Base/Candidate SHA
accepted core main baseline
Actions run/jobs if repository changed
OpenAI tunnel-client version/revision
target client/workspace class (no private IDs)
verification date
selected permission model names
secret-free tunnel/config reference
real six-tool remote results summary
negative authority result or explicit platform limitation
reconnect/scope Evidence
known limitations
```

## Security Review

Security-sensitive: **yes — remote terminal authority boundary**.

Primary rule:

> The tunnel may make the local stdio MCP remotely usable, but it must not turn Channel core into infrastructure/auth/lifecycle code or expose terminal authority outside the reviewed workspace/tunnel permission boundary.

## Success Criteria

Reviewer may ACCEPT only when:

1. actual target workspace full MCP write capability is proven;
2. official Secure MCP Tunnel composition is proven against the existing stdio server;
3. C1-C11 have durable Evidence;
4. real remote write/control and health are demonstrated;
5. Channel scope and semantics are unchanged;
6. tunnel disconnect/reconnect has no endpoint lifecycle side effect;
7. no real secret is persisted;
8. local CI/regression remains green if repository files changed;
9. no direct-public HTTP/OAuth core implementation is added;
10. Integration Gate preserves the accepted Channel core and remote deployment artifacts/docs.

## Failure / Blocked Rules

BLOCKED / remain draft when:

- target ChatGPT workspace only offers read/fetch MCP capability;
- Secure MCP Tunnel is not available/permissioned;
- safe runtime credential path is unavailable;
- tunnel cannot bridge to the local stdio server;
- real write/control Evidence cannot be produced;
- the only proposed workaround would expand Channel core, weaken authorization, expose a public unauthenticated endpoint, or store secrets.

## Completion Protocol

When eventually published:

```text
Coordinator → ready/env:web-gpt
→ separate Web GPT Worker claim
→ safe integration/config/docs + Actions where relevant + real Tunnel/ChatGPT Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ original Coordinator Review
```

Do not start MVP-004 from this Task.
