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

## Phase 1 implementation

MVP-001 implements only the read-only slice:

```text
list_channels
get_channel
read_channel
```

The server uses the official MCP TypeScript server SDK v2 and stdio transport. `write_text`, `send_control`, remote ingress and tmux lifecycle remain outside this phase.

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

During the first dependency-resolution bootstrap, `npm install` may be used to create `package-lock.json`; committed builds use the lockfile.

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

## Example composition

A project-specific Dispatcher may do:

```text
create worktree
→ create tmux pane
→ start Codex
→ discover pane through agent-runtime-mcp
→ write_text(task handoff)
```

`agent-runtime-mcp` only owns the communication step. The final two write/control capabilities are planned for a later MVP phase.

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
