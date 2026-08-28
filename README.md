# agent-runtime-mcp

A generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

## Product surface

The current MCP server exposes exactly:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

The product owns the **MCP capabilities and Channel semantics** behind those tools.

It does not decide what a terminal represents.

A Channel may contain Codex, another Agent CLI, a shell, a REPL or any other interactive program.

## Boundary

Inside product:

```text
MCP tool/schema contract
backend-neutral Channel model
existing-Channel discovery
bounded output read
bounded ordinary-text write
explicit ENTER / INTERRUPT / ESCAPE
backend/service health
structured Channel/backend errors
tmux scope enforcement
```

Outside product:

```text
Worker / Agent / Task semantics
workflow scheduling / review / recovery
worktree / branch / PR lifecycle
tmux session/pane lifecycle
process startup/restart
application completion interpretation
deployment / tunnel / proxy
TLS / DNS / firewall
workspace/client authorization policy
provider credentials / host administration
```

Deployment is intentionally separate: `agent-runtime-mcp` is responsible for MCP capability, not how an operator makes the MCP process reachable.

## Current implementation

The server currently runs over stdio.

Requirements:
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

The public-MCP dogfood test additionally launches the built stdio server through the official TypeScript MCP client and uses a disposable tmux/bash endpoint prepared and destroyed by the test fixture:

```bash
npm run test:dogfood
```

The harness exercises all six public Tools, interprets shell markers outside the MCP, interrupts a long-running command through `send_control(INTERRUPT)`, and verifies that destroying the endpoint externally produces a mechanical Channel/backend failure without recreation.

Build and run:

```bash
npm run build
npm start
```

## Prepare tmux externally

The MCP never creates panes. Prepare terminal endpoints with native tmux or another upper layer, for example:

```bash
tmux -L agent-runtime new-session -d -s demo
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

## Safe input contract

`write_text` transports bounded ordinary Unicode text as data.

- LF and TAB are allowed;
- other Unicode `Cc` controls are rejected;
- caller text never becomes shell command syntax or caller-controlled tmux key grammar;
- each call has a hard 1 MiB UTF-8 maximum;
- `submit=true` adds one explicit Enter only after text delivery succeeds.

`send_control` accepts exactly:

```text
ENTER
INTERRUPT
ESCAPE
```

Mutation success means mechanical terminal transport only, not application success. Mutations are non-idempotent and are not blindly retried after ambiguous timeout.

## Health contract

`health` reports only backend/service mechanical health:

```text
backend_kind
available
detail?
```

Health does not mean a Channel exists or that a foreground application/Agent/Task is ready.

## Example composition

An upper layer may do:

```text
prepare endpoint externally
→ list_channels
→ get_channel
→ read_channel
→ write_text
→ send_control when explicitly needed
→ interpret application result outside MCP
```

That is the key architectural split:

```text
upper layer = lifecycle + meaning + workflow control
Channel MCP = communication capability only
```

## Documentation

Product contract:
- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/technology-stack.md`
- `docs/mvp-plan.md`

`docs/deployment.md` documents the non-product deployment boundary only.

Repository development process:
- `AGENTS.md`
- `docs/tasks/`

The repository workflow and deployment environment are both separate from the public MCP capability model.
