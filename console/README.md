# agent-runtime-mcp Web Console

An **upper-layer human interaction component** for `agent-runtime-mcp`. It is
**not part of the seven-tool MCP product** and never modifies `src/`. Its only
coupling to the product is the public MCP contract (`docs/mcp-contract.md`):
the Console spawns `node <repo>/dist/src/server.js` over stdio and calls the
public tools through the official `@modelcontextprotocol/client`.

Current slice (Task #61, WC-UC1): session list + backend health banner.

```text
browser ──HTTP──▶ Console server ──stdio MCP──▶ agent-runtime-mcp ──▶ existing tmux panes
```

## Security posture

- **The Tailscale tailnet is the access boundary.** The Console implements no
  user authentication, roles, or authorization — everyone who can reach it has
  full Console capability. Tailnet membership and Tailscale ACLs decide who
  that is (deployment-layer concern, `docs/deployment.md §5`).
- **The bind guard is the only Console-side network control.** Startup refuses
  any `CONSOLE_BIND` that is not (a) a loopback address or (b) a Tailscale
  address (`100.64.0.0/10` or `fd7a:115c:a1e0::/48`) **currently assigned to a
  local network interface**. `0.0.0.0`, `::`, hostnames, and every other
  address exit non-zero. There is no override flag.
- **Origin/Host check.** Every request must carry a `Host` equal to the bound
  `address:port`; a present `Origin` must resolve to the same authority.
  Upgrade requests are refused (no WebSocket endpoints exist yet).
- **No terminal payloads in logs.** Structured JSON logs on stderr contain only
  operation, path, status and timing fields; non-scalar fields collapse to a
  type tag. Request and response bodies are never logged.
- **Mechanical facts only.** The list renders `channel_id`,
  `backend_metadata.tmux.session_name`, `title`, `cwd`, `state`,
  `last_activity` and `capabilities`. Missing fields show `unknown`; nothing is
  inferred from terminal content.
- **No tmux execution.** In this slice `console/` executes no tmux command at
  all — endpoint lifecycle stays outside; failure never creates, restarts or
  destroys endpoints. A CI guard rejects tmux lifecycle/attach/key-injection
  invocations anywhere under `console/`.
- **No persistence.** Nothing is written to disk by the Console.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `CONSOLE_BIND` | `127.0.0.1` | IP literal to listen on. Loopback, or a locally assigned Tailscale address. Anything else refuses startup. |
| `CONSOLE_PORT` | `8080` | TCP port, 1–65535. |
| `CONSOLE_MCP_ENTRY` | `<repo>/dist/src/server.js` | Path to the built agent-runtime-mcp stdio server entry point. |
| `CONSOLE_MCP_REQUEST_TIMEOUT_MS` | `10000` | Per-call MCP request timeout (max 120000). |
| `CONSOLE_PUBLIC_DIR` | `console/public` | Static UI directory. |
| `TMUX_*` | — | Passed through to the MCP child unchanged (e.g. `TMUX_SOCKET_NAME`, `TMUX_SOCKET_PATH`, `TMUX_ALLOWED_SESSIONS`, `TMUX_TIMEOUT_MS`). The Console itself never interprets them. |

Reconnect policy: when the MCP child is unreachable the adapter retries with
bounded backoff (3 attempts, 250 ms doubling), then reports `MCP_UNAVAILABLE`
and cools down ~5 s before the next burst. No retry storm; the UI shows an
explicit unavailable state.

## Run

```bash
npm run build              # in the repository root, builds dist/src/server.js
cd console && npm ci && npm run build
CONSOLE_BIND=127.0.0.1 CONSOLE_PORT=8080 \
TMUX_SOCKET_NAME=agent-runtime TMUX_ALLOWED_SESSIONS=my-session \
  node dist/src/server.js
# then browse to http://127.0.0.1:8080/ (Host must match the bound address)
```

On a host joined to a tailnet, set `CONSOLE_BIND` to the machine's Tailscale
IPv4 (`100.x.y.z`) or IPv6 (`fd7a:115c:a1e0::…`) address and browse to that
address instead.

## HTTP API (internal, consumed by the bundled UI only)

- `GET /api/health` → MCP `health` result; `503 MCP_UNAVAILABLE` when the MCP
  process is down.
- `GET /api/channels` → MCP `list_channels` result.
- `GET /api/channels/:id` → MCP `get_channel` result; `404 CHANNEL_NOT_FOUND`.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (bind guard, request authority, logger)
```

The real-tmux end-to-end test lives outside `console/` in the repository test
harness (`tests/console/`), which is permitted to prepare disposable tmux
servers; it runs in the `console` CI job after both packages are built.

## Separation

`console/` imports nothing from `src/`; the runtime deployment bundle
(`npm run package:runtime`) must not contain `console/` paths — both are
asserted in CI. Browse View, text/control input, terminal attach and session
lifecycle are later Tasks (#62–#65) and are intentionally absent here.
