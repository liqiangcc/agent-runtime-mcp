# Runtime Deployment Bundle

The release archive is named from the declared package version:

```text
agent-runtime-mcp-v<version>.tar.gz
agent-runtime-mcp-v<version>.tar.gz.sha256
```

For release `v0.1.1`, `<version>` is `0.1.1`. Future runtime bundles use the version declared by `package.json`; the packaging path is not pinned to a specific historical release.

The bundle is a runnable deployment artifact for the accepted Channel MCP. It is a generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

## Host prerequisites

The target host provides:

```text
Node.js >= 20
npm
tmux
```

The archive does not bundle Node.js, npm, tmux, `node_modules`, TypeScript source, tests, repository scripts, or build tooling.

## Verify and extract

Replace `<version>` with the release version you downloaded:

```bash
sha256sum -c agent-runtime-mcp-v<version>.tar.gz.sha256
tar -xzf agent-runtime-mcp-v<version>.tar.gz
cd agent-runtime-mcp-v<version>
```

The checksum file is part of the formal release asset set and is generated from the exact release archive. Do not substitute a checksum copied from release-note prose.

## Install production dependencies

```bash
npm ci --omit=dev
```

The packaged application is already compiled. The target host does not run TypeScript compilation.

## Prepare or recover the tmux endpoint outside the MCP

`agent-runtime-mcp` only communicates with existing tmux panes. Endpoint creation, supervision and recovery remain deployment/operator responsibilities.

The bundle includes the accepted operator-side helper:

```text
deployment/tmux-endpoint-keeper.sh
```

It exposes only two deployment commands:

```text
ensure  # idempotently create the reserved keeper session when missing
status  # report available/degraded/unavailable without mutation
```

The helper is shipped executable. It uses the same endpoint-selection variables as the tmux backend:

```text
TMUX_SOCKET_NAME
TMUX_SOCKET_PATH
TMUX_KEEPER_SESSION
```

`TMUX_SOCKET_NAME` and `TMUX_SOCKET_PATH` are mutually exclusive. When neither is set, the helper defaults to socket name `agent-runtime`; `TMUX_KEEPER_SESSION` defaults to `agent-runtime-keeper`.

Example:

```bash
TMUX_SOCKET_NAME=agent-runtime \
TMUX_KEEPER_SESSION=agent-runtime-keeper \
  ./deployment/tmux-endpoint-keeper.sh ensure

TMUX_SOCKET_NAME=agent-runtime \
TMUX_KEEPER_SESSION=agent-runtime-keeper \
  ./deployment/tmux-endpoint-keeper.sh status
```

The intended recovery sequence is:

```text
configured tmux endpoint absent
→ public MCP health reports available=false
→ deployment helper ensure
→ tmux endpoint/keeper exists
→ the same running MCP process reports available=true
```

If the tmux server later disappears, the operator/supervisor invokes `ensure` again. The MCP itself does not recreate the endpoint.

Application sessions may still be prepared separately with native tmux, for example:

```bash
tmux -L agent-runtime new-session -d -s demo
```

If application sessions should be the only discoverable Channels, configure `TMUX_ALLOWED_SESSIONS` so the reserved keeper session is outside the visible Channel set.

## Run the packaged stdio MCP server

Configure the tmux visibility scope and start the server:

```bash
TMUX_SOCKET_NAME=agent-runtime npm start
```

Optional backend configuration:

```text
TMUX_SOCKET_NAME
TMUX_SOCKET_PATH
TMUX_ALLOWED_SESSIONS
TMUX_TIMEOUT_MS
TMUX_MAX_CHANNELS
TMUX_READ_DEFAULT_LINES
TMUX_READ_MAX_LINES
TMUX_READ_MAX_BYTES
```

The server exposes exactly these public MCP Tools:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

## Deployment boundary

This archive is a runnable application artifact plus focused operator-side keeper support. The helper does not become an MCP capability and does not grant product-owned lifecycle authority.

The bundle does not define or manage:

```text
systemd or another supervisor policy
Docker/container policy
tunnel/proxy/provider configuration
network listeners or reachability
TLS/DNS/firewall
authentication/authorization topology
host provisioning
automatic tmux endpoint recovery policy
```

If the MCP is exposed beyond a trusted local process boundary, the operator/deployment layer is responsible for suitable access control and transport security.

`package.json` remains `private: true`; this bundle is not an npm registry publication.
