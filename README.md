# agent-runtime-mcp

A secure MCP communication channel for existing interactive terminal sessions, with tmux as the first backend.

## Product intent

The core product is deliberately small:

```text
remote MCP client
→ agent-runtime-mcp
→ existing terminal channel
```

It provides:

```text
list channels
inspect channel
read bounded output
write text
send explicit control
check health
```

It does **not** decide what the terminal represents.

A channel may contain Codex, another Agent CLI, a shell, a REPL or another interactive program.

## Boundary

Inside product:

- secure remote MCP ingress;
- backend-neutral Channel model;
- existing-channel discovery;
- bounded terminal output read;
- safe text delivery;
- explicit Enter/interrupt/escape control;
- tmux backend health/errors.

Outside product:

- Worker/Agent identity;
- Issue/Task/Attempt semantics;
- scheduling and assignment;
- git worktree/branch/PR lifecycle;
- tmux session/pane creation;
- starting/restarting Codex;
- recovery/cleanup policy;
- mapping a project task to a terminal.

Those concerns belong to whatever upper-layer collaboration or automation system uses this MCP.

## Phase 2.5 implementation

MVP-001 established the read-only Channel slice, MVP-002 added safe input, and MVP-002.5 exposes the already-established backend health capability. The current stdio server registers:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

Secure remote ingress remains later MVP work.

### Requirements

- Node.js 20 or newer;
- npm;
- tmux available to the service account for real backend use.

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

Then start the server with the same configured tmux scope:

```bash
TMUX_SOCKET_NAME=agent-runtime npm start
```

Optional configuration:

```text
TMUX_SOCKET_NAME             named tmux server selected with tmux -L
TMUX_SOCKET_PATH             explicit tmux socket selected with tmux -S (mutually exclusive with TMUX_SOCKET_NAME)
TMUX_ALLOWED_SESSIONS        comma-separated exact session allowlist
TMUX_TIMEOUT_MS              finite tmux command timeout
TMUX_MAX_CHANNELS            inventory result bound
TMUX_READ_DEFAULT_LINES      default recent-line read bound
TMUX_READ_MAX_LINES          maximum accepted line bound
TMUX_READ_MAX_BYTES          maximum accepted UTF-8 byte bound
```

A missing pane or unavailable tmux server returns a structured error; the service does not recreate or restart anything.

### Health contract

`health` takes no `channel_id`. It reports only the configured backend/service mechanical state through `backend_kind`, `available`, and optional bounded `detail`. Backend health is independent of visible Channel inventory: a queryable tmux server may be healthy while `TMUX_ALLOWED_SESSIONS` exposes zero Channels.

Health does not inspect foreground application meaning, Worker/Task readiness, remote-ingress reachability, or recovery policy. It never creates, restarts, or destroys terminal endpoints.

### Safe input contract

`write_text` accepts:

```text
channel_id
text
submit: boolean
```

Ordinary text is literal Unicode data. LF (`\n`) and TAB (`\t`) are allowed; every other Unicode `Cc` control character is rejected before tmux mutation. Each call has a hard **1 MiB UTF-8** maximum. The tmux backend loads the payload through stdin into an operation-unique temporary paste buffer and pastes it only to the exact resolved pane; caller text is never shell interpolation or caller-controlled tmux key grammar.

`submit=false` adds no extra Enter. `submit=true` delivers the text first and then reuses the same explicit ENTER mapping as `send_control`.

`send_control` accepts only:

```text
ENTER
INTERRUPT
ESCAPE
```

The fixed tmux mappings are internal implementation data; arbitrary key names/macros are not a public API.

Mutation success acknowledges mechanical transport only. `write_text` and `send_control` are **not idempotent**. If a timeout occurs after terminal delivery may have begun, the outcome is reported as mechanically unknown and the core does not retry automatically. An upper layer must decide whether recovery or retry is safe.

Do not log or persist full terminal write payloads by default; terminal input/output may contain sensitive data.

## Example composition

A project-specific upper layer may do:

```text
create worktree
→ create tmux pane
→ start desired interactive program
→ discover pane through agent-runtime-mcp
→ write_text(application input)
→ read_channel(observation)
→ send_control(if explicitly needed)
```

`agent-runtime-mcp` owns only the communication steps. Lifecycle, application meaning, retries and acceptance remain outside the product.

## Public design target

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

No Worker registry or session lifecycle API is part of the core MVP.

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
