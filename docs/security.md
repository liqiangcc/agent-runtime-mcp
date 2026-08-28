# Security

## 1. Security posture

`agent-runtime-mcp` can deliver input to interactive terminals. Write access is therefore approximately equivalent to terminal-input authority over every exposed Channel within the service account's permissions.

This is privileged developer tooling, not a low-risk observability endpoint.

## 2. Trust boundaries

Selected MVP remote composition:

```text
remote OpenAI MCP client / ChatGPT workspace
   ↓
workspace + tunnel authorization
   ↓
OpenAI Secure MCP Tunnel
   ↓
customer-run tunnel-client
   ↓
local stdio agent-runtime-mcp
   ↓
Channel Service
   ↓
TmuxBackend
   ↓
configured tmux scope
   ↓
existing panes / programs
```

Project collaboration systems and GitHub remain separate trust boundaries.

## 3. Primary threats

### T1 — Unauthorized remote terminal control

A caller that can use write/control tools can inject terminal input into exposed Channels.

### T2 — Backend command injection

Untrusted channel identifiers or text interpolated into shell strings could execute in the MCP service context.

### T3 — Text/control confusion

Ordinary text could be treated as tmux key grammar or carry ESC/interrupt-like controls that bypass the reviewed `send_control` enum.

### T4 — Sensitive output exposure

Terminal reads may contain tokens, private paths, source code, credentials or other sensitive data.

### T5 — Overbroad Channel scope

A misconfigured backend could expose unrelated tmux sessions/panes.

### T6 — Arbitrary backend escape hatch

A raw tmux/shell command tool would bypass the Channel API boundary.

### T7 — Prompt injection in terminal output

Read output is untrusted data and may contain adversarial instructions.

### T8 — Remote ingress/tunnel authorization misconfiguration

Incorrect workspace, tunnel or connector permissions could grant terminal authority to unintended callers.

### T9 — Ambiguous mutation retry

A timeout after terminal input may have been delivered can cause duplicates if blindly retried.

### T10 — Cross-write interference

Shared backend transport state can corrupt or redirect concurrent writes.

### T11 — Credential over-privilege or leakage

Using a broad administrative OpenAI/tunnel key as the long-lived tunnel runtime credential increases blast radius; persisting it in repository/chat/logs leaks deployment authority.

## 4. Required controls

### S1 — Authorized remote composition

Write-capable remote access must pass a reviewed authorization boundary before reaching Channel operations.

For the selected MVP, this can be provided by the OpenAI Secure MCP Tunnel/workspace permission model around a local stdio MCP server. The Channel core does **not** need to expose an unauthenticated/public listener.

Unauthenticated public terminal control is forbidden.

### S2 — Least-privilege tunnel credentials

The long-lived `tunnel-client` runtime credential must use only the minimum current tunnel permissions required for runtime operation (for example tunnel Read/Use when that is the active platform model).

Administrative/management credentials used to create/update/delete tunnels remain separate and are not used as the normal daemon credential.

Exact permission names/capabilities must be re-verified immediately before deployment.

### S3 — Secret handling

Never persist real remote-ingress credentials in:

- repository files;
- GitHub Issues/comments;
- Task Packages/prompts;
- CI artifacts/logs;
- terminal examples captured as project evidence.

Use deployment secret injection/environment mechanisms outside source control.

### S4 — Structured backend execution

Invoke tmux as:

```text
program + argv + stdin/data
```

not through shell-concatenated command strings.

### S5 — Ordinary text is a bounded data type

`write_text` transports bounded Unicode terminal text. The service does not interpret it as shell syntax or tmux key grammar.

- LF and TAB are allowed;
- other Unicode `Cc` controls are rejected before backend execution;
- ESC/interrupt go through `send_control`;
- UTF-8 byte bounds are validated before mutation.

### S6 — Closed control enum

`send_control` accepts only:

```text
ENTER
INTERRUPT
ESCAPE
```

Backend key mappings are fixed constants.

### S7 — Bounded I/O

`read_channel` and `write_text` have finite bounds. Complete terminal history is not persisted by default.

### S8 — Explicit backend scope

Deployment defines the tmux namespace the Channel service may see/control. Remote tunnel/workspace authorization must not widen this backend scope.

### S9 — No lifecycle authority

The Channel core does not create, restart, destroy or recover tmux sessions/panes/processes.

A remote tunnel disconnect is not permission to restart endpoints.

### S10 — Least-privilege local process

Run Channel MCP under an ordinary OS account with only the permissions needed for the configured tmux namespace. Normal operation requires no root.

### S11 — Untrusted output handling

Terminal output is evidence/data, not policy authority.

### S12 — Mutation ambiguity is explicit

`write_text` and `send_control` are non-idempotent. If timeout/failure occurs after input may have been accepted, the core does not automatically retry or claim definitive non-delivery unless provable.

### S13 — Per-operation backend data isolation

Temporary tmux write resources are operation-specific or equivalently isolated so concurrent callers cannot overwrite/mix payloads or targets.

### S14 — Direct-public HTTP is a separate security mode

If a future deployment adds a directly exposed Streamable HTTP MCP endpoint, it must follow the then-current MCP transport/authorization specification and official SDK behavior. The direct MCP server should be protected as an OAuth resource server where required; query-string secrets, UI-only confirmation and ad-hoc bearer-token schemes are not substitutes for the reviewed authorization model.

This direct-public mode is not required for the selected tunnel-first MVP.

## 5. Logs and diagnostics

Safe logs should prefer:

```text
operation
channel_id
result category
payload size
latency
sanitized tunnel/connection identifier if needed
```

Avoid logging:

- full terminal read/write payloads;
- tunnel/API/admin credentials;
- auth headers;
- complete backend stderr that may contain unrelated sensitive text.

## 6. Failure boundaries

```text
tunnel/control-plane unavailable
= remote ingress failure

tunnel/workspace authorization rejected
= remote authority failure

local MCP process unavailable
= local deployment/service failure

CHANNEL_NOT_FOUND / BACKEND_UNAVAILABLE / TIMEOUT
= Channel/backend mechanical failures

application rejected input
= outside Channel MCP knowledge
```

Do not turn one layer's failure into another layer's authority or recovery action.

## 7. Collaboration separation

Channel MCP does not need GitHub credentials, Issue state or Task metadata.

The repository collaboration model and Secure MCP Tunnel deployment credentials are separate from the public Channel protocol.

## 8. Security verification baseline

Before MVP remote acceptance, verify at least:

1. multi-line/metacharacter text is delivered as data;
2. non-LF/TAB `Cc` controls are rejected by `write_text`;
3. control accepts only the closed enum;
4. reads/writes are bounded;
5. Channel/backend failures do not mutate unrelated terminal state;
6. tmux visibility boundaries are enforced for read/mutation;
7. no raw shell/tmux command MCP tool exists;
8. no session/pane lifecycle MCP tools exist;
9. normal local operation works without root;
10. logs omit full terminal/auth payloads;
11. ambiguous mutation retry behavior is explicit;
12. concurrent writes remain isolated;
13. intended remote client cannot use the tunnel without the required authorization;
14. tunnel runtime credential is least-privilege and separate from management/admin authority;
15. no real credential is persisted in repository/Evidence;
16. tunnel disconnect/reconnect does not create/restart/destroy tmux panes;
17. remote path preserves the accepted six-tool Channel contract and backend scope;
18. current OpenAI tunnel/client permission requirements are re-verified at Publication/Acceptance time;
19. terminal output is never interpreted by the service as semantic Task/Agent state.
