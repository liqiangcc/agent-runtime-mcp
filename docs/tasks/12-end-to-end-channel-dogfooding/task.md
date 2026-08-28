# Task — MVP-003 End-to-end Channel capability dogfooding

## Metadata

```text
GitHub Issue: #12
MVP phase: Phase 3 validation
Task kind: verification / integration
Session bootstrap: docs/tasks/12-end-to-end-channel-dogfooding/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependency: complete six-tool Channel surface accepted + one selected upper-layer scenario + externally prepared disposable endpoint
```

> This Task remains `status:draft` until the Coordinator selects the concrete scenario. It has **no tunnel/provider/remote-deployment dependency**.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Prove that one real upper layer can use the completed generic Channel MCP as a communication capability while endpoint lifecycle, application semantics and workflow control remain outside the product.

## Accepted product baseline

Already accepted before this Task:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

Accepted implementation comes from Issues #2, #10 and #14.

Issue #11 remote deployment/tunnel planning is `NOT_PLANNED` and is not an upstream dependency.

## Primary Use Case

### UC1 — Upper layer communicates with an existing interactive terminal through the six MCP capabilities

```text
Actor: upper-layer system / operator / MCP client
Trigger: an interactive terminal endpoint already exists and the upper layer needs to communicate with it
Preconditions:
- terminal endpoint was prepared outside Channel MCP
- an MCP client/harness can connect to the server; local stdio is sufficient
- upper layer owns the meaning of the interaction
Main flow:
1. upper layer identifies/prepares endpoint externally
2. client calls list_channels
3. client calls get_channel
4. client calls health independently of Channel/application readiness
5. client calls read_channel
6. client calls write_text with meaningful ordinary input
7. client calls send_control when explicitly required
8. upper layer interprets the application result itself
Success:
- six accepted MCP capabilities work coherently
- Channel MCP never learns Task/application/lifecycle meaning
Failure:
- MCP reports mechanical Channel/backend/input failure
- upper layer decides what to do next
Degradation:
- missing endpoint remains CHANNEL_NOT_FOUND/unavailable
- unexpected application output remains upper-layer interpretation
Evidence:
- MCP capability Evidence
- separate upper-layer application/workflow Evidence
```

This is a validation Task, not a feature-expansion Task.

## Separation Points

### MCP capability | deployment mechanism

The MCP client connection mechanism is test/integration infrastructure. Local stdio is sufficient.

Tunnel/provider/network topology is not part of this Task or the product.

### Upper-layer semantics | Channel MCP

```text
Upper layer owns:
- why endpoint exists
- endpoint creation/restart/cleanup
- what program runs there
- which Channel corresponds to its workflow
- what input to send
- what output means
- retry/recovery/next-step decisions
- application success

Channel MCP owns:
- Channel discovery
- mechanical metadata
- bounded output read
- bounded literal text write
- explicit terminal controls
- backend/service health
- structured mechanical errors
```

### Endpoint lifecycle | Channel discovery

Discovery reflects already-existing state. It never creates desired terminal state.

### Observation | interpretation

Terminal output is transport data. Channel MCP never promotes output text to Task/application completion authority.

### Communication logic | workflow control

Channel operations are product logic. Sequencing, retry, recovery and application workflow belong to the upper layer.

### Backend health | application readiness

A healthy backend does not prove a Channel exists or an application is ready.

## Single Responsibilities

```text
Channel MCP
= six generic terminal communication capabilities

TmuxBackend
= tmux-specific mechanics and scope

upper-layer consumer
= lifecycle + application/workflow meaning + control policy

MCP client/harness
= exercise the public MCP contract

verification scenario
= prove composition without adding product coupling
```

## Logic / Control Separation

Product logic owns only mechanical Channel communication and health.

Upper-layer control owns:
- endpoint preparation;
- selecting the workflow-relevant Channel;
- deciding call order for application purposes;
- interpreting output;
- retries/recovery;
- deciding whether the use case succeeded.

Dogfooding fails architecturally if Channel code needs scenario-specific Task/application state.

## Success / Failure / Degradation

### Success

One useful interaction is completed through the six MCP capabilities while the upper layer independently owns application meaning.

### Hard failure

- scenario requires Task/Worker/application fields in Channel schemas;
- MCP creates/restarts endpoints to make the scenario pass;
- terminal output becomes semantic completion authority inside MCP;
- raw tmux/shell escape hatch is needed;
- deployment/tunnel behavior is added as a Channel capability;
- a seventh product tool is added merely for the scenario.

### Safe degradation

- Channel disappears → structured Channel failure;
- tmux backend unavailable → backend health/error remains mechanical;
- application rejects input → upper layer interprets it;
- retry/recovery remains outside product.

## Required Capabilities

Exactly the accepted six-tool surface:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

No new generic capability is assumed.

If the scenario appears to need a seventh product capability, stop and return it to Coordinator review rather than expanding this Task implicitly.

## Scenario-Selection Gate

