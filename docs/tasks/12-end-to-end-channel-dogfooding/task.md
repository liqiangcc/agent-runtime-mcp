# Task — MVP-003 End-to-end Channel capability dogfooding

## Metadata

```text
GitHub Issue: #12
MVP phase: Phase 3 validation
Task kind: public-MCP validation / integration
Session bootstrap: docs/tasks/12-end-to-end-channel-dogfooding/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Accepted product baseline: Issues #2 + #10 + #14
Deployment dependency: none
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Prove that one real upper layer can use the completed generic Channel MCP through its **public MCP surface** while endpoint lifecycle, application semantics and workflow control remain outside the product.

This Task validates the accepted product. It does not add a seventh Channel capability and does not validate deployment/tunnel/provider behavior.

## Accepted Product Surface

The product is already frozen to exactly these six capabilities:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

Accepted implementation comes from Issues #2, #10 and #14.

Issue #11 remote deployment/tunnel integration is `NOT_PLANNED` and has no execution authority.

## Frozen Dogfooding Use Case

### UC1 — Upper layer drives one disposable interactive bash Channel through public MCP

Actor:

```text
an upper-layer verification harness acting as an MCP client
```

Externally prepared endpoint:

```text
one disposable tmux server/session/pane
foreground program: bash --noprofile --norc
```

The tmux endpoint is created and destroyed by the test fixture **outside** Channel MCP.

MCP client:

```text
official TypeScript MCP client SDK
Client + StdioClientTransport
```

The client launches/connects to the existing `agent-runtime-mcp` stdio server and exercises the public MCP contract. Do not call `TmuxBackend` directly as the primary dogfood path and do not hand-roll JSON-RPC when the official client SDK is available.

### Main flow

```text
external fixture creates disposable tmux+bash endpoint
→ MCP client connects to agent-runtime-mcp over stdio
→ list tools and prove the accepted six-tool public surface
→ health
→ list_channels
→ get_channel
→ read_channel
→ write_text("printf 'CHANNEL_DOGFOOD_OK\\n'", submit=true)
→ read_channel and let the upper layer observe/interpret CHANNEL_DOGFOOD_OK
→ write_text("sleep 30", submit=true)
→ send_control(INTERRUPT)
→ write_text("printf 'AFTER_INTERRUPT_OK\\n'", submit=true)
→ read_channel and let the upper layer observe/interpret AFTER_INTERRUPT_OK
→ external fixture destroys the tmux endpoint
→ invoke an accepted Channel operation again
→ receive mechanical missing/unavailable failure
→ prove MCP did not recreate the endpoint
```

The exact shell marker strings may be changed only for deterministic test-fixture reasons; the semantic shape above is frozen.

## Why This Use Case

It is narrow but exercises the actual composition boundary:

```text
upper layer
= prepares endpoint
+ chooses shell commands
+ decides call ordering
+ interprets marker output
+ decides success
+ performs cleanup

Channel MCP
= discovers
+ inspects
+ reads
+ writes literal text
+ sends explicit control
+ reports backend health/errors
```

The shell is intentionally just one foreground application. Channel MCP must not learn shell semantics.

## Separation Points

### MCP capability | deployment mechanism

Local stdio is sufficient. Tunnel/provider/network/TLS/auth topology is outside this Task and outside product acceptance.

### Endpoint lifecycle | Channel discovery

The fixture creates/destroys tmux and bash. MCP only reflects already-existing state.

### Communication | application meaning

`CHANNEL_DOGFOOD_OK` and `AFTER_INTERRUPT_OK` are interpreted by the upper-layer test harness. Channel MCP only returns terminal data.

### Observation | completion

A successful `read_channel` or appearance of a marker does not become product-level application state.

### Logic | workflow control

Channel MCP owns individual mechanical operations. The upper layer owns sequencing, sleeps/waits used by the scenario, retry decisions and final pass/fail interpretation.

### Backend health | application readiness

`health.available=true` proves only backend/service mechanical health. It does not prove the bash process is ready or the Channel exists.

## Single Responsibilities

```text
Channel MCP
= six generic public MCP capabilities

TmuxBackend
= tmux mechanics + configured visibility scope

MCP client harness
= exercise the public MCP protocol

dogfood fixture
= create/destroy disposable tmux/bash endpoint externally

upper-layer assertions
= interpret shell markers and scenario outcome

