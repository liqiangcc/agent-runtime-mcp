# Deployment and Remote Access

## 1. Deployment goal

Expose the Channel MCP securely to a remote MCP client while leaving terminal/session lifecycle outside the service.

```text
MCP client
→ network reachability
→ authentication / authorization boundary
→ remote MCP ingress
→ unchanged Channel service
→ configured tmux scope
→ existing panes
```

The service does not create the panes it exposes.

## 2. Core separation points

Remote deployment must preserve these separations:

```text
network reachable
!= authorized

authentication
!= authorization

MCP connection/session lifetime
!= Channel lifetime
!= tmux pane lifetime

remote ingress failure
!= Channel failure
!= backend failure
!= application failure

infrastructure provisioning
!= Channel MCP product capability
```

These are authority boundaries, not implementation details.

## 3. Remote MCP requirement

Remote access is part of MVP because the intended use includes GPT Web or another remote MCP client.

The active implementation must use the currently supported remote MCP transport from the chosen official SDK rather than hand-rolled protocol framing.

Private/local hosts should prefer a supported private-connectivity/tunnel mechanism where appropriate. Direct public exposure requires HTTPS plus explicit authentication/authorization.

Provider/tunnel choice is deployment policy and must be selected from live evidence near implementation time rather than frozen early in product design.

## 4. Reachability is not authority

A network path only makes the endpoint reachable. It does not grant permission to use terminal Channels.

```text
reachable endpoint
→ authenticate caller
→ authorize protected MCP operation
→ only then enter Channel logic
```

Do not treat any of these as authorization by themselves:

- possession of endpoint URL;
- private IP reachability;
- tunnel membership without an explicit reviewed trust rule;
- client UI confirmation;
- arbitrary proxy headers.

## 5. Write-capability gate

The product is not complete as a remote control channel if the active intended client can only perform read operations.

Before dogfooding, verify live support for the accepted public Channel surface, including:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

If required write/control actions are unavailable in the active client/workspace, record integration as BLOCKED rather than weakening the product contract.

## 6. Initial topology

```text
remote MCP client
      │
network / tunnel / HTTPS reachability
      │
authentication + authorization boundary
      │
remote MCP transport adapter
      │
Channel service
      │
configured tmux socket/server/account
      │
existing panes
```

The MCP service and tmux initially run under the same intended low-privilege account boundary.

## 7. Authentication and authorization

Terminal write/control is privileged.

Authentication answers:

```text
who/what is presenting this credential?
```

Authorization answers:

```text
may this authenticated caller use this protected MCP surface?
```

The two responsibilities may be implemented by one trusted component, but the conceptual distinction must remain explicit.

Do not:

- expose unauthenticated write tools publicly;
- place access tokens in URL query strings;
- rely only on client UI confirmation;
- trust arbitrary proxy headers without reviewed configuration.

Follow the active MCP authorization specification and official SDK behavior at implementation time.

## 8. Remote ingress responsibility

Remote ingress owns only network/protocol trust-boundary logic such as:

- supported MCP transport/session handling;
- authentication/authorization enforcement;
- request/body/session bounds;
- transport timeouts;
- transport-required Host/Origin/resource protections;
- sanitized ingress diagnostics.

It must not own:

- Channel identity semantics;
- tmux targeting logic;
- endpoint lifecycle/recovery;
- application/Task interpretation;
- scheduling or retry policy for terminal workflows.

Remote transport wraps the accepted Channel service; it does not become a second Channel implementation.

## 9. Failure classification

Failures must remain attributable to the responsible layer.

```text
ingress/auth failure
= request did not obtain authorized access to Channel logic

Channel failure
= accepted Channel operation failed mechanically

backend failure
= configured tmux backend unavailable/failed

application outcome
= outside Channel MCP knowledge
```

An ingress disconnect must not be reported as a pane failure. A backend failure must not be converted into an auth failure. None of these failures grants permission to recreate/restart terminal endpoints.

## 10. HTTP / network security

For network-exposed deployments:

- TLS/HTTPS outside a trusted private tunnel boundary;
- authenticate protected requests;
- authorize access to protected Channel operations;
- validate token/resource scope where required;
- apply finite request/body/session bounds;
- apply timeouts;
- follow current Origin/Host guidance from the active transport/SDK;
- expose only the Channel MCP endpoint, not unrelated host services.

Exact transport/auth mechanics are frozen only after current official verification.

## 11. Tmux visibility configuration

Deployment explicitly selects the terminal namespace available to the MCP, such as:

```text
one tmux socket/server
one OS account
optional allowed session-name pattern/list
```

This remains the authority boundary for what panes Channel logic can list/read/write after a caller has passed ingress authorization.

Remote auth does not silently widen the configured tmux scope.

The service does not keep a Worker registry or Issue mapping.

## 12. External lifecycle preparation

A human or upper-layer automation prepares terminals before use, for example:

```text
create workspace
→ create tmux session/pane
→ start desired interactive program
→ Channel MCP discovers it
```

Installation of tmux, starting an Agent/CLI, creating worktrees, session restart and cleanup are deployment/orchestration responsibilities outside the core MCP.

## 13. Lifetime semantics

```text
HTTP/MCP request lifetime
!= remote MCP connection/session lifetime
!= Channel lifetime
!= tmux pane lifetime
```

A pane may continue running after a client disconnects. A later authorized connection rediscovers whatever Channels currently exist in configured scope.

Remote reconnect does not imply endpoint recreation or persistent logical Worker identity.

## 14. Infrastructure provisioning boundary

The repository may document prerequisites for a chosen deployment, but Channel MCP does not expose tools for:

- creating tunnel/provider accounts;
- buying/configuring DNS as a product API;
- installing host packages;
- configuring firewall/users/system services;
- issuing arbitrary infrastructure commands.

Those are operator/environment responsibilities.

## 15. Compatibility checks

Because MCP/client integration evolves, the Publication Gate for remote ingress must verify current authoritative evidence for:

- supported remote transport;
- authentication/authorization requirements;
- intended client tool discovery/invocation support;
- write/modify tool support;
- tunnel/private-connectivity options when relevant;
- current SDK behavior;
- required Host/Origin/resource/session protections.

Compatibility evidence validates the frozen product contract. It does not redefine it.
