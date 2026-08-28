# Task — MVP-004 End-to-end Channel dogfooding

## Metadata

```text
GitHub Issue: #12
MVP phase: Phase 4
Task kind: verification / integration
Planning base commit: d5e61a31b33154a7e20d152084c759d0a2955600
Session bootstrap: docs/tasks/12-end-to-end-channel-dogfooding/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependencies: MVP-003 Final Acceptance + concrete reachable deployment + externally prepared terminal endpoint + chosen upper-layer scenario
```

> This Task is intentionally **draft**. It freezes the separation proof and use-case shape, not the final application/provider details. The actual upper-layer scenario must be selected from live accepted state before Publication Gate.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Prove that the completed Channel MCP is useful as a generic communication channel in one real upper-layer workflow while remaining ignorant of endpoint lifecycle, application semantics and workflow/Task meaning.

## Primary Use Case

### UC1 — Upper layer communicates with an already-existing interactive terminal through Channel MCP

```text
Actor: upper-layer system/operator/client
Trigger: upper layer has prepared an interactive terminal endpoint and needs remote terminal communication
Preconditions:
- accepted secure remote Channel MCP deployment is reachable
- terminal endpoint already exists outside Channel MCP
- upper layer knows what the terminal/application interaction means
Main flow:
1. upper layer prepares/identifies endpoint externally
2. Channel MCP discovers the existing Channel
3. client inspects Channel metadata
4. client reads bounded output
5. client writes one meaningful ordinary instruction/data payload
6. client sends at least one explicit terminal control when appropriate
7. upper layer interprets application/workflow result using its own authority
Success outcome:
- Channel operations work end to end
- application/workflow goal can proceed using the transport
- Channel MCP never needs application/Task/lifecycle knowledge
Failure outcome:
- transport/auth/channel failure is reported mechanically and upper layer decides recovery
Degraded outcome:
- missing endpoint remains CHANNEL_NOT_FOUND/unavailable; MCP does not recreate it
Authoritative evidence:
- Channel transport evidence from MCP/deployment
- application/workflow meaning from the selected upper layer, not Channel MCP
```

This Task is verification/integration, not a request to add scenario-specific features.

## Separation Points

### Upper-layer semantics | Channel MCP

```text
Upper layer owns:
- why endpoint exists
- how it is created/restarted/cleaned up
- what program runs there
- which instruction to send
- what output means
- success/retry/recovery/next-step decisions

Channel MCP owns:
- discover existing Channel
- inspect mechanical metadata
- bounded read
- literal text write
- explicit terminal control
- mechanical transport/auth/backend errors
```

This is the primary dogfooding proof.

### Endpoint lifecycle | Channel discovery

Endpoint creation/destruction occurs outside the product. Discovery reflects reality; it does not create desired state.

### Observation | interpretation

Terminal output is untrusted transport data. Channel MCP may return it but cannot conclude application completion, Task success or acceptance.

### Communication logic | workflow control

Channel communication semantics remain product logic. Sequencing/retry/recovery/application workflow remains upper-layer control.

### Remote trust boundary | application meaning

MVP-003 auth/transport controls who may access Channels. Authorization to use the channel does not make Channel MCP responsible for what the upper-layer workflow means.

## Single Responsibilities

```text
Channel MCP = secure terminal communication with existing endpoints
upper-layer consumer = endpoint lifecycle + application/workflow semantics
remote ingress/auth = protect network access to Channel capabilities
terminal application = execute its own interactive behavior
verification scenario = prove composition without adding coupling
```

## Logic / Control Separation

Channel MCP logic owns only mechanical terminal communication.

Upper-layer control owns:

- endpoint preparation;
- selecting which Channel corresponds to its workflow;
- deciding when to read/write/control;
- interpreting responses;
- retry/recovery/recreate policy;
- deciding whether the use case succeeded.

Dogfooding fails architecturally if product code must learn Task/Issue/application-specific state to make the scenario work.

## Success / Failure / Degradation

### Success
A real useful interaction crosses the secure Channel MCP and the upper layer independently determines its application/workflow result.

### Hard failure

- Channel MCP requires scenario-specific Task/Worker/application semantics;
- MCP creates/restarts the terminal to make the scenario pass;
- terminal output is used by MCP as semantic completion authority;
- secure remote access or required Channel operation does not work.

### Safe degradation

- endpoint disappears → Channel not found/unavailable;
- remote ingress unavailable → remote transport unavailable;
- application returns unexpected output → upper layer interprets it; MCP remains transport-only;
- retry/recovery decision remains outside product.

## Required Capabilities

```text
existing endpoint discovery
+ mechanical inspection
+ bounded read
+ literal text write
+ explicit control
+ secure remote ingress/auth
```

No new Channel capability is planned by default. If the scenario requires a new product capability, Coordinator must decide whether that reveals a genuine generic Channel gap or merely scenario-specific coupling; this Task stays draft/revised rather than silently expanding scope.

