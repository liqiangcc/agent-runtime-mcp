# Deployment Boundary

## 1. Status

Deployment is **not an agent-runtime-mcp product capability**.

This document exists only to prevent architecture leakage between the MCP product and the environment that runs it.

## 2. Product / deployment split

```text
agent-runtime-mcp product
= MCP tools + Channel semantics + ChannelBackend + TmuxBackend

deployment/operator layer
= process supervision + network reachability + tunnel/proxy + TLS + auth + DNS + firewall + credentials
```

The product does not provision, verify, select or manage deployment infrastructure.

## 3. Current local execution

The current implementation runs as an MCP server over stdio.

```text
MCP client/process
→ stdio MCP server
→ Channel Service
→ TmuxBackend
→ existing panes
```

This is sufficient to implement and verify the product capabilities.

## 4. Remote use

An operator may expose or compose the MCP remotely using any suitable external mechanism.

Examples may include tunnels, proxies, private networking or another MCP transport adapter, but none is part of the Channel product contract.

The repository does not require:

```text
specific tunnel provider
specific cloud/network topology
specific workspace integration
specific TLS termination
specific OAuth deployment
public listener
```

for product acceptance.

## 5. Security ownership

If the MCP is exposed beyond a trusted local process boundary, the operator/deployment layer must provide appropriate authentication, authorization and transport security.

Those controls protect access to the MCP; they do not redefine:

```text
Channel identity
Channel visibility
read/write/control semantics
backend health
endpoint lifecycle
```

## 6. Endpoint preparation

Terminal endpoints are also prepared externally:

```text
create workspace if needed
→ create tmux session/pane
→ start desired interactive program
→ agent-runtime-mcp discovers existing pane
```

The MCP never creates/restarts/destroys panes merely because a deployment or client connection changes.

## 7. Configuration boundary

The product may accept configuration needed for its own backend behavior, such as tmux socket/server and session allowlist.

It must not grow configuration APIs for provider accounts, DNS, firewall, tunnel creation or host administration.

## 8. Design rule

When a deployment concern appears during product planning, apply this test:

> Would this still be needed if the same six MCP tools were consumed locally through stdio?

If the answer is no, it is normally a deployment concern and should stay outside the product Task roadmap.

## 9. Deployment-layer tmux endpoint keeper and recovery

A tmux server disappears when its last session exits. If `agent-runtime-mcp` is configured for that socket, `health` correctly becomes mechanically unavailable; the MCP must not recreate the endpoint itself.

For deployments that need a stable tmux endpoint, the repository provides an **operator-side** helper:

```text
deployment/tmux-endpoint-keeper.sh
```

It has only two deployment commands:

```text
ensure  # idempotently create the reserved keeper session when missing
status  # report available/degraded/unavailable without mutation
```

The helper supports the same endpoint-selection environment used by the tmux backend:

```text
TMUX_SOCKET_NAME     # tmux -L name; defaults to agent-runtime when no path is set
TMUX_SOCKET_PATH     # tmux -S path; mutually exclusive with TMUX_SOCKET_NAME
TMUX_KEEPER_SESSION  # deployment-only reserved session; default agent-runtime-keeper
```

Example:

```bash
TMUX_SOCKET_NAME=agent-runtime \
TMUX_KEEPER_SESSION=agent-runtime-keeper \
  bash deployment/tmux-endpoint-keeper.sh ensure

TMUX_SOCKET_NAME=agent-runtime \
TMUX_KEEPER_SESSION=agent-runtime-keeper \
  bash deployment/tmux-endpoint-keeper.sh status
```

The intended ownership is:

```text
deployment supervisor/operator
→ invoke ensure at boot and whenever endpoint recovery is required
→ keeper session keeps the tmux server/socket alive
→ worker/application sessions may be created and removed independently

agent-runtime-mcp
→ observe current backend health
→ communicate with existing Channels only
→ never create/restart/destroy the endpoint
```

A reproducible recovery sequence is therefore:

```text
configured tmux endpoint missing
→ public MCP health.available = false
→ deployment helper ensure
→ keeper/session endpoint exists again
→ the same running MCP process reports health.available = true
```

No MCP restart is required merely to re-check tmux availability because backend health is queried mechanically on each call.

If application sessions should be the only discoverable Channels, deployment may use `TMUX_ALLOWED_SESSIONS` to exclude the reserved keeper session. That visibility choice does not move keeper lifecycle into the MCP.

Failure remains explicit: if `ensure` cannot create the endpoint, it exits non-zero; `status` remains unavailable/degraded and the MCP continues to report mechanical unavailability. There is no hidden fallback that mutates tmux from product code.

GitHub Actions job `tmux-endpoint-keeper-recovery` supplies executable Linux/tmux evidence for this procedure, including unavailable → healthy recovery, worker-session removal while the keeper remains, endpoint loss, second recovery, and confirmation that the public MCP tool surface stays exactly six tools.
