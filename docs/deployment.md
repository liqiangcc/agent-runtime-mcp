# Deployment and Remote Access

## 1. Deployment goal

Expose the accepted Channel MCP securely to a remote client while leaving Channel semantics and terminal lifecycle independent from remote ingress.

Selected MVP topology:

```text
ChatGPT / supported OpenAI remote MCP client
        ↓
OpenAI Secure MCP Tunnel
        ↓
customer-run tunnel-client
        ↓
local stdio agent-runtime-mcp
        ↓
Channel Service
        ↓
configured tmux scope
        ↓
existing panes
```

The terminal host does not need a public inbound MCP listener for this topology.

## 2. Core separation points

```text
network/tunnel reachable
!= authorized Channel access

remote tunnel/connection lifetime
!= local MCP process lifetime
!= Channel lifetime
!= tmux pane lifetime

remote ingress/auth
!= Channel semantics

infrastructure provisioning
!= Channel MCP product capability
```

These are authority boundaries, not implementation details.

## 3. Selected MVP remote ingress

Current authoritative OpenAI tooling provides Secure MCP Tunnel for connecting private/local MCP servers to supported OpenAI clients.

The selected architecture uses `tunnel-client` as an **external deployment adapter** and keeps `agent-runtime-mcp` on its accepted stdio server path.

Conceptually:

```text
tunnel-client
→ launches/connects to local MCP stdio command
→ carries MCP traffic outbound over the OpenAI tunnel
```

This means MVP-003 should prove composition/integration rather than add a second HTTP implementation of every Channel operation.

## 4. Reachability and authorization

A tunnel/network path makes a service reachable according to the selected trust model; it must not be treated as accidental terminal authority.

Required deployment controls include:

- tunnel scoped to the intended OpenAI workspace/project context;
- only authorized users/connectors may use the tunnel;
- runtime tunnel credential has only the permissions needed for tunnel Read/Use;
- administrative tunnel-management credentials are separate from long-lived runtime credentials;
- repository, terminal output, logs, Issue comments and CI artifacts contain no tunnel/API secrets.

Exact role/permission names must be re-verified at the live Publication Gate because OpenAI platform controls may evolve.

## 5. Credential boundary

Separate credential purposes:

```text
runtime tunnel credential
= long-lived tunnel-client runtime authority, least privilege

management/admin credential
= create/update/delete tunnel configuration when required

ChatGPT connector/workspace permission
= authority for a user/client to use the configured tunnel
```

Do not use an administrative key as the normal tunnel daemon credential.

Do not persist secrets in:

- repository files;
- Task Contracts/prompts;
- Issue bodies/comments;
- command examples with real values;
- CI logs/artifacts.

## 6. Local MCP server

The accepted Channel core remains a stdio MCP server.

Deployment launches the existing built server command (or equivalent package start command) under the same intended low-privilege account that can access the configured tmux namespace.

Remote ingress must not require changing:

- `channel_id` semantics;
- Channel tool schemas/results;
- tmux visibility rules;
- read/write/control/health behavior.

## 7. Complete Channel surface gate

Before remote dogfooding, verify the actual intended client can discover/invoke the complete accepted surface:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

If the active ChatGPT workspace/client can only perform read/fetch operations, MVP-003 remains BLOCKED. Do not weaken the product or simulate write evidence.

Client capability is a deployment/integration prerequisite, not a Channel semantic.

## 8. Tunnel lifetime semantics

```text
tunnel connection lost
!= tmux pane lost
!= Channel core recovery trigger
```

If the tunnel or remote client disconnects:

- existing panes continue according to external lifecycle ownership;
- Channel core does not restart/create/destroy panes;
- later tunnel/client reconnection rediscovers whatever Channels currently exist;
- application/workflow retry remains an upper-layer decision.

## 9. Failure classification

```text
Tunnel/control-plane failure
= remote ingress unavailable

Tunnel authorization failure
= caller cannot obtain protected remote MCP access

Local stdio MCP process failure
= local service/deployment failure

Channel failure
= accepted Channel operation failed mechanically

Tmux backend failure
= configured backend unavailable/failed

Application outcome
= outside Channel MCP knowledge
```

Do not collapse these layers into one generic “terminal failed” status.

## 10. Tmux visibility configuration

The Channel service still defines terminal visibility through its existing backend scope, for example:

```text
one tmux socket/server
one OS account
optional allowed session list
```

Tunnel/workspace authorization controls **who can reach the service**; Channel backend scope controls **which terminal Channels the service can see/control**. These are separate authority boundaries and both must hold.

## 11. External lifecycle preparation

A human or upper-layer automation prepares terminals before use:

```text
create workspace
→ create tmux session/pane
→ start desired interactive program
→ Channel MCP discovers it
```

Likewise, these are deployment/operator concerns:

- install/start `tunnel-client`;
- provision tunnel record/permissions;
- arrange outbound HTTPS connectivity;
- install tmux/Node dependencies;
- supervise local MCP/tunnel processes;
- rotate/revoke credentials.

None becomes a public Channel MCP tool.

## 12. Network exposure

Selected MVP tunnel architecture is outbound-oriented and should not require exposing the terminal host's MCP port publicly.

Firewall/network policy should permit only what the chosen tunnel client requires and should not open unrelated host services.

## 13. Direct-public HTTP alternative

A future deployment may decide to expose a direct Streamable HTTP MCP endpoint.

That alternative must be designed separately against the then-current MCP SDK/specification and authorization requirements. It should treat the MCP server as an OAuth-protected resource server where required and should use a proper authorization provider/IdP rather than inventing ad-hoc tokens.

Direct-public HTTP/OAuth is **deferred** for the selected MVP because Secure MCP Tunnel can bridge the existing stdio server.

## 14. Compatibility evidence

MVP-003 Publication/Acceptance must record dated live evidence for:

- target ChatGPT/workspace MCP write capability;
- Secure MCP Tunnel availability for the target workspace;
- tunnel-client version/source revision;
- required runtime/management permissions;
- selected tunnel configuration revision without secrets;
- existing stdio MCP command used behind the tunnel;
- successful remote discovery/read/write/control/health invocation;
- negative/unauthorized access evidence where supported;
- disconnect/reconnect without tmux lifecycle mutation.

Planning assumptions are not acceptance evidence.