## Scenario-Selection Gate

Before `status:ready`, Coordinator must select and record:

```text
1. accepted reachable Channel MCP deployment
2. intended remote client
3. externally prepared terminal endpoint
4. interactive program / upper-layer consumer
5. one narrow meaningful interaction
6. transport Evidence expected from Channel MCP
7. application/workflow Evidence expected from upper layer
8. explicit endpoint cleanup/recovery owner outside MCP
```

Selection criteria:

- scenario must exercise read + write + at least one explicit control where meaningful;
- endpoint lifecycle must be external;
- application semantics must be external;
- no bespoke Channel API should be needed;
- evidence must clearly distinguish transport success from application success.

## Canonical / Process Sources

Before publication/execution read:

- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- all canonical Channel/security/deployment docs;
- accepted MVP-001/002/003 Candidates/Reviews;
- repository Task protocols;
- scenario-specific upper-layer authority/evidence sources selected at Publication Gate.

## In Scope

- select one real upper-layer use case;
- prepare endpoint externally;
- invoke accepted remote Channel tools end to end;
- prove separation points and failure behavior;
- collect durable transport + upper-layer evidence;
- document any genuine generic gaps without implementing new scope inside this Task unless formally revised.

## Out of Scope

- adding Worker/Task/Issue semantics to Channel MCP;
- endpoint/session/process lifecycle product APIs;
- scenario-specific parser/scheduler/automation in Channel MCP;
- raw shell/tmux command API;
- silently weakening auth/security;
- declaring application success from terminal text inside Channel MCP;
- starting a new feature Task automatically from a discovered gap.

## Architecture Invariants

1. Channel MCP remains application-agnostic.
2. endpoint lifecycle remains external.
3. communication logic and workflow control remain separate.
4. observation and semantic interpretation remain separate.
5. secure remote authorization remains enforced.
6. missing endpoint is reported, not recreated.
7. no scenario-specific fields/tools are added merely for dogfooding.

## Verification Claims

- C1 Existing externally prepared endpoint is discovered remotely.
- C2 Bounded output can be read without semantic interpretation by Channel MCP.
- C3 Meaningful ordinary input is delivered literally to the selected Channel.
- C4 At least one accepted explicit terminal control works where scenario requires it.
- C5 Endpoint/application lifecycle remains completely outside Channel MCP.
- C6 Upper layer, not Channel MCP, owns application/workflow result interpretation.
- C7 Missing endpoint/transport failure remains mechanical and does not trigger product-side recovery.
- C8 Remote auth boundary remains effective during real use.
- C9 No Worker/Task/application-specific product coupling is introduced.
- C10 Evidence distinguishes Channel transport success from upper-layer application/workflow success.

## Verification Plan

### J1 — Preflight
Confirm exact accepted MVP-003 deployment/Candidate and selected endpoint/scenario before execution.

### J2 — End-to-end run
Capture sanitized evidence for discovery, read, write, control and upper-layer result without storing unnecessary sensitive terminal history.

### J3 — Negative path
Externally remove/disable the selected endpoint or otherwise test an accepted missing/unavailable condition; prove MCP reports it and does not recreate it.

### J4 — Separation review
Static/config/evidence review confirms no scenario-specific Task/application/lifecycle semantics entered product code/config contract.

## Security Review

Security-sensitive: yes, because real remote terminal authority is exercised. Use the already-accepted MVP-003 trust boundary; do not expand credentials, terminal visibility or logging beyond what the scenario minimally requires.

## Success Criteria

Reviewer may ACCEPT only when C1–C10 are evidenced in one real scenario and the scenario demonstrates, rather than weakens, the separation:

```text
upper layer = lifecycle + meaning + control
Channel MCP = secure communication logic only
```

A useful scenario that only works after product learns its Task/application semantics is a design failure, not successful dogfooding.

## Evidence Contract

Record:

```text
accepted MVP-003 Candidate/deployment identity
selected remote client
selected externally prepared Channel/terminal kind
upper-layer scenario and authority
sanitized discovery/read/write/control evidence
upper-layer result evidence
negative missing/unavailable evidence
Claims C1-C10
known limitations / generic gaps found
```

Do not persist secrets or unnecessary full terminal transcripts.

## Failure / Blocked Rules

BLOCKED while MVP-003 is not finally accepted, no suitable externally prepared reachable endpoint/scenario exists, or required real integration evidence cannot be produced.

If dogfooding reveals a genuine new generic capability need, record it for Coordinator review/SPLIT; do not expand this Task implicitly.

## Completion Protocol

When eventually published:

```text
Coordinator → ready/env:web-gpt
→ separate Web GPT Worker executes one verification/integration Attempt
→ durable Evidence + report
→ review/blocked + owner:none → STOP
→ original Coordinator Review
```

Do not automatically create or execute a follow-up Task.
