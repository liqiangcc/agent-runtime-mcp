# MVP Plan

## 1. Strategy

The project establishes both **architecture** and **collaboration/runtime orchestration** contracts before implementing the server.

Implementation proceeds in small Issue-driven slices through:

```text
GPT Web Coordinator
→ Task Publisher
→ Task Dispatcher
→ Task Worker
→ Task Reviewer
```

Runtime implementation sequence:

```text
Runtime semantics
→ tmux discovery
→ bounded observation
→ safe mutation
→ persistent Worker lifecycle
→ secure GPT Web remote ingress
→ runtime-backed Dispatcher dogfooding
```

This avoids building either a generic tmux wrapper or an unsafe remote shell, while using the same collaboration lifecycle that the product is intended to support.

## 2. Phase 0 — Repository and collaboration bootstrap

Deliverables:

- `AGENTS.md`
- canonical design docs
- deployment/security contract
- Issue state/lifecycle protocol
- `Publisher → Dispatcher → Worker → Reviewer` collaboration protocol
- Task/prompt/handoff templates
- `$task-publisher`
- `$task-dispatcher`
- `$task-worker`
- `$task-reviewer`

Bootstrap Dispatcher transport:

```text
Task Dispatcher
→ isolated git worktree
→ native tmux
→ Codex CLI
```

Exit criteria:

- role authorities are explicit and non-overlapping;
- GitHub is durable Task authority;
- Dispatcher launch is distinct from Worker claim;
- one concurrent Issue execution has one isolated mutable worktree/runtime;
- interrupted runtime does not automatically create Attempt N+1;
- runtime/task state separation is explicit;
- remote MCP ingress vs Runtime Backend separation is explicit;
- use-case-first and security baselines are frozen enough to publish implementation Tasks.

## 3. Phase 1 — Runtime core + read-only tmux discovery

First implementation Task:

```text
[MVP-001] Runtime core and tmux worker discovery
```

Scope:

- MCP server/application skeleton using the frozen official SDK stack;
- backend-neutral Worker model;
- runtime registry abstraction;
- tmux backend availability query;
- managed Worker discovery/reconciliation;
- `list_workers`;
- `get_worker`;
- structured errors.

Verification focus:

- managed vs unmanaged distinction;
- stale registry behavior;
- tmux unavailable behavior;
- no Task-state inference.

No terminal input in this phase.

MVP-001 itself should be executed through the repository's bootstrap Dispatcher so the collaboration chain is exercised before runtime dogfooding is possible.

## 4. Phase 2 — Output observation

Suggested Task:

```text
[MVP-002] Bounded worker output capture
```

Scope:

- `capture_output`;
- line/byte bounds;
- truncation metadata;
- terminal text normalization policy;
- no persistent capture history by default.

Verification focus:

- large pane output is bounded;
- Unicode preserved;
- absence of Task-status parsing.

## 5. Phase 3 — Safe input/control

Suggested Task:

```text
[MVP-003] Safe worker text and control input
```

Scope:

- `send_text`;
- safe tmux buffer/stdin path;
- `send_control` with explicit enum;
- Enter / interrupt / escape.

Verification focus:

- multiline Unicode prompt;
- quotes/backticks/`$`/newlines preserved as data;
- prompt text never interpolated into backend shell command;
- special controls cannot be injected through text payload.

This is a security-sensitive gate before Dispatcher can use the runtime as a write transport.

## 6. Phase 4 — Persistent Worker lifecycle

Suggested Task:

```text
[MVP-004] Managed tmux worker lifecycle
```

Scope:

- `create_worker`;
- startup profiles;
- cwd policy;
- persistent registry binding;
- `restart_worker`;
- `destroy_worker`;
- server restart/reconciliation.

Verification focus:

- Worker survives MCP client/server reconnect scenarios while tmux remains alive;
- rediscovery preserves logical identity;
- restart preserves `worker_id` where specified;
- destroy does not affect unrelated tmux sessions;
- invalid cwd/startup policy failures are safe.

After Phase 4, the Dispatcher may begin an **internal local dogfooding migration** from direct tmux lifecycle operations to `agent-runtime-mcp`, provided the required operations are accepted and the migration does not weaken isolation/recovery guarantees.

