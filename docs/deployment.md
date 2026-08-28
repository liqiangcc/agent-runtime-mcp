# Deployment and Remote Access

## 1. Deployment goal

Expose the Channel MCP securely to a remote MCP client while leaving terminal/session lifecycle outside the service.

```text
MCP client
→ authenticated remote MCP ingress
→ agent-runtime-mcp
→ configured tmux scope
→ existing panes
```

The service does not create the panes it exposes.

## 2. Remote MCP requirement

Remote access is part of MVP because the intended use includes GPT Web or another remote MCP client.

The active implementation must use the currently supported remote MCP transport from the chosen official SDK rather than hand-rolled protocol framing.

Private/local hosts should prefer a supported private-connectivity/tunnel mechanism where appropriate. Direct public exposure requires HTTPS plus explicit authentication/authorization.

## 3. Write-capability gate

The product is not complete as a remote control channel if the active client can only perform read operations.

Before dogfooding, verify live support for:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

If write/control actions are unavailable in the active client/workspace, record the integration as BLOCKED.

## 4. Initial topology

```text
remote MCP client
      │
secure ingress
      │
agent-runtime-mcp
      │
configured tmux socket/server/account
      │
existing panes
```

The MCP service and tmux initially run under the same intended low-privilege account boundary.

## 5. Authentication and authorization

Terminal write/control is privileged. Protected calls require server-side authentication/authorization.

Do not:

- expose unauthenticated write tools publicly;
- place access tokens in URL query strings;
- rely only on client UI confirmation;
- trust arbitrary proxy headers without reviewed configuration.

Follow the active MCP authorization specification and official SDK behavior.

## 6. HTTP security

For network-exposed deployments:

- TLS/HTTPS outside a trusted private tunnel boundary;
- authenticate protected requests;
- validate token/resource scope;
- apply finite request/body bounds;
- apply timeouts;
- follow current Origin/Host guidance from the active transport/SDK;
- expose only the Channel MCP endpoint, not unrelated host services.

## 7. Tmux visibility configuration

Deployment explicitly selects the terminal namespace available to the MCP, such as:

```text
one tmux socket/server
one OS account
optional allowed session-name pattern/list
```

This configuration is the primary authority boundary for what panes can be listed/read/written.

The service does not keep a Worker registry or Issue mapping.

## 8. External lifecycle preparation

A human or upper-layer automation prepares terminals before use, for example:

```text
create workspace
→ create tmux session/pane
→ start desired interactive program
→ Channel MCP discovers it
```

Installation of tmux, starting Codex, creating worktrees, session restart and cleanup are deployment/orchestration responsibilities outside the core MCP.

## 9. Lifetime semantics

```text
MCP request lifetime
!= tmux pane lifetime
```

A pane may continue running after clients disconnect. The MCP later rediscovers whatever panes currently exist in configured scope.

No persistent logical Worker identity is promised across pane destruction/recreation.

## 10. Compatibility checks

Because MCP/ChatGPT integration evolves, implementation and deployment Tasks must verify current official documentation for:

- supported remote transport;
- authentication/authorization requirements;
- write/modify tool support;
- tunnel/private-connectivity options where applicable;
- current SDK behavior.
