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

Ordinary text could accidentally be treated as tmux key grammar or terminal control syntax.

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

## 4. Required controls

### S1 — Authenticated remote access

Write-capable remote MCP access must be authenticated and authorized. Private/tunnel connectivity is preferred for local/private hosts when appropriate.

Unauthenticated bind-to-all-interfaces terminal control is forbidden.

### S2 — Structured backend execution

Invoke tmux as:

```text
program + argv + stdin
```

not through shell-concatenated command strings.

### S3 — Text is data

`write_text` transports bytes/text as terminal input data. It must not be interpreted by the MCP service as shell syntax or tmux key names.

### S4 — Closed control enum

`send_control` accepts only reviewed actions such as:

```text
ENTER
INTERRUPT
ESCAPE
```

### S5 — Bounded reads

`read_channel` has finite maximum lines/bytes and explicit truncation. Complete terminal history is not persisted by default.

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

## 5. Secrets and logging

The service must not deliberately return environment dumps, credential files, auth headers or unrelated process data.

Because terminal output itself may contain secrets:

- reads are sensitive by nature;
- avoid persisting full read payloads;
- avoid logging full `write_text` payloads;
- avoid logging auth tokens;
- safe logs should prefer operation, channel_id, result category and duration.

## 6. Error messages

Useful examples:

```text
CHANNEL_NOT_FOUND channel_id=...
BACKEND_UNAVAILABLE tmux query failed
CAPABILITY_UNSUPPORTED control=...
AUTHENTICATION_REQUIRED
TIMEOUT
```

Do not blindly return complete tmux stdout/stderr when it may contain unrelated terminal data.

## 7. Collaboration separation

The Channel MCP does not need GitHub credentials, Issue state or project Task metadata.

An upper-layer Dispatcher may decide which pane represents which Task. That mapping is not stored by the MCP.

## 8. Security verification baseline

Before MVP acceptance, verify at least:

1. multi-line/metacharacter text is delivered as data;
2. control accepts only the closed enum;
3. reads are bounded;
4. channel-not-found/backend-unavailable failures do not mutate unrelated terminal state;
5. configured tmux visibility boundaries are enforced;
6. no raw shell/tmux command MCP tool exists;
7. no session/pane lifecycle MCP tools exist;
8. normal operation works without root;
9. logs omit full write/read/auth payloads by default;
10. remote write/control calls cannot be used anonymously;
11. current transport/auth requirements are verified against the chosen official SDK;
12. terminal output is never interpreted by the service as semantic Task/Agent state.
