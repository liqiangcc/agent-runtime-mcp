# v0.1.0 Runtime Deployment Bundle

`agent-runtime-mcp-v0.1.0.tar.gz` is the runnable deployment artifact for the accepted Channel MCP MVP.

It is a generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

## Host prerequisites

The target host provides:

```text
Node.js >= 20
npm
tmux
```

The archive does not bundle Node.js, npm, tmux, `node_modules`, TypeScript source, tests, or build tooling.

## Verify and extract

When the checksum file is distributed beside the archive:

```bash
sha256sum -c agent-runtime-mcp-v0.1.0.tar.gz.sha256
tar -xzf agent-runtime-mcp-v0.1.0.tar.gz
cd agent-runtime-mcp-v0.1.0
```

## Install production dependencies

```bash
npm ci --omit=dev
```

The packaged application is already compiled. The target host does not run TypeScript compilation.

## Prepare tmux outside the MCP

`agent-runtime-mcp` only communicates with already-existing tmux panes. Endpoint creation, process startup, restart, recovery, and cleanup remain external operator responsibilities.

For example, an operator may prepare a tmux server/session separately:

```bash
tmux -L agent-runtime new-session -d -s demo
```

This native tmux command is an operator action; it is not performed by the MCP or by the deployment package.

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

This archive is a runnable application artifact, not deployment infrastructure.

It does not provide or manage:

```text
systemd or another supervisor
Docker/container policy
tunnel/proxy/provider configuration
network listeners or reachability
TLS/DNS/firewall
authentication/authorization topology
host provisioning
tmux endpoint lifecycle
```

If the MCP is exposed beyond a trusted local process boundary, the operator/deployment layer is responsible for suitable access control and transport security.

`package.json` remains `private: true`; this bundle is not an npm registry publication.
