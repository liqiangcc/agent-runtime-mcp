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

## 2. Phase 0 — Channel boundary freeze

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

## 3. Phase 1 — Tmux channel discovery + bounded read

Implementation Task:

```text
[MVP-001] Tmux channel discovery and bounded read
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

## 4. Phase 2 — Safe channel input

Planned Task:

```text
[MVP-002] Safe channel text and control input
```

Scope:

- `write_text`;
- multi-line Unicode transport;
- safe tmux buffer/input path;
- `submit=true`;
- `send_control` with ENTER / INTERRUPT / ESCAPE;
- duplicate-input/ambiguous-timeout documentation;
- no raw `send-keys` grammar.

Verification focus:

- quotes/backticks/`$`/newlines remain data;
- input is not interpolated through a shell;
- control cannot be injected through text payload;
- selected channel only is affected;
- ambiguous mutation timeout/retry behavior is documented and tested where practical.

Planning rule:

> MVP-002 may be materialized as `status:draft` while MVP-001 executes, but its implementation-specific Contract must be rechecked against the accepted MVP-001 ChannelBackend/channel-id/error/tool-registration surface before Publication Gate.

## 5. Phase 3 — Secure remote MCP ingress

Planned Task:

```text
[MVP-003] Secure remote MCP ingress and client compatibility
```

Scope:

- current supported remote MCP transport from official SDK;
- authenticated/private ingress topology;
- request bounds/timeouts;
- active transport auth/Origin/Host requirements;
- actual remote tool discovery/invocation;
- verify write-capable integration for `write_text`/`send_control`.

If the active client environment cannot invoke required write actions, mark remote-control integration BLOCKED rather than expanding product scope.

## 6. Phase 4 — Upper-layer dogfooding

Use a real upper-layer consumer without moving its semantics into Channel MCP:

```text
upper layer prepares an existing tmux pane + interactive CLI
→ Channel MCP discovers the pane
→ write_text transports an instruction
→ read_channel observes bounded terminal output
→ upper layer interprets its own task/application semantics
```

Acceptance proves:

- Channel MCP does not know Issue/Worker/Task meaning;
- upper layer owns endpoint creation/mapping/recovery;
- terminal transport remains usable remotely;
- terminal output is not treated as project truth by the MCP;
- a missing pane is reported rather than recreated by MCP.

The repository's own default Web GPT Worker workflow does not need to use Channel MCP; dogfooding tests the product as infrastructure for a suitable terminal-based upper layer.

## 7. Deferred / separate products

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

## 8. Task sizing

Implementation Tasks follow stable product capability slices, not upper-layer project workflow primitives.

A different tmux command does not automatically mean a different Task; a stable independently reviewable capability does.

## 9. Publication rule

Before an implementation Task becomes executable:

```text
Goal and product boundary defined
+ task.md / prompt.md committed and read back
+ canonical Channel docs resolve
+ Worker route = separate GPT Web conversation / env:web-gpt unless explicitly overridden
+ capabilities/dependencies explicit
+ GitHub Actions Evidence route sufficient for required executable checks
+ security implications reviewed
+ Success Criteria frozen
+ Publication Gate PASS
```

The Coordinator then emits only the short `docs/tasks/handoffs/web-gpt.md` entry. The Web Worker claims exactly one Attempt and returns durable Evidence to GitHub.