Before `status:ready`, Coordinator must record:

```text
1. one narrow upper-layer use case
2. one externally prepared disposable terminal endpoint
3. one foreground interactive program
4. one MCP client/harness; stdio is acceptable
5. one meaningful ordinary input
6. one explicit control to exercise where meaningful
7. MCP capability Evidence expected
8. application/workflow Evidence expected from the upper layer
9. external cleanup/recovery owner
```

Selection criteria:
- scenario is useful but narrow;
- all endpoint lifecycle is external;
- all application semantics are external;
- all six MCP capabilities can be exercised or explicitly justified;
- no tunnel/provider is required;
- Evidence separates mechanical MCP success from application success.

## In Scope

- select one real upper-layer use case;
- externally prepare a disposable endpoint;
- use an MCP client/harness against the accepted server;
- exercise the six accepted capabilities;
- verify missing/backend failure behavior;
- prove architecture separation;
- record genuine generic gaps for Coordinator review without implementing them implicitly.

## Out of Scope

- remote deployment/tunnel/provider verification;
- network/TLS/DNS/firewall/workspace auth;
- Worker/Task/Issue semantics in Channel MCP;
- endpoint/session/process lifecycle APIs;
- scenario-specific parser/scheduler/automation inside Channel MCP;
- raw shell/tmux command APIs;
- product-side application completion inference;
- automatic creation of follow-up Tasks.

## Architecture Invariants

1. Channel MCP remains application-agnostic.
2. MCP capability and deployment mechanism remain separate.
3. Endpoint lifecycle remains external.
4. Communication logic and workflow control remain separate.
5. Observation and semantic interpretation remain separate.
6. Backend health and application readiness remain separate.
7. Missing endpoints are reported, not recreated.
8. No scenario-specific public fields/tools are added.
9. No seventh product capability is added without Contract republication.
10. The server remains usable over its accepted local MCP transport.

## Verification Claims

- **C1 Public surface:** the MCP client sees exactly the accepted six Channel tools relevant to the product.
- **C2 Discovery/inspection:** an externally prepared endpoint is discovered and inspected mechanically.
- **C3 Bounded read:** recent output is read within the accepted bounds without semantic inference.
- **C4 Literal write:** meaningful ordinary input is delivered through `write_text` with accepted text/control separation.
- **C5 Explicit control:** an accepted explicit control is delivered where the scenario requires it.
- **C6 Health separation:** `health` reports backend/service state and is not used as application readiness.
- **C7 Lifecycle separation:** endpoint creation/restart/cleanup remains outside Channel MCP.
- **C8 Interpretation separation:** upper layer, not Channel MCP, decides application/workflow outcome.
- **C9 Failure behavior:** missing/backend/input failure remains mechanical and triggers no product-side recovery.
- **C10 Product boundary:** no Task/Worker/application/deployment/raw-command coupling is introduced.

## Verification Plan

### J1 — Local regression

Exact Candidate/main must keep typecheck, unit, real tmux and static-boundary CI green if repository files change.

### J2 — MCP client/harness end-to-end

Use the selected MCP client/harness to exercise the accepted public server surface rather than calling only private backend methods.

### J3 — Real terminal scenario

Use one externally prepared disposable tmux endpoint and capture sanitized Evidence for discovery, health, read, write and control.

### J4 — Negative path

Externally remove the endpoint or make an accepted backend/missing condition observable; prove Channel MCP reports it and does not recreate/recover it.

### J5 — Separation review

Confirm product code/schema contains no scenario-specific or deployment semantics.

## Security Review

Security-sensitive terminal I/O rules from `docs/security.md` remain active.

Deployment security is outside this Task. Use local/disposable test infrastructure and do not persist unnecessary terminal contents or secrets.

## Success Criteria

Reviewer may ACCEPT only when:

1. C1-C10 have durable Evidence;
2. one real upper-layer scenario uses the public MCP surface end to end;
3. endpoint lifecycle remains external;
4. application interpretation remains external;
5. no deployment/tunnel requirement enters the product;
6. no scenario-specific Channel coupling is introduced;
7. required CI remains green for repository changes.

## Evidence Contract

Record:

```text
Attempt
Worker
Base/Candidate SHA if changed
selected MCP client/harness
selected disposable Channel/terminal kind
upper-layer scenario
sanitized six-tool MCP Evidence
separate upper-layer result Evidence
negative failure Evidence
Claims C1-C10
known limitations / generic gaps
```

Do not persist secrets or unnecessary full terminal transcripts.

## Failure / Blocked Rules

BLOCKED while no suitable scenario/endpoint/client harness exists or required evidence cannot be produced.

If a genuine new generic MCP capability need appears, report it for Coordinator review/SPLIT. Do not expand this Task implicitly.

## Completion Protocol

When published:

```text
Coordinator → ready/env:web-gpt
→ separate Web GPT Worker claims one Attempt
→ verification/integration + durable Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ original Coordinator Review
```

Do not automatically create or execute a follow-up Task.
