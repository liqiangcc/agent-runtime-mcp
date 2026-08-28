# MVP Plan

## 1. Strategy

Build the smallest useful remote terminal communication channel first.

```text
channel discovery
→ bounded read
→ safe text/control write
→ public Channel health
→ secure remote ingress
→ upper-layer dogfooding
```

Do not build Worker registry/lifecycle/scheduler features into the core MCP.

Repository execution remains separate from product scope:

```text
original GPT Web conversation = Coordinator / Reviewer
→ publish Task
→ separate GPT Web conversation = Web Worker using @GitHub
→ GitHub Actions = executable verification Runner / Evidence
→ original GPT Web conversation = Review / Acceptance
```

## 2. Planning discipline

Every Task is planned use-case-first according to `docs/tasks/planning-principles.md`:

```text
Goal
→ Use Case
→ Success / Failure / Degradation
→ Separation Points
→ Single Responsibilities
→ Logic / Control Separation
→ Required Capabilities
→ Claims / Evidence
→ finally Tool / API / implementation mapping
```

Recurring separation:

```text
upper layer
= endpoint lifecycle + application/workflow meaning + orchestration/recovery

Channel MCP
= terminal communication semantics only

remote ingress/auth
= network trust/transport boundary around complete Channel logic

TmuxBackend
= backend-specific terminal mechanics only
```

Implementation-specific details remain behind an Alignment Gate until upstream Candidates are accepted and re-read.

## 3. Phase 0 — Channel boundary freeze

Accepted design establishes:

- Channel as the only core domain object;
- Worker/Task/Issue/worktree/session lifecycle outside the public MCP;
- existing terminal endpoints only;
- bounded read, safe text, explicit control and backend health as Channel capabilities;
- security and repository collaboration as separate concerns.

## 4. Phase 1 — Discovery + bounded read

```text
[MVP-001] Tmux channel discovery and bounded read
Issue #2
```

Status: **accepted and integrated**.

Separation proof:

```text
Channel discovery/read
!= endpoint lifecycle
!= application/Task interpretation
```

Accepted public tools:

```text
list_channels
get_channel
read_channel
```

## 5. Phase 2 — Safe channel input

```text
[MVP-002] Safe channel text and control input
Issue #10
```

Status: **accepted and integrated**.

Accepted main:

```text
1f81527f0687dff535faa27150d70b23dd1af444
```

Primary use cases:

- bounded ordinary Unicode terminal text;
- explicit ENTER / INTERRUPT / ESCAPE.

Key separation:

```text
ordinary text != terminal control
Channel communication logic != retry/workflow/lifecycle control
Channel semantics != tmux mechanics
```

Accepted public additions:

```text
write_text
send_control
```

## 6. Phase 2.5 — Public Channel health

```text
[MVP-002.5] Public Channel health surface
Issue #14
```

Status: **next capability Task / eligible for Publication Gate**.

Why it is separate:

- canonical Channel contract requires public `health`;
- `ChannelBackend.health()` / `TmuxBackend.health()` already exist;
- MVP-002 correctly excluded health because its responsibility was terminal input;
- MVP-003 must consume a complete accepted Channel surface instead of implementing missing Channel capability inside remote ingress.

Primary use case:

> A client can query mechanical backend/service health without treating Channel inventory, pane existence, application readiness or recovery policy as health semantics.

Key separation:

```text
backend/service health
!= channel existence
!= application/Agent status
!= remote-ingress reachability
!= recovery control
```

Target public addition:

```text
health
```

Issue #14 remains small by design because health and remote ingress have different reasons to change.

## 7. Phase 3 — Secure remote MCP ingress

```text
[MVP-003] Secure remote MCP ingress and client compatibility
Issue #11
```

Status: **draft**.

MVP-003 consumes the complete already-accepted Channel surface:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

It must not implement missing Channel capabilities merely because remote integration needs them.

Primary use cases:

- authorized remote Channel operation;
- reject unauthorized terminal authority;
- disconnect/reconnect without owning Channel/pane lifecycle;
- preserve Channel visibility/scope remotely;
- prove intended-client compatibility without distorting product semantics.

Key separation:

```text
network reachable != authenticated != authorized
remote ingress/auth != Channel logic
MCP connection/session lifetime != Channel/tmux lifetime
infrastructure provisioning != product capability
client compatibility evidence != product semantics
ingress failure != Channel failure != backend failure
```

Hard Publication dependencies:

- Issue #14 Final Acceptance;
- current authoritative MCP transport/auth/client verification;
- selected concrete secure topology and credential boundary.

Provider/client/SDK mechanics are frozen only at the live Publication Gate.

## 8. Phase 4 — Upper-layer dogfooding

```text
[MVP-004] End-to-end Channel dogfooding
Issue #12
```

Status: **draft**.

Primary use case: one real upper layer prepares an interactive terminal externally and uses Channel MCP only as secure communication transport.

```text
upper layer
= endpoint lifecycle + application/workflow meaning + retry/recovery/next-step control

Channel MCP
= communication logic only
```

If dogfooding requires the Channel MCP to learn Task/application semantics, that is an architecture failure.

## 9. Deferred / separate products

Not part of core MVP:

- Worker registry/lifecycle;
- tmux session/pane lifecycle;
- process startup profiles;
- Issue/task correlation storage;
- workspace/worktree management;
- scheduler/automatic assignment;
- semantic Agent state parser;
- full terminal recording;
- distributed host management;
- generic shell command API.

If lifecycle automation is later useful, build it as an upper layer consuming Channel MCP.

## 10. Task sizing

Tasks follow independently reviewable use cases/responsibilities, not source files or individual tmux commands.

A Task may be intentionally small when a separation point is important. Issue #14 is the canonical example: public backend health and remote ingress are separate responsibilities.

## 11. Publication rule

Before an implementation Task becomes executable:

```text
Goal defined
+ Primary Use Case defined
+ Success / Failure / Degradation defined
+ Separation Points explicit
+ Single Responsibilities explicit
+ Logic / Control Separation explicit
+ required capabilities derived
+ task.md / prompt.md committed and read back
+ canonical docs resolve
+ Worker route explicit
+ dependencies satisfied
+ GitHub Actions Evidence route sufficient
+ upstream accepted interfaces re-read where required
+ security implications reviewed
+ Success Criteria frozen
+ Publication Gate PASS
```

The Coordinator then emits only the short Web Worker entry. The Worker claims exactly one Attempt and returns durable Evidence to GitHub.
