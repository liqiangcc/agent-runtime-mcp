# Repository Agent Skills

The repository uses four distinct execution roles.

```text
Task Publisher
→ Task Dispatcher
→ Task Worker
→ Task Reviewer
```

## Skills

### `task-publisher`

Materializes or republishes one Task through the Publication Gate.

Does not dispatch, execute, review or close.

### `task-dispatcher`

Bridges an already-published Worker handoff to one isolated Codex runtime and tracks/reconciles runtime liveness.

Bootstrap transport:

```text
isolated git worktree → tmux → Codex
```

Target dogfooding transport:

```text
agent-runtime-mcp → RuntimeBackend → Codex
```

Does not claim, implement, review or automatically create the next Attempt.

### `task-worker`

Claims and executes exactly one published Attempt, reports durably to GitHub, releases ownership and stops.

Does not publish, dispatch another Worker, review, accept or close.

### `task-reviewer`

Reviews durable Worker/evidence results, handles interrupted ownership recovery, and chooses `ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED`.

Does not implement the Task.

## Authority

Skills are procedures. Scope and truth remain in:

```text
canonical docs
→ AGENTS.md
→ task.md
→ prompt.md
→ live GitHub Issue state/history
```

See `docs/tasks/collaboration-protocol.md` and `docs/tasks/issue-lifecycle-protocol.md`.