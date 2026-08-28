# Security

## 1. Security posture

`agent-runtime-mcp` can deliver input to interactive terminals. Write/control capability is therefore powerful even though deployment is outside the product.

Security is split into two responsibilities:

```text
product security
= safe Channel capability semantics

deployment security
= who can reach/use the MCP process over a chosen environment
```

This document defines the first and records the boundary to the second.

## 2. Product trust boundary

```text
MCP request
→ Channel Service
→ ChannelBackend
→ TmuxBackend
→ configured tmux scope
→ existing panes/programs
```

The core assumes an MCP request has reached it through whatever environment the operator selected. It does not own tunnel/provider/workspace authentication policy.

## 3. Primary product threats

### T1 — Backend command injection
Caller-controlled Channel ids or text must not become shell command strings.

### T2 — Text/control confusion
Ordinary text must not smuggle reviewed terminal controls.

### T3 — Overbroad Channel scope
A request must not escape the configured tmux namespace/session allowlist.

### T4 — Arbitrary backend escape hatch
No raw shell/tmux command MCP tool may bypass the Channel contract.

### T5 — Sensitive terminal data
Reads/writes may contain source code, paths, tokens or other sensitive data.

### T6 — Ambiguous mutation retry
A timeout after input may have been delivered must not trigger blind automatic retry.

### T7 — Concurrent write interference
Shared backend transport state must not mix caller payloads or targets.

### T8 — Semantic authority leak
Terminal output must not become Worker/Task/application completion authority.

## 4. Required product controls

### S1 — Structured backend execution
Invoke tmux as executable + argv + explicit stdin/data, never shell-concatenated caller input.

### S2 — Bounded ordinary text
`write_text`:
- accepts bounded Unicode data;
- allows LF and TAB;
- rejects other Unicode `Cc` controls;
- validates the UTF-8 byte bound before backend mutation.

### S3 — Closed control enum
`send_control` accepts exactly:

```text
ENTER
INTERRUPT
ESCAPE
```

### S4 — Explicit backend scope
Read/write/control operate only inside the configured tmux socket/server/account and optional allowlist.

### S5 — Bounded I/O
Reads and writes have finite server-side bounds and backend operations have finite timeouts.

### S6 — No lifecycle authority
The MCP does not create/restart/destroy terminal endpoints as a consequence of failure.

### S7 — Least privilege
Normal Channel operation uses an ordinary OS account and requires no root.

### S8 — Mutation ambiguity
`write_text` and `send_control` are non-idempotent. Ambiguous timeout remains explicit; retry policy belongs outside the product.

### S9 — Per-operation write isolation
Temporary paste buffers or equivalent mutable transport state are isolated per operation and cleaned up best-effort.

### S10 — Sensitive logging discipline
Default logs should prefer operation, Channel id, result category, duration and payload size rather than full terminal content.

### S11 — Untrusted output
Terminal output is data/evidence, not policy or workflow authority.

## 5. Deployment security boundary

If an operator exposes this MCP over a network or shared environment, that deployment must provide suitable authentication, authorization and transport protection.

The product does **not**:
- choose a tunnel/provider;
- provision TLS/DNS/firewall;
- manage workspace permissions;
- issue/rotate deployment credentials;
- prove a particular remote client environment.

Those are deployment concerns, not MVP Claims.

## 6. Error safety

Structured errors should avoid dumping unrelated tmux output or sensitive terminal payloads.

Useful product categories include:

```text
CHANNEL_NOT_FOUND
CHANNEL_UNAVAILABLE
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
INVALID_ARGUMENT
CAPABILITY_UNSUPPORTED
PERMISSION_DENIED
TIMEOUT
```

## 7. Verification baseline

Product acceptance should verify at least:

1. text/metacharacters are transported as data;
2. non-LF/TAB controls are rejected by `write_text`;
3. explicit control is a closed enum;
4. reads/writes are bounded;
5. configured Channel scope is enforced;
6. no raw shell/tmux MCP tool exists;
7. no endpoint lifecycle MCP tool exists;
8. normal operation works without root;
9. default logs avoid full terminal payloads;
10. ambiguous mutation is not blindly retried;
11. concurrent writes remain isolated;
12. terminal output is never interpreted as semantic Task/Agent/application state.