## 7. Phase 5 — Secure GPT Web remote ingress

Suggested Task:

```text
[MVP-005] Secure remote MCP ingress and ChatGPT compatibility
```

Scope:

- current supported remote MCP HTTP transport via official SDK;
- deployment mode selected from `docs/deployment.md`;
- authenticated ingress / supported secure tunnel integration;
- transport request bounds/timeouts;
- Origin/Host/auth protections required by active transport/SDK;
- real ChatGPT tool discovery/invocation check;
- explicit write-capability compatibility evidence.

Verification focus:

- GPT Web reaches the remote MCP service;
- read tools are discoverable and usable;
- write tools can actually be invoked in the active environment;
- unauthenticated public calls cannot control Workers;
- Worker lifetime remains independent from HTTP/MCP request lifetime.

If required write actions are unavailable, mark remote-control integration `BLOCKED`; do not redefine the goal as read-only.

## 8. Phase 6 — Codex Worker profile and Task correlation

Suggested Task:

```text
[MVP-006] Codex worker profile and GitHub task correlation
```

Scope:

- configured Codex startup profile;
- `set_external_reference`;
- minimal canonical Worker handoff delivery;
- operator diagnostics needed for Issue execution.

The runtime still does not query/mutate GitHub as Task authority.

## 9. Phase 7 — Full runtime-backed Dispatcher dogfooding gate

Use the project itself for one real later Task:

```text
GPT Web Coordinator
→ Task Publisher
→ status:ready + canonical handoff
→ Task Dispatcher
→ agent-runtime-mcp
→ managed Codex Worker
→ Worker claims Issue
→ Attempt N
→ [EXECUTION REPORT]
→ Task Reviewer
→ acceptance/revision
```

Dogfooding must prove:

- GPT Web remote control path is authenticated and operational;
- Dispatcher uses runtime MCP rather than raw tmux for the intended accepted operations;
- one Issue maps to one isolated Worker execution context;
- Dispatcher launch still does not claim the Issue;
- tmux Worker persists across web/request disconnect;
- Coordinator/Dispatcher can recover runtime context through observation;
- Codex uses GitHub as durable Task handoff/state;
- terminal idle/output is not used as acceptance;
- dead runtime + in-progress Issue goes through Reviewer recovery, not auto-redelivery;
- Issue lifecycle closes normally through Final Acceptance.

## 10. Deferred work

Not in initial MVP:

- SSH Runtime Backend;
- Docker Runtime Backend;
- PTY Runtime Backend;
- multi-host scheduling;
- automatic worker-to-task matching;
- runtime-owned automatic Issue claim;
- semantic Codex prompt/idle parser;
- arbitrary raw shell/tmux tool;
- full terminal recording;
- web dashboard;
- distributed leases/locks beyond GitHub Task ownership.

Secure **remote MCP ingress from GPT Web is not deferred**.

## 11. Task sizing rule

Create a new Task when work has independent Scope, Success Criteria, lifecycle/evidence authority, or recoverable deliverable.

Do not split merely because work spans several tmux commands, runtime primitives, CI jobs, files or test environments.

Dispatcher runtime/worktree setup is execution orchestration, not a separate business Task unless it introduces an independently reviewable infrastructure Goal.

## 12. Publication and dispatch rule

Before implementation becomes executable:

```text
Goal defined
+ task.md committed/read back
+ prompt.md committed/read back
+ dependencies explicit
+ required Worker capabilities explicit
+ Success Criteria frozen
+ security/architecture impact checked
+ current external assumptions verified when relevant
+ Publication Gate PASS
+ Status: status:ready
+ Active owner: none
+ canonical Worker handoff emitted
```

Then Dispatcher independently verifies live ready/no-owner/routing state before launching a Worker. Dispatcher launch does not start an Attempt; Worker claim does.

## 13. Development principle

The project should dogfood its **collaboration semantics from MVP-001 onward**, even before it can dogfood its own Runtime transport.

```text
Early development:
Publisher → Dispatcher(native tmux) → Worker → Reviewer

Later development:
Publisher → Dispatcher(agent-runtime-mcp) → Worker → Reviewer
```

Only the execution transport changes.