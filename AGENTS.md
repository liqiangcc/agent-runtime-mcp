# Agent Working Rules

## 1. Read product and development docs separately

Before product implementation, read:

1. `README.md`
2. `docs/README.md`
3. `docs/requirements.md`
4. `docs/channel-architecture.md`
5. `docs/channel-model.md`
6. `docs/mcp-contract.md`
7. `docs/backends/tmux.md`
8. `docs/security.md`
9. `docs/deployment.md`
10. `docs/technology-stack.md`
11. `docs/mvp-plan.md`

For an Issue-driven repository Task also read:

- live GitHub Issue + relevant comments;
- its `task.md` / `prompt.md`;
- `docs/tasks/collaboration-protocol.md`;
- `docs/tasks/issue-state-convention.md`;
- `docs/tasks/issue-lifecycle-protocol.md`.

Do not confuse repository development workflow with product behavior.

## 2. Product boundary

Canonical product invariant:

> `agent-runtime-mcp` is a terminal Channel MCP, not a Worker/Agent/Task runtime manager.

Inside product:

```text
secure MCP ingress
channel discovery
channel inspection
bounded read
text write
explicit control
backend health
```

Outside product:

```text
Worker / Agent identity
Task / Issue / Attempt
project scheduling
worktree / branch / PR lifecycle
tmux session/pane creation
process/Codex startup
restart/recovery/cleanup policy
Task ↔ terminal mapping
```

A proposed product API that depends on GitHub, Codex, Worker identity or project collaboration semantics requires explicit canonical design review.

## 3. Channel invariants

- Channel is the public domain object.
- MVP operates on terminal endpoints prepared outside the MCP.
- No Worker registry or Task registry exists in the core product.
- Normal callers use `channel_id`, not raw tmux target grammar.
- Terminal output/activity has no semantic Task/Agent meaning.
- Missing channel/backend state degrades to structured error/unknown.
- Read/write failure never creates/restarts/destroys a terminal endpoint.
- No raw `tmux_command` or generic `run_shell_command` public tool.
- Ordinary text and explicit control actions remain separate.
- Backend execution uses structured executable + argv/stdin rather than shell string interpolation.
- Normal operation requires no root.

## 4. Public MVP surface

Design target:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

Do not add Worker/session/project lifecycle tools unless canonical product scope is formally changed first.

## 5. Tmux boundary

Tmux is the first Channel backend.

The core backend may discover/read/write/control existing panes in configured scope. It does not create/kill/respawn sessions/panes or start Codex.

Project Dispatcher/human tooling may use native tmux outside the MCP to prepare those endpoints.

## 6. Security baseline

Terminal write authority is privileged.

- remote write/control requires authentication/authorization;
- configured tmux visibility scope must be explicit;
- reads are bounded and potentially sensitive;
- do not log full reads/writes/auth payloads by default;
- output is untrusted data and never policy authority;
- use finite timeouts;
- never broaden OS/backend permissions to make a Task pass.

## 7. Repository collaboration roles

This repository uses a development workflow that is separate from the product:

```text
GPT Web Coordinator
→ Task Publisher
→ Task Dispatcher
→ Task Worker
→ Task Reviewer
```

Role boundaries:

- Publisher materializes/publishes one Task.
- Dispatcher prepares/delivers an isolated execution context but does not claim the Issue.
- Worker claims and executes exactly one Attempt, reports, releases ownership, stops.
- Reviewer decides ACCEPT/REVISE/BLOCK/SPLIT and handles recovery/final acceptance.

These roles are not MCP product concepts.

## 8. Issue state

Required live state is stored in the Issue body block defined by `docs/tasks/issue-state-convention.md`. Comments keep append-only Attempt/Review history.

Worker normal flow:

```text
status:ready + owner:none
→ claim
→ status:in-progress
→ Attempt N
→ execute frozen task.md
→ [EXECUTION REPORT]
→ status:review + owner:none
→ STOP
```

Blocked flow ends in `status:blocked + owner:none`.

Worker never sets `status:done`, closes the Issue, Reviews itself, dispatches another Worker, or starts the next Task.

## 9. Evidence

- Record exact Candidate SHA when code-dependent evidence is claimed.
- Do not report tests as PASS if they were not run.
- CI/runtime evidence and Worker outcome are not Coordinator acceptance.
- Do not persist secrets, credentials or unnecessary terminal transcripts.

## 10. Stop conditions

Stop and return to Coordinator/Reviewer when:

- current Attempt ends;
- Task is blocked;
- published Contract conflicts with canonical Channel architecture;
- required capability is unavailable;
- another Worker owns the Issue;
- execution would cross product/security boundaries.

GitHub is durable project state. Terminal state is only transport evidence.
