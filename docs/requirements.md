# Requirements

## 1. Product goal

Provide a secure MCP communication channel for already-existing interactive terminal endpoints.

The Channel core lets an MCP client:

```text
discover channel
→ inspect channel metadata
→ read bounded recent output
→ write ordinary text
→ send a small explicit set of controls
→ inspect backend/service health
```

The first backend is tmux.

The product boundary is **terminal Channel communication**, not Worker management, Agent scheduling, Task coordination, repository workspace management, tmux lifecycle automation, or infrastructure provisioning.

## 2. Intended composition

A higher-level system may prepare a terminal however it wants:

```text
create worktree
→ create tmux session/pane
→ start Codex / shell / REPL / another CLI
→ use agent-runtime-mcp as the communication path
```

Those preparation steps are outside Channel MCP.

Remote use composes around the same Channel core:

```text
remote MCP client
→ supported secure ingress / tunnel
→ local agent-runtime-mcp transport
→ Channel Service
→ TmuxBackend
→ existing pane
```

For the selected MVP topology, the Channel core may remain a local **stdio MCP server** while an external supported Secure MCP Tunnel makes it reachable remotely. A public HTTP listener inside `agent-runtime-mcp` is not required merely to satisfy the remote-use case.

## 3. Core use cases

### UC0 — Secure remote composition

An authorized remote MCP client can use the accepted Channel surface through a currently supported secure remote MCP composition without exposing unauthenticated terminal-input authority.

Remote reachability is a deployment property around the Channel core; it does not need to become a second Channel implementation.

### UC1 — Discover channels

List existing terminal Channels visible within the configured backend boundary.

Results are structured; callers do not parse human `tmux ls` output.

### UC2 — Inspect a channel

Return mechanical metadata for one Channel, such as backend, availability, optional cwd/title and supported capabilities.

The MCP does not classify semantic Agent/Task state.

### UC3 — Read channel output

Read a bounded amount of recent terminal output with explicit truncation metadata.

### UC4 — Write ordinary text

Send bounded multi-line Unicode text as data to a selected Channel without shell interpolation or accidental tmux-key interpretation.

Text/control separation is explicit:

- LF (`\n`) and TAB (`\t`) are allowed ordinary text characters;
- other Unicode `Cc` controls are rejected by `write_text` so ESC/interrupt-like controls cannot bypass `send_control`;
- `submit=false` means the MCP appends no additional Enter;
- `submit=true` performs text delivery first, then adds one explicit Enter only after successful text delivery.

### UC5 — Send explicit control input

Support exactly:

```text
ENTER
INTERRUPT
ESCAPE
```

Free-form terminal/tmux key grammar is not ordinary text input.

### UC6 — Check backend/service health

Return mechanical backend/service health independently from:

- Channel existence/inventory;
- foreground application readiness;
- Agent/Worker/Task state;
- remote tunnel/network reachability;
- recovery decisions.

## 4. Required MVP capabilities

```text
inventory
channel-inspection
bounded-read
text-write
control-input
backend-health
secure-remote-composition
```

`secure-remote-composition` means the accepted Channel core can be used through a supported authenticated remote path. It does **not** require the Channel core itself to own the public network ingress.

Not required:

```text
worker-registry
worker-create
worker-restart
worker-destroy
external-task-reference
worktree-management
process-startup
session-lifecycle
scheduler
host-admin-api
public-http-listener-in-core
```

## 5. Channel semantics

Canonical domain model: `docs/channel-model.md`.

Key requirements:

- Channel identity is backend-neutral at the MCP boundary;
- tmux target syntax is not required from normal callers;
- Channel state is mechanical (`available | unavailable | unknown`);
- no semantic `idle`, `busy`, `working`, `done`, `blocked`, or review state;
- output and input are bounded;
- last activity, if exposed, is an I/O observation only;
- missing facts degrade to unknown rather than being inferred from terminal prose.

## 6. Explicit product boundary

The Channel core must not own or interpret:

- Worker identity or lifecycle;
- Agent type;
- GitHub Issue/Task/Attempt state;
- project priority/scheduling;
- Task assignment/claim;
- success/acceptance/review decisions;
- git worktree/branch/PR lifecycle;
- tmux session/pane creation policy;
- process startup/restart/recovery policy;
- cleanup policy;
- tunnel/provider account provisioning;
- DNS/firewall/OS service administration.

A higher-level collaboration or deployment system may compose these concerns with Channel MCP.

