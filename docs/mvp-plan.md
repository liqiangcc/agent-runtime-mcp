# MVP Plan

## 1. Strategy

Build the smallest useful remote terminal communication channel first.

Product sequence:

```text
channel discovery
→ bounded read
→ safe text/control write
→ secure remote ingress
→ upper-layer dogfooding
```

Do not build Worker registry/lifecycle/scheduler features into the core MCP.

Repository development is separate from product scope and defaults to:

```text
original GPT Web conversation = Coordinator / Reviewer
→ publish Task
→ separate GPT Web conversation = Web Worker using @GitHub
→ GitHub Actions = executable verification Runner / Evidence
→ original GPT Web conversation = Review / Acceptance
```

## 2. Planning discipline

Every future MVP Task is planned use-case-first according to `docs/tasks/planning-principles.md`:

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

Planning must identify the **separation point** before choosing an implementation primitive.

For this project the recurring architectural separation is:

```text
upper layer
= endpoint lifecycle + workflow/application meaning + orchestration/control

Channel MCP
= secure terminal communication logic only

remote ingress/auth
= network trust/transport boundary around Channel logic

TmuxBackend
= backend-specific terminal mechanics only
```

A future Task may be planned as `status:draft` while upstream work executes, but implementation-specific details remain behind an explicit Alignment Gate until the upstream Candidate is finally accepted and re-read.

## 3. Phase 0 — Channel boundary freeze

Deliverables:

- `requirements.md` channel-only product boundary;
- `channel-architecture.md`;
- `channel-model.md`;
- `mcp-contract.md`;
- tmux Channel Backend contract;
- channel-focused security contract;
- repository collaboration docs explicitly separated from product docs.

Exit criteria:

- no Worker/Task/Issue/worktree lifecycle exists in public MCP contract;
- tmux session creation/restart/destruction is explicitly outside core;
- Channel is the only product domain object;
- read/write/control safety semantics are frozen enough to implement.

## 4. Phase 1 — Tmux channel discovery + bounded read

Implementation Task:

```text
[MVP-001] Tmux channel discovery and bounded read
```

Primary use case: an upper layer can observe one already-existing terminal Channel without Channel MCP knowing why the endpoint exists or what its output means.

Key separation proof:

```text
Channel discovery/read logic
!= endpoint lifecycle
!= application/Task interpretation
```

Scope:

- TypeScript/Node MCP server skeleton using the frozen official SDK stack;
- backend-neutral Channel model;
- `ChannelBackend` abstraction;
- `TmuxBackend` structured inventory;
- `list_channels`;
- `get_channel`;
- `read_channel`;
- bounded output/truncation;
- structured errors;
- configurable tmux visibility scope;
- tests + Linux tmux integration + CI.

Explicitly not in scope:

```text
Worker registry
create/restart/destroy
external task references
worktree/session creation
Task semantics
write/control input
```

MVP-001 is published to `env:web-gpt`; executable typecheck/unit/real-tmux verification is supplied by GitHub Actions.

## 5. Phase 2 — Safe channel input

Planned Task:

```text
[MVP-002] Safe channel text and control input
```

Primary use cases:

- send ordinary text as literal terminal data;
- send one explicit terminal control.

Key separation points:

```text
text data != terminal control
Channel communication logic != retry/workflow/lifecycle control
Channel semantics != tmux mechanics
```

Planned public mapping:

- `write_text`;
- `send_control` with ENTER / INTERRUPT / ESCAPE.

Planning rule:

> MVP-002 is materialized as `status:draft` while MVP-001 executes. Before Publication Gate, re-read accepted MVP-001 ChannelBackend/channel-id/error/tool-registration surfaces and align the concrete Contract.

## 6. Phase 3 — Secure remote MCP ingress

Planned Task:

```text
[MVP-003] Secure remote MCP ingress and client compatibility
```

Primary use case: an authorized remote client reaches the same accepted Channel logic through a network trust boundary.

Key separation points:

```text
remote ingress/auth != Channel application logic
infrastructure provisioning != MCP product
client compatibility evidence != product semantics
```

Before publication, re-verify current authoritative remote MCP transport/auth/client write capability and choose the concrete secure topology. Fast-changing provider/client details are not frozen during early planning.

## 7. Phase 4 — Upper-layer dogfooding

Planned Task:

```text
[MVP-004] End-to-end Channel dogfooding
```

Primary use case: one real upper layer prepares an interactive terminal endpoint externally and uses Channel MCP only as secure discovery/read/write/control transport.

Key separation proof:

```text
upper layer
= endpoint lifecycle + application/workflow meaning + retry/recovery/next-step control

Channel MCP
= communication logic only
```

A dogfooding scenario that requires Channel MCP to learn its Task/application semantics is an architecture failure, not successful validation.

Before publication, select the concrete accepted deployment, remote client, externally prepared endpoint, upper-layer scenario, and separate transport Evidence from application/workflow Evidence.

## 8. Deferred / separate products

Not part of core MVP:

- Worker registry;
- Worker lifecycle API;
- tmux session/pane lifecycle API;
- process startup profiles;
- Issue/task correlation storage;
- workspace/worktree management;
- scheduler / automatic assignment;
- semantic Agent state parser;
- full terminal recording;
- distributed host management;
- generic shell command API.

If lifecycle automation is later useful, design it as a separate higher-level capability/module consuming the Channel layer rather than silently redefining the core.

## 9. Task sizing

Implementation Tasks follow coherent use cases/capability slices, not upper-layer workflow primitives, source-file boundaries or individual tmux commands.

Create a separate Task when responsibility, lifecycle, Success Criteria or Evidence authority is independently reviewable.

## 10. Publication rule

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
+ canonical Channel docs resolve
+ Worker route = separate GPT Web conversation / env:web-gpt unless explicitly overridden
+ capabilities/dependencies explicit
+ GitHub Actions Evidence route sufficient for required executable checks
+ upstream accepted interfaces re-read where required
+ security implications reviewed
+ Success Criteria frozen
+ Publication Gate PASS
```

The Coordinator then emits only the short `docs/tasks/handoffs/web-gpt.md` entry. The Web Worker claims exactly one Attempt and returns durable Evidence to GitHub.
