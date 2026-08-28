# Requirements

## 1. Product goal

Provide a persistent, inspectable and controllable execution runtime that lets a GPT Web Coordinator operate terminal-based AI Workers such as Codex through MCP, while keeping durable project coordination in GitHub Issues.

The first backend is tmux. The product boundary is **Agent Runtime**, not tmux command automation.

## 2. Primary actors

### GPT Web Coordinator

Needs to:

- discover available Workers;
- inspect Worker runtime state and recent output;
- send task-entry instructions to an idle/appropriate Worker;
- interrupt or recover a stuck Worker;
- create/restart/destroy runtime Workers when needed;
- correlate a Worker with an external GitHub Issue without treating runtime metadata as Task authority.

### Codex Worker

Runs inside a persistent terminal runtime and executes one published Issue Attempt at a time according to repository rules.

### Human operator

Owns the machine/account permissions and must remain able to inspect/attach/recover the underlying tmux sessions directly.

## 3. Core use cases

### UC1 — Discover persistent Workers

The Coordinator can list Workers and obtain stable runtime identities plus enough metadata to decide whether a Worker can be used.

Success requires structured results rather than parsing raw `tmux ls` output in the model.

### UC2 — Observe a Worker

The Coordinator can fetch bounded recent terminal output and runtime metadata for a selected Worker.

Observation must not imply semantic Task completion.

### UC3 — Send ordinary text safely

The Coordinator can send a multi-line Unicode prompt/instruction to a Worker without relying on shell quoting or interpreting prompt text as tmux special-key syntax.

Ordinary text input and control-key input must be separate capabilities.

### UC4 — Send explicit control input

The Coordinator can request a small, explicit set of control actions such as Enter or interrupt (`Ctrl-C`) without exposing arbitrary tmux key-language semantics as the default text interface.

### UC5 — Create a persistent Worker

The Coordinator can create a Worker with a requested working directory and startup command/profile. The Worker remains available after the MCP client disconnects.

### UC6 — Recover or restart a Worker

The Coordinator can distinguish a missing/exited/unavailable runtime from a healthy one and explicitly restart it when policy allows.

### UC7 — Destroy a Worker

The Coordinator can explicitly remove a Worker runtime. Destruction must be a separate destructive operation and must not happen as a side effect of observation or transient failure.

### UC8 — Correlate runtime with external Task

The runtime may record an optional external reference such as `github:owner/repo#12` for operator visibility and routing assistance.

This reference is correlation metadata only; Issue status and acceptance remain in GitHub.

## 4. Required capabilities

The MVP requires these capability groups:

```text
inventory
observation
text-input
control-input
worker-create
worker-restart
worker-destroy
runtime-health
external-reference
```

Backend-specific commands are not product capabilities.

## 5. Runtime semantics requirements

- Every managed Worker has a stable `worker_id` independent from user-visible tmux names where practical.
- Every Worker resolves to one concrete backend locator.
- Runtime status is structured and intentionally non-semantic with respect to project completion.
- Output capture is bounded by lines/bytes and never unbounded by default.
- `last_activity` describes runtime I/O observation, not Task progress.
- Runtime metadata can degrade to `unknown` when the backend cannot prove a field.
- Missing runtime information must not be invented from terminal text.

## 6. Task/coordination separation

The runtime must not become a second Issue tracker.

It must not own authoritative:

- Task status;
- project priority;
- claim/assignee state;
- acceptance decision;
- verification result authority;
- next-Task scheduling policy.

A future higher-level orchestration layer may combine GitHub and Runtime tools, but that orchestration belongs to the Coordinator, not the Runtime backend.

## 7. Persistence requirements

- A Worker survives loss/restart of the MCP client connection as long as the backend runtime itself remains alive.
- Managed Worker identity should be recoverable after an MCP server process restart.
- Runtime registry corruption or stale locators must degrade safely and be reconcilable with the backend.
- The tmux backend remains directly inspectable with native tmux tooling.

## 8. Security requirements

- Assume runtime control is approximately equivalent to shell authority of the service account.
- Default deployment must not expose unauthenticated remote shell-equivalent access.
- Backend commands must be invoked using structured argv/process APIs, not shell string concatenation.
- Ordinary text input must not be interpreted as a shell command by the MCP server itself.
- Captured terminal output must be treated as potentially sensitive.
- Destructive lifecycle operations must be explicit and target one Worker.
- The runtime must obey existing OS permissions and must not require root for normal operation.

Full requirements are in `security.md`.

## 9. Operational requirements

- Useful failures must be structured: worker not found, backend unavailable, permission denied, runtime exited, invalid working directory, input failure, timeout.
- Read-only inventory/observation should remain usable when mutation is unavailable where possible.
- Backend errors should preserve enough diagnostic context without dumping sensitive environment state.
- Operations need finite timeouts; MCP calls must not wait indefinitely for a terminal program to become semantically idle.

## 10. Non-goals for MVP

The MVP does not attempt to:

- replace GitHub Issues;
- autonomously choose project priorities;
- infer Task success from Codex output;
- parse Codex UI text into an authoritative state machine;
- provide a general remote shell API;
- expose every tmux command or key sequence;
- manage Docker/Kubernetes/SSH backends;
- multiplex many logical Workers through one shared interactive shell;
- implement distributed scheduling across many runtime hosts;
- store full terminal history as a durable knowledge base.

## 11. MVP success criteria

The first usable version is successful when a Coordinator can, through MCP:

1. discover at least one managed tmux-backed Worker;
2. inspect bounded recent output;
3. safely send a multi-line Codex instruction;
4. send Enter/interrupt explicitly;
5. create/restart/destroy a persistent Worker;
6. reconnect to the MCP server and rediscover that Worker;
7. perform the above without treating terminal state as GitHub Task state;
8. use the runtime in one real Issue-driven Codex Attempt with GitHub remaining the coordination authority.