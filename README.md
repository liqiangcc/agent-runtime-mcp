# agent-runtime-mcp

A small MCP Channel core for communicating with already-existing interactive terminal sessions, with tmux as the first backend.

## Product intent

The core is deliberately small:

```text
local MCP transport (stdio)
→ agent-runtime-mcp Channel service
→ existing terminal Channel
```

It provides:

```text
list channels
inspect channel
read bounded output
write bounded ordinary text
send explicit control
check backend health
```

It does **not** decide what the terminal represents.

A Channel may contain Codex, another Agent CLI, a shell, a REPL or another interactive program.

## Remote composition

Remote use wraps the same local Channel core rather than redefining it.

Selected MVP topology:

```text
ChatGPT / supported OpenAI MCP client
→ OpenAI Secure MCP Tunnel
→ customer-run tunnel-client
→ existing local stdio agent-runtime-mcp
→ configured tmux scope
→ existing panes
```

Secure remote ingress, workspace/tunnel authorization and tunnel-client runtime are deployment composition around the Channel core. They are not a second implementation of Channel semantics.

A direct-public HTTP/OAuth MCP adapter is not required for the selected MVP topology and is deferred unless a later independent use case requires it.

## Boundary

Inside Channel core:

- backend-neutral Channel model;
- MCP tool/schema surface;
- local stdio MCP transport;
- existing-Channel discovery;
- bounded terminal output read;
- bounded safe text delivery;
- explicit Enter/interrupt/escape control;
- backend/service health and structured errors.

Deployment composition may own:

- Secure MCP Tunnel / tunnel-client;
- workspace/tunnel authorization;
- secret injection/rotation;
- local MCP/tunnel process supervision;
- network/private-connectivity prerequisites.

Outside Channel product semantics:

- Worker/Agent identity;
- Issue/Task/Attempt semantics;
- scheduling and assignment;
- git worktree/branch/PR lifecycle;
- tmux session/pane creation;
- starting/restarting foreground programs;
- recovery/cleanup policy;
- mapping a project Task to a terminal;
- infrastructure administration.

## Current Channel implementation

The accepted stdio server registers:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

### Requirements

- Node.js 20 or newer;
- npm;
- tmux available to the service account.

Install and verify:

```bash
npm ci
npm run typecheck
npm test
npm run test:integration
```

Build and run over stdio:

```bash
npm run build
npm start
```

### Prepare tmux externally

The MCP never creates panes. Prepare one with native tmux or another upper layer, for example:

```bash
tmux -L agent-runtime new-session -d -s demo
```

Start the server with the same configured tmux scope:

```bash
TMUX_SOCKET_NAME=agent-runtime npm start
```

Optional configuration:

```text
TMUX_SOCKET_NAME             named tmux server selected with tmux -L
TMUX_SOCKET_PATH             explicit tmux socket selected with tmux -S
TMUX_ALLOWED_SESSIONS        comma-separated exact session allowlist
TMUX_TIMEOUT_MS              finite tmux command timeout
TMUX_MAX_CHANNELS            inventory result bound
TMUX_READ_DEFAULT_LINES      default recent-line read bound
TMUX_READ_MAX_LINES          maximum accepted line bound
TMUX_READ_MAX_BYTES          maximum accepted UTF-8 byte bound
```

A missing pane or unavailable tmux server returns a structured mechanical result/error; the service does not recreate or restart anything.

## Health contract

`health` takes no `channel_id`. It reports only configured backend/service mechanical state through `backend_kind`, `available`, and optional bounded `detail`.

```text
backend health
!= visible Channel count
!= foreground application readiness
!= Agent/Worker/Task state
!= Secure MCP Tunnel/network reachability
!= recovery policy
```

## Safe input contract

`write_text` accepts:

```text
channel_id
text
submit: boolean
```

Ordinary text is literal Unicode data. LF (`\n`) and TAB (`\t`) are allowed; every other Unicode `Cc` control character is rejected before tmux mutation. Each call has a hard **1 MiB UTF-8** maximum.

The tmux backend uses structured process invocation and an operation-unique temporary paste buffer loaded from stdin/data. Caller text is never shell interpolation or caller-controlled tmux key grammar.

`submit=false` adds no extra Enter. `submit=true` delivers text first and then reuses the explicit ENTER mapping.

`send_control` accepts only:

```text
ENTER
INTERRUPT
ESCAPE
```

Mutation success acknowledges mechanical transport only. `write_text` and `send_control` are not idempotent; ambiguous mutation timeouts are not blindly retried by the core.

## Example composition

An upper layer may do:

```text
create workspace/worktree
→ create tmux pane
→ start desired interactive program
→ discover pane through agent-runtime-mcp
→ write_text(application input)
→ read_channel(observation)
→ send_control(if explicitly needed)
```

The upper layer owns lifecycle, application meaning, retry/recovery and acceptance.

## Remote MVP status

The six-tool local Channel core is accepted. The remaining MVP remote Task is to prove the official Secure MCP Tunnel composition against an **actual write-capable target ChatGPT/OpenAI MCP environment**.

Until that environment and tunnel authority are verified, remote integration remains a deployment Gate rather than a reason to add HTTP/OAuth or tunnel concepts to Channel core.

## Documentation

Product contract:

- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/deployment.md`
- `docs/mvp-plan.md`

Repository development process:

- `AGENTS.md`
- `docs/tasks/`
- `.agents/skills/`

The repository workflow is intentionally separate from the product protocol.