## 7. tmux lifecycle boundary

For MVP, tmux Channels are prepared outside the MCP.

The service may discover and communicate with already-existing panes, but it does not perform:

```text
new-session
new-window
split-window
kill-session
kill-pane
start Codex
restart Codex
create worktree
```

If a Channel disappears, return a structured failure; do not recreate it.

## 8. Backend visibility policy

Deployment defines the tmux namespace visible to the service, for example:

- configured tmux socket/server;
- operating-system account boundary;
- optional session-name/filter allowlist.

Remote ingress authorization does not widen this Channel/backend scope.

## 9. Remote composition requirements

MVP remote use must satisfy all of the following:

- use a currently supported remote MCP integration path;
- authorize terminal-capable access before protected Channel operations are exercised;
- preserve the accepted six-tool Channel contract across the remote boundary;
- keep remote connection/tunnel lifetime independent from tmux pane lifetime;
- avoid unauthenticated public terminal control;
- verify current client write/modify capability at Publication Gate;
- verify current tunnel/transport/auth behavior from authoritative sources near execution time.

### Selected MVP topology

The preferred current topology is:

```text
ChatGPT / supported OpenAI remote MCP client
→ OpenAI Secure MCP Tunnel
→ customer-run tunnel-client
→ local stdio agent-runtime-mcp
→ TmuxBackend
→ existing panes
```

This topology keeps the Channel core local and avoids a public inbound MCP listener on the terminal host.

### Direct-public HTTP alternative

A future direct-public MCP endpoint may use the then-current supported Streamable HTTP transport and authorization model. If implemented, it is a distinct transport/deployment concern and must satisfy the current MCP HTTP/auth resource-server requirements. It is **not** required for the selected MVP topology.

## 10. Security requirements

Terminal write access is approximately terminal-input authority for every exposed Channel.

Therefore:

- remote write/control must be authenticated and authorized by the selected remote composition;
- backend commands use structured argv/process APIs and explicit stdin/data paths, not shell string concatenation;
- ordinary text is transported as bounded data;
- ordinary text cannot smuggle explicit ESC/interrupt controls through the text API;
- control input is a closed enum;
- reads are bounded and potentially sensitive;
- service logs do not record full terminal text/write payloads by default;
- Channel core runs with ordinary least-privilege OS permissions;
- no root is required for normal Channel operation;
- tunnel/control-plane/admin credentials are deployment secrets and are never persisted in the repository.

See `docs/security.md`.

## 11. Operational requirements

Structured Channel/backend failures include categories such as:

```text
CHANNEL_NOT_FOUND
CHANNEL_UNAVAILABLE
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
INVALID_ARGUMENT
CAPABILITY_UNSUPPORTED
PERMISSION_DENIED
TIMEOUT
AUTHENTICATION_REQUIRED
```

Remote ingress/tunnel/auth failures remain attributable to the ingress layer; they are not silently rewritten as Channel/backend failures.

Operations have finite input/output bounds and finite timeouts and do not wait for semantic completion.

Mutation calls are non-idempotent. An ambiguous timeout must not trigger a blind automatic retry inside the Channel core.

## 12. Non-goals

The MVP does not attempt to:

- replace GitHub/Jira/another collaboration system;
- manage Agent Workers;
- choose or assign Tasks;
- infer Agent completion from terminal output;
- start/restart/destroy terminal sessions;
- create repository workspaces;
- provide a generic host-admin API;
- expose arbitrary tmux command grammar;
- store complete terminal history;
- manage distributed execution hosts;
- provision tunnel/provider accounts as Channel tools;
- require a direct-public HTTP/OAuth server inside Channel core.

## 13. MVP success criteria

The first usable version is successful when an authorized intended remote MCP client can, through the selected secure composition:

1. discover an already-existing tmux pane as a Channel;
2. inspect that Channel through structured metadata;
3. read bounded recent output;
4. write bounded multi-line Unicode text safely as ordinary data;
5. send Enter/interrupt/escape explicitly;
6. query mechanical backend/service health;
7. receive structured Channel/backend failures when the pane/backend disappears;
8. disconnect/reconnect and rediscover currently existing panes without a Worker registry or endpoint lifecycle side effect;
9. perform the above without knowing Codex, Worker, Issue, Task, worktree, or collaboration semantics;
10. prevent unauthorized remote terminal authority;
11. demonstrate one upper-layer collaboration flow using Channel MCP purely as transport, with all Task meaning remaining outside the product.