GitHub Actions
= executable Evidence environment
```

## Logic / Control Separation

Product logic must remain unchanged:

- Channel identities and scope;
- bounded read/write;
- text/control separation;
- explicit ENTER / INTERRUPT / ESCAPE;
- backend health;
- structured errors.

Scenario control remains outside the product:

- endpoint preparation;
- shell command choice;
- sequencing;
- waiting for observable output;
- interruption timing;
- cleanup;
- application success interpretation.

## Allowed Repository Changes

This is a validation Task. Expected changes are limited to validation infrastructure/documentation, for example:

- add the official `@modelcontextprotocol/client` package as a development dependency, aligned with the accepted MCP SDK major line;
- add a public-stdio dogfood/integration harness;
- add a dedicated npm test script if useful;
- extend GitHub Actions to run the dogfood verification;
- update README/test documentation if needed.

### Product-source change gate

Do **not** silently change `src/` behavior, public Tool schemas, Channel model, backend semantics or add a seventh Tool merely to make dogfooding pass.

If the public-MCP dogfood path reveals a genuine defect in the already-accepted six-capability implementation that requires product-source behavior changes:

```text
stop
→ record exact failing Evidence
→ [BLOCKER REPORT]
→ Coordinator decides REVISE / SPLIT
```

A documentation-only correction that does not change product behavior may remain in scope if it accurately describes the accepted contract.

## Failure / Degradation Semantics

### Success

The public MCP client completes the frozen flow and the upper layer can independently establish the shell interaction result without Channel MCP learning shell/workflow semantics.

### Hard architecture failure

- test must call private backend methods instead of public MCP to pass;
- Channel MCP must learn bash/Task/application semantics;
- MCP creates/restarts/kills the tmux endpoint;
- a seventh public Tool or scenario-specific field is added;
- deployment/tunnel logic is introduced;
- raw shell/tmux escape hatch becomes a public MCP capability;
- `health` is treated as application readiness.

### Safe degradation

- missing endpoint → structured Channel failure;
- backend unavailable → mechanical backend health/error;
- shell command produces unexpected output → upper layer interprets failure;
- timing uncertainty → harness may use bounded polling/waits, but MCP itself gains no semantic wait-for-completion API.

## Verification Claims

- **C1 Public protocol:** official MCP client connects through stdio and discovers exactly the accepted six product Tools.
- **C2 Health separation:** public `health` is exercised and remains backend/service health only.
- **C3 Discovery/inspection:** externally prepared bash pane is discovered and inspected through public MCP.
- **C4 Bounded observation:** public `read_channel` observes terminal data with accepted bounds/truncation semantics.
- **C5 Literal write:** `write_text` delivers the frozen meaningful ordinary input through public MCP.
- **C6 Explicit control:** `send_control(INTERRUPT)` interrupts the long-running shell command through public MCP.
- **C7 Post-control usability:** a later write/read succeeds, proving control use did not require lifecycle recovery by MCP.
- **C8 Lifecycle separation:** endpoint creation/destruction is performed externally; after destruction MCP reports failure and does not recreate it.
- **C9 Interpretation separation:** shell marker/application success is asserted by the upper layer, not encoded as Channel state.
- **C10 Product boundary:** no deployment/Task/Worker/application-specific public coupling or seventh Tool is introduced.

## Verification Plan

### J1 — Public MCP client harness

Use the official TypeScript client SDK. Current v2 client shape is:

```text
Client
+ StdioClientTransport
```

The harness must exercise the built server process over stdio rather than importing `TmuxBackend` as its primary subject.

### J2 — Disposable tmux/bash fixture

GitHub Actions Linux prepares an isolated tmux server/session and bash pane externally. The MCP API itself must not contain any endpoint lifecycle Tool.

### J3 — Six-tool flow

Collect sanitized assertions for:

```text
health
list_channels
get_channel
read_channel
write_text
send_control
```

### J4 — Meaningful interaction

Verify the two marker observations and the interrupt sequence through public MCP. The harness owns all shell-specific interpretation.

### J5 — Negative lifecycle path

Destroy the disposable endpoint externally, then prove a public Channel call fails mechanically and no replacement pane/session appears.

### J6 — Regression/boundary

Exact Candidate must pass:

```text
typecheck
unit tests
existing real-tmux integration
dogfood/public-MCP integration
static boundary checks
```

Static/diff review must confirm no product-source semantic expansion unless Coordinator explicitly republishes the Contract.

## Evidence Contract

Worker report records:

```text
Attempt
Worker
Base SHA
Candidate SHA
MCP client SDK version
server SDK version
Node/npm/tmux runtime identity
Actions run/jobs
public tool list result
sanitized health/list/get/read/write/control assertions
marker observation summary
INTERRUPT result summary
external endpoint destruction + mechanical failure result
Claims C1-C10
changed files
known limitations
```

Do not persist unnecessary full terminal transcripts or secrets.

## In Scope

- official MCP client development dependency/harness;
- public stdio integration test;
- disposable bash/tmux fixture owned by test infrastructure;
- six-tool end-to-end validation;
- CI Evidence;
- documentation required to explain the validation path.

## Out of Scope

- Tunnel/provider/network deployment;
- TLS/DNS/firewall/workspace authorization;
- new Channel capabilities;
- new public Tool/schema fields;
- endpoint lifecycle MCP APIs;
- Worker/Task/Issue semantics;
- raw shell/tmux public command API;
- semantic completion/wait API;
- scenario-specific product parser/scheduler;
- automatic follow-up Task creation.

## Success Criteria

Reviewer may ACCEPT only when:

1. C1-C10 have exact Candidate Evidence;
2. the dogfood path uses the public MCP server through the official client SDK;
3. all six accepted Tools are exercised coherently;
4. the bash endpoint is externally prepared and externally destroyed;
5. the upper layer owns marker/application interpretation;
6. `INTERRUPT` is proven through the public control Tool;
7. missing endpoint behavior causes no product-side recreation;
8. no deployment/tunnel concern enters product scope;
9. no seventh Tool/scenario-specific schema is introduced;
10. exact Candidate CI is green.

## Failure / Blocked Rules

BLOCK if:

- the official client cannot exercise the accepted local stdio server;
- the public surface differs materially from the frozen six Tools;
- product-source behavior changes are required to make the scenario pass;
- the only workaround requires new product semantics or lifecycle authority.

Return such Evidence to the Coordinator rather than weakening this Contract.

## Completion Protocol

```text
Coordinator → ready/env:web-gpt
→ separate Web GPT Worker claims exactly one Attempt
→ validation infrastructure + public MCP dogfood + Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ original Coordinator Review
```

Do not automatically create or execute a follow-up Task.
