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
