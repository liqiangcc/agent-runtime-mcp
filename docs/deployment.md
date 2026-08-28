# Deployment and Remote Access

## 1. Why this is part of MVP

The product goal is not only local tmux automation. The intended path is:

```text
GPT Web
→ remote MCP connection
→ agent-runtime-mcp on the runtime host
→ tmux
→ Codex Worker
```

Therefore **remote MCP ingress is an MVP requirement**.

This is different from a future `SshBackend`:

```text
remote MCP ingress
= how GPT Web reaches agent-runtime-mcp

RuntimeBackend
= how agent-runtime-mcp controls the Worker runtime
```

MVP may run `agent-runtime-mcp` and tmux on the same host while still exposing the MCP server to GPT Web through a secure remote connection.

## 2. ChatGPT integration constraint

Current OpenAI product documentation states that ChatGPT connects to **remote MCP servers**, not directly to an arbitrary local stdio MCP server.

For an MCP server running on a private network, on-premises machine or developer machine, OpenAI documents a **Secure MCP Tunnel** option so the server can be connected without directly exposing it to the public internet.

Current product support for write/modify MCP actions is also plan/workspace dependent and can change. Since this project needs actions such as `send_text`, `send_control`, `restart_worker` and `destroy_worker`, deployment must include a **ChatGPT write-capability compatibility gate** before dogfooding.

A read-only ChatGPT MCP integration can validate `list_workers`/`get_worker`/`capture_output`, but it cannot satisfy the core remote-control goal.

## 3. Preferred deployment topology

Initial preferred topology:

```text
ChatGPT Web
     │
     │ authenticated MCP connection
     ▼
Secure ingress / tunnel
     │
     ▼
agent-runtime-mcp
(runtime host)
     │
     ▼
tmux server
     │
     ▼
Codex Workers
```

The Runtime MCP service and tmux should initially run on the same trusted host/account boundary. Remote multi-host execution is deferred.

## 4. Transport

The remote server should target the current standard MCP HTTP transport supported by the chosen official SDK and ChatGPT integration.

As of the 2026-07-28 MCP specification generation, the protocol has a stateless HTTP-oriented core and current SDKs provide Streamable HTTP support/compatibility paths.

Implementation must not hand-roll protocol framing when an official/current MCP SDK can provide transport compatibility.

The transport layer is separate from Runtime state:

```text
MCP request lifetime
!= Worker lifetime
```

A Codex/tmux Worker remains persistent after the web request/client connection ends.

## 5. Authentication and authorization

Remote runtime control is shell-equivalent authority and therefore requires authenticated ingress.

Preferred order:

1. Secure MCP Tunnel or another officially supported private-connectivity mechanism when available and appropriate.
2. Otherwise, HTTPS remote MCP endpoint with standards-compatible authentication/authorization.
3. Never expose an unauthenticated runtime-control endpoint directly to the public internet.

When HTTP MCP authorization is implemented, follow the current MCP authorization specification and official SDK behavior rather than inventing custom bearer-token query parameters or ad-hoc auth semantics.

Deployment must scope access to the intended user/workspace/runtime. UI confirmation in ChatGPT is defense-in-depth, not the server's authorization boundary.

## 6. HTTP security requirements

For any directly hosted HTTP MCP endpoint:

- TLS/HTTPS outside a strictly local tunnel boundary;
- validate expected Origin/Host behavior according to the active MCP transport specification/SDK;
- authenticate every protected request;
- reject invalid/expired credentials;
- do not put access tokens in URL query strings;
- apply finite request/body/tool input bounds;
- apply server-side timeouts;
- avoid exposing unrelated host services through the MCP process;
- rate-limit/restrict destructive actions when appropriate.

## 7. Deployment modes

### Mode A — Secure tunnel to private runtime host (preferred for early dogfooding)

```text
ChatGPT
→ supported secure MCP tunnel
→ localhost/private agent-runtime-mcp
→ local tmux
```

Benefits:

- avoids public direct exposure of a shell-equivalent service;
- preserves local tmux/operator access;
- simpler initial trust boundary.

Exact tunnel installation/configuration is operational integration work and must be verified against current OpenAI documentation at implementation time.

### Mode B — Authenticated public HTTPS endpoint

```text
ChatGPT
→ HTTPS reverse proxy / gateway
→ authenticated MCP endpoint
→ agent-runtime-mcp
→ local tmux
```

Requires explicit design/review for:

- identity provider / OAuth integration;
- token audience/scopes;
- proxy trust headers;
- TLS lifecycle;
- rate limiting;
- audit logging;
- public attack surface.

Do not use this mode merely because binding `0.0.0.0` is easier.

## 8. Initial host model

MVP:

```text
one runtime host
one configured tmux server/account boundary
multiple managed Codex Workers
```

The MCP service should run without root and only inherit the permissions intentionally granted to the Worker account.

A future multi-host model can add host identity and backend routing separately.

## 9. Compatibility Gate

Before publishing the dogfooding Task, verify live current integration capabilities:

```text
ChatGPT Web can register/connect the MCP endpoint
+ required tool actions are visible
+ write/modify tool calls are enabled for the active workspace/account
+ authentication remains valid across normal use
+ list/get/capture work remotely
+ send_text/send_control can be invoked remotely
```

If write actions are unavailable in the active ChatGPT environment, mark remote-control dogfooding `BLOCKED`; do not weaken the product goal to read-only and call the MVP complete.

## 10. References to re-check at implementation time

Because ChatGPT/MCP integration is evolving quickly, implementation Tasks must verify the live official documentation rather than freezing product-plan assumptions in code.

Relevant authorities:

- OpenAI Help Center: ChatGPT developer mode / MCP apps / remote MCP / Secure MCP Tunnel.
- Model Context Protocol current specification: transport and authorization.
- Official MCP SDK documentation for the selected implementation language/version.