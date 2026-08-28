# Security

## 1. Security posture

`agent-runtime-mcp` can deliver input to interactive terminals. Write access is therefore approximately equivalent to terminal-input authority over every exposed Channel within the service account's permissions.

This is privileged developer tooling, not a low-risk observability endpoint.

## 2. Trust boundaries

```text
MCP client
   ↓
remote MCP ingress
   ↓
Channel Service
   ↓
TmuxBackend
   ↓
configured tmux scope
   ↓
existing panes / programs
```

Project collaboration systems and GitHub are separate trust boundaries and are not required by the Channel service.

## 3. Primary threats

### T1 — Unauthenticated remote channel control

An attacker reaching write/control tools could inject terminal input into exposed panes.

### T2 — Backend command injection

Untrusted channel identifiers or text interpolated into shell strings could execute in the MCP service context.

### T3 — Text/control confusion

Ordinary text could accidentally be treated as tmux key grammar or could carry ESC/interrupt-like control bytes that bypass the reviewed `send_control` enum.

### T4 — Sensitive output exposure

Terminal reads may contain tokens, private paths, source code, credentials or other sensitive data.

### T5 — Overbroad channel scope

A misconfigured backend could expose unrelated tmux sessions/panes beyond the intended namespace.

### T6 — Arbitrary backend escape hatch

A raw tmux/shell command tool would bypass the reviewed channel API boundary.

### T7 — Prompt injection in terminal output

Read output is untrusted data and may contain instructions intended to manipulate the MCP client/Agent.

### T8 — Transport/auth misconfiguration

Incorrect TLS, token, Origin/Host or proxy configuration could bypass intended access controls.

### T9 — Ambiguous mutation retry

A timeout after terminal input may have been delivered can cause duplicate text/control if the core or client blindly retries.

### T10 — Cross-write interference

A shared backend transport resource can corrupt or redirect concurrent writes if per-operation data is not isolated.

## 4. Required controls

### S1 — Authenticated remote access

Write-capable remote MCP access must be authenticated and authorized. Private/tunnel connectivity is preferred for local/private hosts when appropriate.

Unauthenticated bind-to-all-interfaces terminal control is forbidden.

### S2 — Structured backend execution

Invoke tmux as:

```text
program + argv + stdin/data
```

not through shell-concatenated command strings.

### S3 — Ordinary text is a bounded data type

`write_text` transports bounded Unicode terminal text. The service must not interpret it as shell syntax or tmux key grammar.

To preserve the separate explicit-control API:

- LF (`\n`) and TAB (`\t`) are allowed;
- other Unicode `Cc` control characters are rejected before backend execution;
- ESC/interrupt must therefore go through `send_control` rather than being smuggled as text;
- the implementation validates the UTF-8 byte bound before mutation.

`submit=false` means no additional Enter is appended by the MCP. It does not guarantee that an application will ignore caller-supplied LF characters.

### S4 — Closed control enum

`send_control` accepts only reviewed actions:

```text
ENTER
INTERRUPT
ESCAPE
```

Backend key mappings are fixed constants, not caller-provided key grammar.

### S5 — Bounded I/O

`read_channel` has finite maximum lines/bytes and explicit truncation.

`write_text` has a finite UTF-8 byte maximum. Oversized or invalid ordinary-text payloads fail before backend mutation.

Complete terminal history is not persisted by default.

### S6 — Explicit backend scope

Deployment defines the tmux namespace the service may see/control. Optional allowlists/filters should be supported when practical.

The MCP must not expand to other tmux sockets/accounts/hosts implicitly.

### S7 — No lifecycle authority

The core Channel MCP does not create, restart, destroy or recover tmux sessions/panes/processes. This removes a class of destructive cross-session risks from the core product.

### S8 — Least privilege

Run as an ordinary OS account with only the permissions needed for the configured tmux namespace. Normal operation does not require root.

### S9 — Untrusted output handling

Terminal output is evidence/data, not policy authority. An Agent consuming it must not follow instructions that conflict with system policy, explicit user intent or its upper-layer project contract.

### S10 — Standards-compatible remote MCP auth

Follow the active MCP transport/authorization specification and official SDK behavior. Do not put access tokens in URL query strings or rely only on UI confirmation.

### S11 — Mutation ambiguity is explicit

`write_text` and `send_control` are non-idempotent.

If timeout/failure occurs after the backend may have accepted input, the core must not automatically retry or report definitive non-delivery unless it can prove it. Retry/recovery belongs to the upper layer.

### S12 — Per-operation backend data isolation

If the tmux implementation uses paste buffers or another shared transport resource, each write uses an operation-specific isolated resource or an equivalent mechanism that prevents concurrent caller payloads from overwriting/mixing with each other.

Temporary internal transport resources should be deleted after successful use and cleaned up best-effort on failure without hiding the primary mutation result.

## 5. Secrets and logging

The service must not deliberately return environment dumps, credential files, auth headers or unrelated process data.

Because terminal I/O itself may contain secrets:

- reads are sensitive by nature;
- avoid persisting full read payloads;
- avoid logging full `write_text` payloads;
- avoid logging auth tokens;
- safe logs should prefer operation, channel_id, result category, payload size and duration rather than payload content.

## 6. Error messages

Useful examples:

```text
CHANNEL_NOT_FOUND channel_id=...
BACKEND_UNAVAILABLE tmux operation failed
CAPABILITY_UNSUPPORTED control=...
INVALID_ARGUMENT text contains unsupported control characters
AUTHENTICATION_REQUIRED
TIMEOUT
```

Do not blindly return complete tmux stdout/stderr when it may contain unrelated terminal data.

## 7. Collaboration separation

The Channel MCP does not need GitHub credentials, Issue state or project Task metadata.

An upper layer may decide which pane represents which Task/application. That mapping is not stored by the MCP.

## 8. Security verification baseline

Before MVP acceptance, verify at least:

1. multi-line/metacharacter text is delivered as data;
2. non-LF/TAB Unicode `Cc` controls are rejected by `write_text`;
3. control accepts only the closed enum;
4. reads and writes are bounded;
5. channel-not-found/backend-unavailable failures do not mutate unrelated terminal state;
6. configured tmux visibility boundaries are enforced for read and mutation;
7. no raw shell/tmux command MCP tool exists;
8. no session/pane lifecycle MCP tools exist;
9. normal operation works without root;
10. logs omit full write/read/auth payloads by default;
11. mutation retry ambiguity is explicit and no blind automatic retry exists;
12. concurrent write transport cannot cross-contaminate payloads/targets;
13. remote write/control calls cannot be used anonymously;
14. current transport/auth requirements are verified against the chosen official SDK;
15. terminal output is never interpreted by the service as semantic Task/Agent state.
