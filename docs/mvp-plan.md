# MVP Plan

## 1. Strategy

The project establishes collaboration and architecture contracts before implementing the server.

Implementation then proceeds in small Issue-driven slices that can be independently reviewed and recovered.

The sequence deliberately separates:

```text
Runtime semantics
→ tmux backend behavior
→ safe mutation
→ persistent lifecycle
→ secure GPT Web remote ingress
→ Codex dogfooding
```

This avoids prematurely building either a generic tmux wrapper or an unsafe public remote shell.

## 2. Phase 0 — Repository bootstrap

Deliverables:

- `AGENTS.md`
- canonical design docs
- deployment/security contract
- Issue lifecycle protocol
- Task/prompt templates
- Codex task-worker skill

Exit criteria:

- GPT Web Coordinator / Codex Worker responsibilities are explicit;
- GitHub is defined as durable Task authority;
- runtime/task state separation is explicit;
- remote MCP ingress vs Runtime Backend separation is explicit;
- use-case-first design and security baseline are frozen enough to publish implementation Tasks.

## 3. Phase 1 — Runtime core + read-only tmux discovery

Suggested first implementation Task:

```text
[MVP-001] Runtime core and tmux worker discovery
```

Scope:

- MCP server/application skeleton using a current official SDK;
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

This is a security-sensitive gate before real Codex dispatch.

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
- Origin/Host/auth protections required by the active MCP transport/SDK;
- real ChatGPT tool discovery/invocation check;
- explicit write-capability compatibility evidence.

Verification focus:

- ChatGPT Web reaches the remote MCP service;
- read tools are discoverable and usable;
- write tools can actually be invoked in the active ChatGPT environment;
- unauthenticated public calls cannot control Workers;
- Worker lifetime remains independent from HTTP/MCP request lifetime.

If current ChatGPT/workspace capability exposes only read/fetch operations, mark write-control integration `BLOCKED`; do not call the remote-control MVP complete.

## 8. Phase 6 — External reference + real Codex Worker

Suggested Task:

```text
[MVP-006] Codex worker profile and GitHub task correlation
```

Scope:

- configured Codex startup profile;
- `set_external_reference`;
- minimal Task bootstrap delivery;
- operator diagnostics needed for real Issue execution.

The runtime still does not query/mutate GitHub as Task authority.

## 9. Phase 7 — Dogfooding gate

Use the project itself for one real Issue-driven Attempt:

```text
GPT Web Coordinator
→ read/publish next implementation Issue through GitHub
→ remotely find/create managed Codex Worker through agent-runtime-mcp
→ send Task bootstrap
→ Codex claims and executes Issue
→ Codex posts [EXECUTION REPORT]
→ GPT Web reviews GitHub evidence
```

Dogfooding acceptance must prove:

- GPT Web remote control path is authenticated and operational;
- tmux Worker remains persistent across web/request disconnect;
- Coordinator can recover runtime context through observation;
- Codex uses GitHub as the durable Task handoff;
- terminal `idle`/output is not used as Task acceptance;
- Issue lifecycle closes normally through Coordinator review.

## 10. Deferred work

Not in initial MVP:

- SSH Runtime Backend;
- Docker Runtime Backend;
- PTY Runtime Backend;
- multi-host scheduling;
- automatic worker-to-task matching;
- automatic Issue claim by runtime server;
- semantic Codex prompt/idle parser;
- arbitrary raw shell/tmux tool;
- full terminal recording;
- web dashboard;
- distributed leases/locks beyond GitHub Task ownership.

Secure **remote MCP ingress from GPT Web is not deferred**.

## 11. Task sizing rule

Prefer a new Task when work has independent:

- Scope;
- success criteria;
- implementation/review lifecycle;
- evidence requirement;
- recoverable deliverable.

Do not split Tasks merely because several tmux commands, test environments or source files are involved.

## 12. Publication rule

Before an implementation Task becomes `status:ready`:

```text
Goal defined
+ task.md committed
+ prompt.md committed
+ dependencies explicit
+ success criteria frozen
+ security/architecture impact checked
+ current external integration assumptions verified when relevant
+ expected Codex entry defined
+ GitHub read-back verified
```

Only then should the GPT Web Coordinator hand it to a Codex Worker.