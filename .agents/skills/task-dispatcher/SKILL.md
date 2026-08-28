---
name: task-dispatcher
description: Dispatch, inspect, track, or resume exactly one issue-linked Codex Worker runtime for agent-runtime-mcp. Orchestration only: never claim, implement, review, accept, close, or automatically start another Attempt.
---

# Task Dispatcher

Bridge an already-published Task handoff to one isolated Codex Worker runtime.

## Authority

Before dispatch/tracking, read:

1. `AGENTS.md`
2. `docs/tasks/collaboration-protocol.md`
3. `docs/tasks/issue-state-convention.md`
4. `docs/tasks/issue-lifecycle-protocol.md`
5. target Issue and relevant comments
6. referenced `prompt.md` and `task.md`
7. `docs/tasks/handoffs/codex.md`

Dispatcher owns runtime orchestration only.

## Input

For a new dispatch, require exactly one canonical Worker handoff, normally:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Extract one Issue and one prompt path. Preserve the handoff unchanged when delivering it to Codex.

Do not rewrite Scope or copy `task.md` into the launch input.

## GitHub preflight

Before launching a new Worker, live-read GitHub and require:

```text
Issue open
Status: status:ready
Active owner: none
prompt.md resolves
task.md resolves
actual child execution context/capabilities are known and eligible
no already-running issue-linked Worker for the same Task
```

If Issue is `status:in-progress`, `status:review`, `status:blocked`, `status:done`, or closed, do not launch a duplicate Worker. Track/reconcile instead.

Dispatcher does not claim the Issue. The child `$task-worker` performs the claim after it starts.

## Isolation

Never launch parallel child Workers from the Dispatcher/main checkout.

Bootstrap mapping:

```text
Issue #123
→ <repo-root>.worktrees/issue-123
→ tmux session codex-issue-123
→ Codex Worker
```

For a new dispatch:

1. require the Dispatcher checkout to be clean and on `main`;
2. fetch/sync `main` safely using fast-forward semantics;
3. record exact base SHA;
4. ensure no existing issue tmux session already owns the mapping;
5. ensure any pre-existing issue worktree is reconciled rather than overwritten;
6. create an isolated detached worktree from the recorded base SHA;
7. launch Codex inside that worktree;
8. deliver the canonical Worker handoff as literal terminal input.

Never use `reset --hard`, destructive `clean`, or automatic stale-worktree deletion to hide conflicts.

## Bootstrap runtime mode

Until `agent-runtime-mcp` has accepted create/input/observe/recovery capabilities, Dispatcher may use native tools:

```text
Task Dispatcher
→ git worktree
→ tmux
→ Codex CLI
```

Text handoff must be transported as data; do not interpolate arbitrary handoff/prompt text into a shell command.

Report after launch:

```text
Issue: #<N>
base commit: <sha>
worker worktree: <path>
tmux: codex-issue-<N>
child execution context/capability match: <...>
Codex session id: <when available>
```

## Runtime-backed mode

After the required runtime MCP capabilities are accepted, prefer:

```text
Task Dispatcher
→ agent-runtime-mcp
→ RuntimeBackend
→ Codex
```

Conceptually:

```text
get/create Worker
→ set_external_reference("github:liqiangcc/agent-runtime-mcp#N")
→ send_text(canonical handoff, submit=true)
→ capture/inspect runtime as needed
```

The runtime only transports/manages the Worker. It does not claim or mutate GitHub Task state.

Switching Bootstrap → Runtime-backed mode must not change Issue lifecycle semantics.

## Tracking

GitHub is durable authority; runtime/tmux is liveness evidence.

Interpret state as:

```text
ready + no runtime
→ published, not executing here

in-progress + live runtime
→ active Worker Attempt

in-progress + dead/missing runtime
→ stale/recovery candidate; return to Reviewer/Coordinator

review
→ Worker finished durably; Reviewer is next

blocked
→ do not auto-resume

done/closed
→ Task complete; runtime is diagnostic residue only
```

Never infer completion from a quiet pane, a shell prompt, the word `done`, or Codex process exit.

Tracking output should include when available:

```text
Issue/status/owner
runtime/tmux liveness
worktree path + branch/HEAD/dirty state
child execution context
Codex session ID
latest durable Issue report
next authority
```

## Resume and recovery boundary

A dead child with `status:in-progress` is not permission to start a replacement or reuse Attempt N.

Required sequence:

```text
reconcile GitHub + branch/commits/PR/evidence + worktree/runtime
→ Reviewer/Coordinator recovery decision
→ release stale ownership if justified
→ status:ready / draft / blocked
→ next Worker claim starts Attempt N+1
```

Resume an existing Codex session only when lifecycle state and session identity make it unambiguous and safe.

## Cleanup

Do not automatically remove tmux/worktree after Worker reports. Cleanup requires:

- no active owner;
- reconciled durable GitHub state;
- no uncommitted/unpushed work that would be lost;
- explicit operator/Coordinator request or explicit repository policy.

## Forbidden authority

Dispatcher must never:

- claim the Issue;
- set `status:in-progress` on behalf of Worker;
- modify Task Contract;
- implement Task code;
- fabricate Worker reports;
- Review/ACCEPT/merge/close;
- publish another Task;
- auto-start Attempt N+1.

Dispatcher is the bridge between Control Plane handoff and Execution Plane runtime, not a second Coordinator.